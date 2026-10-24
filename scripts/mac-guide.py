#!/usr/bin/env python3
"""
mac-guide.py — guide Mike through a native Mac app by hand, the way
scripts/guide.mjs does for a web page. It brings the app forward, rings the
control he needs with a highlight, shows a tooltip for each step, works out
from the Accessibility tree when each step is done, then posts a macOS
notification. It never clicks for him. No relay or extension is involved.

USAGE:
  mac-guide.py run apps/<app>/guides/<task>.guide.json            # run and wait
  mac-guide.py run <guide.json> --no-wait                          # print {guideId} and exit
  mac-guide.py wait <guideId> [--max-wait-ms N]                    # wait for a running guide
  mac-guide.py check <guide.json>                                  # resolve every target now, show nothing
  mac-guide.py inspect <app> [--text S] [--role R] [--depth N]     # list AX controls, for writing targets

GUIDE FILE:
  {
    "title": "Grant Accessibility to Terminal",
    "app": "com.apple.systempreferences",          # bundle id or app name
    "open": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "dim": 0.25,                                    # optional screen dim around the target
    "quitOnDone": false,
    "steps": [
      { "instruction": "Turn on the switch next to Terminal.",
        "target": { "role": "AXCheckBox", "text": "Terminal" },
        "doneWhen": { "valueEquals": { "target": { "role": "AXCheckBox", "text": "Terminal" }, "value": 1 } } }
    ]
  }
  target: an AX matcher, or a list of matchers tried in order. Keys: role, subrole
    (exact), title, description, value, identifier, help, text (any of those five)
    as case-insensitive substrings, or whole values with "exact": true; index (nth
    match); within (matcher for an ancestor); window (substring of the window
    title); app (look in another app, such as a system dialog).
  doneWhen: any of elementAppears, elementGone (after it was seen), windowAppears,
    windowGone, textAppears, valueEquals {target, value}, appFrontmost, appRunning,
    appQuit, fileAppears (glob, modified after the step began), shell (exit 0,
    checked every 3 s). Without doneWhen, clicking the target finishes the step.

  A guide may hold {{name}} placeholders, filled with --set name=value.

FLAGS: --no-wait, --max-wait-ms N (default 1800000), --no-notify, --guide-id ID,
  --max-run-ms N (guide gives up after this long, default 2 h)

EXIT: 0 done, 2 skipped, 3 closed early, 4 still active at max wait, 1 error.

Needs PyObjC (/opt/homebrew/bin/python3) and Accessibility permission for the
app that launches it. Without that permission the tooltips still show, centred,
and only the non-AX doneWhen checks work.
Results: ~/.yeshie/mac-guides/<guideId>.json (YESHIE_MAC_GUIDE_DIR overrides).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mac_guide_core as core  # noqa: E402

EXIT = {'done': 0, 'skipped': 2, 'closed': 3, 'active': 4, 'starting': 4}

try:
    import ApplicationServices as AS
    import AppKit
    import objc
    from Foundation import NSObject, NSTimer
except ModuleNotFoundError as exc:  # the wait subcommand still works without PyObjC
    AS = AppKit = objc = None
    NSObject = object
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


def die(message):
    print(f'mac-guide: {message}', file=sys.stderr)
    sys.exit(1)


def need_pyobjc():
    if _IMPORT_ERROR:
        die(f"missing PyObjC module '{_IMPORT_ERROR.name}'. Use /opt/homebrew/bin/python3, "
            'or pip install pyobjc-framework-ApplicationServices pyobjc-framework-Cocoa')


# ---------------------------------------------------------------- AX access

_POINT_RE = re.compile(r'x:(-?[\d.]+) y:(-?[\d.]+)')
_SIZE_RE = re.compile(r'w:(-?[\d.]+) h:(-?[\d.]+)')


def ax_get(elem, attr):
    try:
        err, val = AS.AXUIElementCopyAttributeValue(elem, attr, None)
    except Exception:
        return None
    return val if err == 0 else None


def _ax_struct(val, kind):
    if val is None:
        return None
    try:
        ok, out = AS.AXValueGetValue(val, kind, None)
        if ok:
            return out
    except Exception:
        pass
    return None


def ax_frame(elem):
    pos, size = ax_get(elem, 'AXPosition'), ax_get(elem, 'AXSize')
    if pos is None or size is None:
        return None
    p = _ax_struct(pos, AS.kAXValueCGPointType)
    s = _ax_struct(size, AS.kAXValueCGSizeType)
    if p is not None and s is not None:
        return (float(p.x), float(p.y), float(s.width), float(s.height))
    mp, ms = _POINT_RE.search(str(pos)), _SIZE_RE.search(str(size))
    if mp and ms:
        return (float(mp[1]), float(mp[2]), float(ms[1]), float(ms[2]))
    return None


def _plain(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    try:
        return str(v)
    except Exception:
        return None


class AXTree:
    """attrs/children for core, cached for one tick (the cache also keeps nodes alive)."""

    def __init__(self):
        self.cache = {}

    def attrs(self, node):
        key = id(node)
        hit = self.cache.get(key)
        if hit is not None:
            return hit[1]
        a = {
            'role': _plain(ax_get(node, 'AXRole')),
            'subrole': _plain(ax_get(node, 'AXSubrole')),
            'title': _plain(ax_get(node, 'AXTitle')),
            'description': _plain(ax_get(node, 'AXDescription')),
            'value': _plain(ax_get(node, 'AXValue')),
            'identifier': _plain(ax_get(node, 'AXIdentifier')),
            'help': _plain(ax_get(node, 'AXHelp')),
            'frame': ax_frame(node),
        }
        self.cache[key] = (node, a)
        return a

    def children(self, node):
        kids = ax_get(node, 'AXChildren')
        return list(kids) if kids else []


def running_app(spec):
    if not spec:
        return None
    want = spec.lower()
    for app in AppKit.NSWorkspace.sharedWorkspace().runningApplications():
        bid = (app.bundleIdentifier() or '').lower()
        name = (app.localizedName() or '').lower()
        if want in (bid, name):
            return app
    return None


def app_element(spec):
    app = running_app(spec)
    if app is None:
        return None
    elem = AS.AXUIElementCreateApplication(app.processIdentifier())
    try:
        AS.AXUIElementSetMessagingTimeout(elem, 0.5)
    except Exception:
        pass
    return elem


def roots_for(app_spec, matcher):
    """Windows (optionally filtered by title) plus the menu bar for menu roles."""
    elem = app_element(app_spec)
    if elem is None:
        return []
    m = matcher if isinstance(matcher, dict) else {}
    windows = list(ax_get(elem, 'AXWindows') or [])
    if m.get('window'):
        want = m['window'].lower()
        windows = [w for w in windows if want in str(ax_get(w, 'AXTitle') or '').lower()]
    roots = windows
    if str(m.get('role', '')).startswith('AXMenu'):
        bar = ax_get(elem, 'AXMenuBar')
        if bar is not None:
            roots = roots + [bar]
    return roots


def window_titles(app_spec):
    elem = app_element(app_spec)
    if elem is None:
        return []
    return [str(ax_get(w, 'AXTitle') or '') for w in (ax_get(elem, 'AXWindows') or [])]


class Probe:
    """Live state for core.is_step_done, scoped to one app."""

    def __init__(self, app_spec, ax_ok):
        self.app = app_spec
        self.ax_ok = ax_ok
        self.tree = AXTree()

    def find(self, matcher):
        if not self.ax_ok:
            return None
        if isinstance(matcher, list):
            for m in matcher:
                hit = self.find(m)
                if hit is not None:
                    return hit
            return None
        app = matcher.get('app') or self.app
        return core.find(roots_for(app, matcher), matcher, self.tree.attrs, self.tree.children)

    def frame(self, node):
        return self.tree.attrs(node).get('frame')

    def value(self, node):
        return self.tree.attrs(node).get('value')

    def window_titles(self):
        return window_titles(self.app) if self.ax_ok else []

    def text(self):
        if not self.ax_ok:
            return ''
        return core.collect_text(roots_for(self.app, {}), self.tree.attrs, self.tree.children)

    def frontmost(self):
        app = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        return (app.bundleIdentifier(), app.localizedName()) if app else (None, None)

    def running(self, spec):
        return running_app(spec) is not None

    def shell(self, cmd):
        try:
            return subprocess.run(cmd, shell=True, capture_output=True, timeout=10).returncode == 0
        except Exception:
            return False


def ax_trusted():
    try:
        return bool(AS.AXIsProcessTrusted())
    except Exception:
        return False


def notify(title, body):
    script = f'display notification {json.dumps(body)} with title {json.dumps(title)} sound name "Glass"'
    subprocess.run(['osascript', '-e', script], capture_output=True)


def bring_up(guide):
    """Open the guide's URL/path or launch the app, and wait until it is running."""
    if guide.get('open'):
        cmd = ['open', guide['open']]
    elif '.' in guide['app'] and ' ' not in guide['app']:
        cmd = ['open', '-b', guide['app']]
    else:
        cmd = ['open', '-a', guide['app']]
    subprocess.run(cmd, capture_output=True)
    if guide.get('app'):
        deadline = time.time() + 15
        while time.time() < deadline and running_app(guide['app']) is None:
            time.sleep(0.25)


# ---------------------------------------------------------------- overlay

if AppKit is not None:

    def screen_frames():
        return [tuple(map(float, (s.frame().origin.x, s.frame().origin.y,
                                  s.frame().size.width, s.frame().size.height)))
                for s in AppKit.NSScreen.screens()]

    def primary_height():
        return float(AppKit.NSScreen.screens()[0].frame().size.height)

    class HoleView(AppKit.NSView):
        def initWithFrame_(self, frame):
            self = objc.super(HoleView, self).initWithFrame_(frame)
            if self is None:
                return None
            self.hole = None  # local Cocoa rect (x, y, w, h)
            self.dim = 0.0
            return self

        def drawRect_(self, rect):
            b = self.bounds()
            if self.dim > 0:
                AppKit.NSColor.colorWithCalibratedWhite_alpha_(0.0, self.dim).set()
                path = AppKit.NSBezierPath.bezierPathWithRect_(b)
                if self.hole:
                    x, y, w, h = self.hole
                    path.appendBezierPath_(AppKit.NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(
                        ((x - 4, y - 4), (w + 8, h + 8)), 8, 8))
                    path.setWindingRule_(getattr(AppKit, 'NSWindingRuleEvenOdd', 1))
                path.fill()
            if self.hole:
                x, y, w, h = self.hole
                AppKit.NSColor.systemOrangeColor().set()
                ring = AppKit.NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(
                    ((x - 5, y - 5), (w + 10, h + 10)), 9, 9)
                ring.setLineWidth_(3.0)
                ring.stroke()

    def stop_app():
        """End app.run() so the caller can print the result (terminate_ would exit the process)."""
        app = AppKit.NSApp
        app.stop_(None)
        ev = AppKit.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
            AppKit.NSEventTypeApplicationDefined, (0, 0), 0, 0, 0, None, 0, 0, 0)
        app.postEvent_atStart_(ev, True)

    class FirstMouseButton(AppKit.NSButton):
        def acceptsFirstMouse_(self, event):
            return True

    def _panel(frame, level, ignores_mouse):
        style = AppKit.NSWindowStyleMaskBorderless | AppKit.NSWindowStyleMaskNonactivatingPanel
        p = AppKit.NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(
            frame, style, AppKit.NSBackingStoreBuffered, False)
        p.setOpaque_(False)
        p.setBackgroundColor_(AppKit.NSColor.clearColor())
        p.setHasShadow_(not ignores_mouse)
        p.setIgnoresMouseEvents_(ignores_mouse)
        p.setLevel_(level)
        p.setHidesOnDeactivate_(False)
        p.setFloatingPanel_(True)
        p.setBecomesKeyOnlyIfNeeded_(True)
        p.setCollectionBehavior_(
            AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces
            | AppKit.NSWindowCollectionBehaviorStationary
            | AppKit.NSWindowCollectionBehaviorFullScreenAuxiliary
            | AppKit.NSWindowCollectionBehaviorIgnoresCycle)
        return p

    def _label(text, size, bold=False, color=None):
        f = AppKit.NSTextField.wrappingLabelWithString_(text)
        f.setFont_(AppKit.NSFont.boldSystemFontOfSize_(size) if bold else AppKit.NSFont.systemFontOfSize_(size))
        f.setTextColor_(color or AppKit.NSColor.whiteColor())
        f.setSelectable_(False)
        return f

    TIP_W = 340
    PAD = 14

    class GuideRunner(NSObject):
        def initWithGuide_id_opts_(self, guide, guide_id, opts):
            self = objc.super(GuideRunner, self).init()
            if self is None:
                return None
            self.guide = guide
            self.guide_id = guide_id
            self.opts = opts
            self.steps = guide['steps']
            self.index = -1
            self.completed = 0
            self.ax_ok = ax_trusted()
            self.watch = None
            self.clicked = False
            self.target_rect = None  # Cocoa coords of the current target
            self.missing_since = None
            self.finished = False
            self.started = time.time()
            self.hole_panels = []
            self.tip = None
            self.timer = None
            self.monitor = None
            return self

        # -- lifecycle

        @objc.python_method
        def start(self):
            self.save('active')
            dim = float(self.guide.get('dim', 0.0))
            for sf in screen_frames():
                p = _panel(((sf[0], sf[1]), (sf[2], sf[3])), AppKit.NSStatusWindowLevel, True)
                v = HoleView.alloc().initWithFrame_(((0, 0), (sf[2], sf[3])))
                v.dim = dim
                p.setContentView_(v)
                p.orderFrontRegardless()
                self.hole_panels.append((p, v, sf))
            self.tip = _panel(((0, 0), (TIP_W, 120)), AppKit.NSStatusWindowLevel + 1, False)
            if self.ax_ok:
                self.monitor = AppKit.NSEvent.addGlobalMonitorForEventsMatchingMask_handler_(
                    AppKit.NSEventMaskLeftMouseDown, self.onGlobalClick_)
            self.show_step(0)
            self.timer = NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
                0.6, self, 'tick:', None, True)

        @objc.python_method
        def save(self, status, **extra):
            core.write_result(self.guide_id, {
                'guideId': self.guide_id, 'title': self.guide.get('title', ''),
                'status': status, 'stepsCompleted': self.completed,
                'totalSteps': len(self.steps), 'currentStep': max(self.index, 0),
                'axTrusted': self.ax_ok, 'pid': os.getpid(),
                'startedAt': self.started, 'updatedAt': time.time(), **extra})

        @objc.python_method
        def finish(self, status, **extra):
            if self.finished:
                return
            self.finished = True
            if self.timer:
                self.timer.invalidate()
            if self.monitor:
                AppKit.NSEvent.removeMonitor_(self.monitor)
            for p, _, _ in self.hole_panels:
                p.orderOut_(None)
            if self.tip:
                self.tip.orderOut_(None)
            self.save(status, **extra)
            title = self.guide.get('title') or 'Guide'
            if not self.opts.get('no_notify'):
                words = {'done': 'Done', 'skipped': 'Skipped', 'closed': 'Stopped'}
                notify('Yeshie', f'{words.get(status, status)}: {title} '
                                 f'({self.completed}/{len(self.steps)} steps)')
            if status == 'done' and self.guide.get('quitOnDone') and self.guide.get('app'):
                app = running_app(self.guide['app'])
                if app:
                    app.terminate()
            stop_app()

        # -- steps

        @objc.python_method
        def show_step(self, i):
            self.index = i
            self.watch = core.StepWatch()
            self.clicked = False
            self.missing_since = None
            self.save('active')
            self.render(note=None)
            self.tick_(None)

        @objc.python_method
        def step_done(self):
            self.completed = self.index + 1
            self.save('active')
            if self.completed >= len(self.steps):
                self.render(note='Done.')
                self.performSelector_withObject_afterDelay_('finishDone:', None, 0.8)
            else:
                self.render(note='Done. Next step…')
                self.performSelector_withObject_afterDelay_('nextStep:', None, 0.6)

        def finishDone_(self, _):
            self.finish('done')

        def nextStep_(self, _):
            self.show_step(self.index + 1)

        # -- buttons

        def didIt_(self, sender):
            self.step_done()

        def skip_(self, sender):
            self.finish('skipped', skippedAt=self.index)

        def stop_(self, sender):
            self.finish('closed', closedAt=self.index)

        def onGlobalClick_(self, event):
            r = self.target_rect
            if not r:
                return
            loc = AppKit.NSEvent.mouseLocation()
            if r[0] <= loc.x <= r[0] + r[2] and r[1] <= loc.y <= r[1] + r[3]:
                self.clicked = True

        # -- the loop

        def tick_(self, timer):
            if self.finished or self.index < 0:
                return
            if time.time() - self.started > self.opts.get('max_run_ms', 7_200_000) / 1000:
                self.finish('closed', reason='expired')
                return
            step = self.steps[self.index]
            app = step.get('app') or self.guide.get('app')
            probe = Probe(app, self.ax_ok)
            target = step.get('target')
            rect = None
            if target and self.ax_ok:
                node = probe.find(target)
                frame = probe.frame(node) if node is not None else None
                if frame:
                    rect = core.ax_to_cocoa(frame, primary_height())
            self.target_rect = rect
            note = None
            if target and not rect:
                self.missing_since = self.missing_since or time.time()
                if not self.ax_ok:
                    note = "Can't see controls (no Accessibility permission). Do it, then click I did it."
                elif time.time() - self.missing_since > 3:
                    note = "Can't find that control yet. Do it anyway, then click I did it."
            else:
                self.missing_since = None
            self.place(rect, note)
            done = step.get('doneWhen')
            if done:
                if core.is_step_done(done, self.watch, probe):
                    self.step_done()
            elif self.clicked:
                self.step_done()

        # -- drawing

        @objc.python_method
        def place(self, rect, note):
            for _, v, sf in self.hole_panels:
                if rect and sf[0] <= rect[0] + rect[2] / 2 <= sf[0] + sf[2] \
                        and sf[1] <= rect[1] + rect[3] / 2 <= sf[1] + sf[3]:
                    hole = (rect[0] - sf[0], rect[1] - sf[1], rect[2], rect[3])
                else:
                    hole = None
                if hole != v.hole:
                    v.hole = hole
                    v.setNeedsDisplay_(True)
            if note != getattr(self, '_note', None):
                self.render(note)
            size = self.tip.frame().size
            screens = screen_frames()
            screen = screens[0]
            if rect:
                for sf in screens:
                    if sf[0] <= rect[0] <= sf[0] + sf[2] and sf[1] <= rect[1] <= sf[1] + sf[3]:
                        screen = sf
            ox, oy = core.place_tooltip(rect, (size.width, size.height), screen)
            self.tip.setFrameOrigin_((ox, oy))
            self.tip.orderFrontRegardless()

        @objc.python_method
        def render(self, note):
            self._note = note
            step = self.steps[self.index]
            title = self.guide.get('title') or 'Yeshie'
            header = _label(f'{title}  ·  Step {self.index + 1} of {len(self.steps)}', 11, True,
                            AppKit.NSColor.colorWithCalibratedWhite_alpha_(1.0, 0.7))
            body = _label(step['instruction'], 14)
            inner = TIP_W - 2 * PAD
            for f in (header, body):
                f.setPreferredMaxLayoutWidth_(inner)
            status = _label(note, 11, False, AppKit.NSColor.systemYellowColor()) if note else None
            if status:
                status.setPreferredMaxLayoutWidth_(inner)
            hh = header.fittingSize().height
            bh = body.fittingSize().height
            sh = status.fittingSize().height if status else 0
            btn_h = 28
            height = PAD + btn_h + 10 + (sh + 6 if status else 0) + bh + 8 + hh + PAD
            content = AppKit.NSView.alloc().initWithFrame_(((0, 0), (TIP_W, height)))
            content.setWantsLayer_(True)
            content.layer().setBackgroundColor_(
                AppKit.NSColor.colorWithCalibratedRed_green_blue_alpha_(0.12, 0.12, 0.14, 0.96).CGColor())
            content.layer().setCornerRadius_(12)
            content.layer().setBorderWidth_(1.5)
            content.layer().setBorderColor_(AppKit.NSColor.systemOrangeColor().CGColor())
            y = PAD
            x = TIP_W - PAD
            has_done = bool(step.get('doneWhen'))
            for label, sel in ((('I did it' if has_done else 'Next'), 'didIt:'), ('Skip', 'skip:'), ('Stop', 'stop:')):
                b = FirstMouseButton.alloc().initWithFrame_(((0, 0), (10, btn_h)))
                b.setTitle_(label)
                b.setBezelStyle_(AppKit.NSBezelStyleRounded)
                b.setTarget_(self)
                b.setAction_(sel)
                b.sizeToFit()
                w = b.frame().size.width
                x -= w
                b.setFrameOrigin_((x, y))
                if label in ('I did it', 'Next'):
                    b.setKeyEquivalent_('\r')
                content.addSubview_(b)
                x -= 6
            y += btn_h + 10
            if status:
                status.setFrame_(((PAD, y), (inner, sh)))
                content.addSubview_(status)
                y += sh + 6
            body.setFrame_(((PAD, y), (inner, bh)))
            content.addSubview_(body)
            y += bh + 8
            header.setFrame_(((PAD, y), (inner, hh)))
            content.addSubview_(header)
            origin = self.tip.frame().origin
            self.tip.setFrame_display_(((origin.x, origin.y), (TIP_W, height)), True)
            self.tip.setContentView_(content)


# ---------------------------------------------------------------- commands

def parse_sets(pairs):
    out = {}
    for kv in pairs or []:
        if '=' not in kv:
            die(f'--set takes name=value, got {kv!r}')
        k, v = kv.split('=', 1)
        out[k] = v
    return out


def cmd_run(args):
    need_pyobjc()
    try:
        guide = core.load_guide(args.guide, parse_sets(args.set))
    except (OSError, ValueError) as exc:
        die(str(exc))
    guide_id = args.guide_id or f'mg_{int(time.time())}_{secrets.token_hex(3)}'
    if args.no_wait:
        os.makedirs(core.result_dir(), exist_ok=True)
        core.write_result(guide_id, {'guideId': guide_id, 'status': 'starting',
                                     'title': guide.get('title', ''), 'updatedAt': time.time()})
        log = open(os.path.join(core.result_dir(), f'{guide_id}.log'), 'w')
        child = [sys.executable, os.path.abspath(__file__), 'run', args.guide, '--guide-id', guide_id,
                 '--max-run-ms', str(args.max_run_ms)] + (['--no-notify'] if args.no_notify else [])
        for kv in args.set:
            child += ['--set', kv]
        proc = subprocess.Popen(child, stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        deadline = time.time() + 20
        res = None
        while time.time() < deadline:
            res = core.read_result(guide_id)
            if res and res.get('status') != 'starting':
                break
            if proc.poll() is not None:
                break
            time.sleep(0.2)
        res = core.read_result(guide_id) or {}
        ok = res.get('status') == 'active'
        print(json.dumps({'ok': ok, 'guideId': guide_id, 'pid': proc.pid,
                          'status': res.get('status'), 'axTrusted': res.get('axTrusted')}))
        sys.exit(0 if ok else 1)

    bring_up(guide)
    app = AppKit.NSApplication.sharedApplication()
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
    runner = GuideRunner.alloc().initWithGuide_id_opts_(guide, guide_id, {
        'no_notify': args.no_notify, 'max_run_ms': args.max_run_ms})
    if not runner.ax_ok:
        print('mac-guide: no Accessibility permission; tooltips will be centred', file=sys.stderr)
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: runner.finish('closed', reason='signal'))
    runner.start()
    print(json.dumps({'ok': True, 'guideId': guide_id}), file=sys.stderr)
    app.run()
    res = core.read_result(guide_id) or {}
    print(json.dumps(res))
    sys.exit(EXIT.get(res.get('status'), 1))


def cmd_wait(args):
    deadline = time.time() + args.max_wait_ms / 1000
    res = None
    while True:
        res = core.read_result(args.guide_id)
        if res is None:
            die(f'no guide {args.guide_id} in {core.result_dir()}')
        if res.get('status') == 'active' and not core.pid_alive(res.get('pid')):
            res['status'] = 'closed'
            res['reason'] = 'guide process exited'
            break
        if res.get('status') not in ('active', 'starting') or time.time() >= deadline:
            break
        time.sleep(1)
    print(json.dumps(res))
    sys.exit(EXIT.get(res.get('status'), 1))


def cmd_check(args):
    need_pyobjc()
    try:
        guide = core.load_guide(args.guide, parse_sets(args.set))
    except (OSError, ValueError) as exc:
        die(str(exc))
    if not ax_trusted():
        die('no Accessibility permission for this process')
    out = []
    for i, step in enumerate(guide['steps']):
        app = step.get('app') or guide.get('app')
        probe = Probe(app, True)
        row = {'step': i, 'running': running_app(app) is not None}
        if step.get('target'):
            node = probe.find(step['target'])
            row['target'] = probe.frame(node) if node is not None else None
        done = step.get('doneWhen') or {}
        for key in ('elementAppears', 'elementGone'):
            if key in done:
                row[key] = probe.find(done[key]) is not None
        if 'valueEquals' in done:
            node = probe.find(done['valueEquals']['target'])
            row['valueNow'] = probe.value(node) if node is not None else None
        out.append(row)
    print(json.dumps(out, indent=1))


def cmd_inspect(args):
    need_pyobjc()
    if not ax_trusted():
        die('no Accessibility permission for this process')
    tree = AXTree()
    m = {'role': args.role} if args.role else {}
    roots = roots_for(args.app, {**m, 'window': args.window} if args.window else m)
    if args.menus:
        elem = app_element(args.app)
        bar = ax_get(elem, 'AXMenuBar') if elem is not None else None
        roots = roots + ([bar] if bar is not None else [])
    if not roots:
        die(f'{args.app} is not running or has no windows')
    n = 0
    for root in roots:
        for node, anc in core.walk(root, tree.children, max_depth=args.depth):
            a = tree.attrs(node)
            if args.role and a.get('role') != args.role:
                continue
            if args.text and not core.node_matches(a, {'text': args.text}):
                continue
            if not args.all and not any(a.get(k) for k in core.TEXT_KEYS):
                continue
            row = {k: v for k, v in a.items() if v not in (None, '')}
            row['depth'] = len(anc)
            print(json.dumps(row, default=str))
            n += 1
            if n >= args.limit:
                return


def main(argv=None):
    p = argparse.ArgumentParser(description='Guide Mike through a native Mac app')
    sub = p.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('guide')
    r.add_argument('--no-wait', action='store_true')
    r.add_argument('--no-notify', action='store_true')
    r.add_argument('--guide-id')
    r.add_argument('--set', action='append', default=[], metavar='NAME=VALUE', help='fill {{NAME}} in the guide')
    r.add_argument('--max-run-ms', type=int, default=7_200_000)
    w = sub.add_parser('wait')
    w.add_argument('guide_id')
    w.add_argument('--max-wait-ms', type=int, default=1_800_000)
    c = sub.add_parser('check')
    c.add_argument('guide')
    c.add_argument('--set', action='append', default=[], metavar='NAME=VALUE')
    i = sub.add_parser('inspect')
    i.add_argument('app')
    i.add_argument('--text')
    i.add_argument('--role')
    i.add_argument('--window')
    i.add_argument('--menus', action='store_true')
    i.add_argument('--all', action='store_true', help='include nodes with no text')
    i.add_argument('--depth', type=int, default=core.MAX_DEPTH)
    i.add_argument('--limit', type=int, default=400)
    args = p.parse_args(argv)
    {'run': cmd_run, 'wait': cmd_wait, 'check': cmd_check, 'inspect': cmd_inspect}[args.cmd](args)


if __name__ == '__main__':
    main()
