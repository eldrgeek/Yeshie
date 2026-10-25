"""
mac_guide_core.py — the parts of a Mac guide that need no macOS: reading and
checking a guide file, matching Accessibility (AX) nodes against a target,
deciding when a step is done, and placing the overlay.

mac-guide.py supplies the AX side through a small accessor:
  attrs(node)    -> dict with role, subrole, title, description, value,
                    identifier, help, frame ((x, y, w, h) in AX coords or None)
  children(node) -> list of child nodes
so the logic here runs against plain dicts in tests.
"""

from __future__ import annotations

import glob
import json
import os
import re
import time

TEXT_KEYS = ('title', 'description', 'value', 'identifier', 'help')
MATCHER_KEYS = {'role', 'subrole', 'title', 'description', 'value', 'identifier',
                'help', 'text', 'exact', 'matchCase', 'index', 'within', 'window', 'app'}
CLIP_ROLES = ('AXScrollArea', 'AXWindow')
DONE_KEYS = {'elementAppears', 'elementGone', 'windowAppears', 'windowGone',
             'textAppears', 'valueEquals', 'appFrontmost', 'appRunning',
             'appQuit', 'fileAppears', 'shell'}
MAX_NODES = 6000
MAX_DEPTH = 40


class GuideError(ValueError):
    pass


# ---------------------------------------------------------------- guide file

def _check_matcher(m, where):
    if isinstance(m, list):
        if not m:
            raise GuideError(f'{where}: empty fallback list')
        for i, sub in enumerate(m):
            _check_matcher(sub, f'{where}[{i}]')
        return
    if not isinstance(m, dict):
        raise GuideError(f'{where}: a target is an object or a list of objects')
    unknown = set(m) - MATCHER_KEYS
    if unknown:
        raise GuideError(f'{where}: unknown keys {sorted(unknown)}')
    if not set(m) & {'role', 'subrole', 'title', 'description', 'value', 'identifier', 'help', 'text'}:
        raise GuideError(f'{where}: give at least one of role/title/description/value/identifier/help/text')
    if 'within' in m:
        _check_matcher(m['within'], f'{where}.within')


def fill_vars(text, values):
    """Replace {{name}} with values[name]; a name with no value is an error."""
    def sub(m):
        key = m.group(1)
        if key not in values:
            raise GuideError(f'guide needs --set {key}=...')
        return json.dumps(str(values[key]))[1:-1]
    return re.sub(r'\{\{\s*([A-Za-z_][\w-]*)\s*\}\}', sub, text)


def load_guide(path, values=None):
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    guide = json.loads(fill_vars(text, values or {}))
    return check_guide(guide)


def check_guide(guide):
    if not isinstance(guide, dict):
        raise GuideError('a guide is a JSON object')
    if not guide.get('app') and not guide.get('open'):
        raise GuideError('give "app" (bundle id or app name) and/or "open" (URL or path)')
    steps = guide.get('steps')
    if not isinstance(steps, list) or not steps:
        raise GuideError('give at least one step')
    for i, step in enumerate(steps):
        where = f'steps[{i}]'
        text = step.get('instruction')
        if not isinstance(text, str) or not text.strip():
            raise GuideError(f'{where}: instruction is required')
        if len(text) > 500:
            raise GuideError(f'{where}: instruction is over 500 characters')
        target = step.get('target')
        if target:
            _check_matcher(target, f'{where}.target')
        done = step.get('doneWhen')
        if done is not None:
            if not isinstance(done, dict) or not done:
                raise GuideError(f'{where}: doneWhen is a non-empty object')
            unknown = set(done) - DONE_KEYS
            if unknown:
                raise GuideError(f'{where}.doneWhen: unknown keys {sorted(unknown)}')
            for key in ('elementAppears', 'elementGone'):
                if key in done:
                    _check_matcher(done[key], f'{where}.doneWhen.{key}')
            if 'valueEquals' in done:
                ve = done['valueEquals']
                if not isinstance(ve, dict) or 'target' not in ve or 'value' not in ve:
                    raise GuideError(f'{where}.doneWhen.valueEquals: give target and value')
                _check_matcher(ve['target'], f'{where}.doneWhen.valueEquals.target')
        if not target and not done:
            raise GuideError(f'{where}: a step with no target needs doneWhen')
    if not (steps[-1].get('doneWhen')):
        raise GuideError('the last step needs doneWhen, so the guide can confirm the task happened')
    return guide


# ---------------------------------------------------------------- matching

def _norm(v, keep_case=False):
    if v is None:
        return ''
    if isinstance(v, bool):
        return '1' if v else '0'
    v = str(v).strip()
    return v if keep_case else v.lower()


def node_matches(a, m):
    """True when one node's attrs satisfy matcher m (ignoring within/index/window)."""
    for key in ('role', 'subrole'):
        if key in m and a.get(key) != m[key]:
            return False
    exact = bool(m.get('exact'))
    case = bool(m.get('matchCase'))
    for key in ('title', 'description', 'value', 'identifier', 'help'):
        if key in m:
            want, have = _norm(m[key], case), _norm(a.get(key), case)
            if (have != want) if exact else (want not in have):
                return False
    if 'text' in m:
        want = _norm(m['text'], case)
        haves = [_norm(a.get(k), case) for k in TEXT_KEYS]
        if not any((h == want) if exact else (want in h) for h in haves if h):
            return False
    return True


def walk(root, children, max_depth=MAX_DEPTH, max_nodes=MAX_NODES):
    """Depth-first (node, ancestors) pairs, bounded so a huge tree can't stall a tick."""
    out = []
    stack = [(root, ())]
    while stack and len(out) < max_nodes:
        node, anc = stack.pop()
        out.append((node, anc))
        if len(anc) >= max_depth:
            continue
        kids = children(node) or []
        for kid in reversed(list(kids)):
            stack.append((kid, anc + (node,)))
    return out


def find(roots, matcher, attrs, children, visible_only=True):
    """First node under roots matching matcher; a list matcher tries each in turn."""
    if not matcher:
        return None
    if isinstance(matcher, list):
        for sub in matcher:
            hit = find(roots, sub, attrs, children, visible_only)
            if hit is not None:
                return hit
        return None
    index = int(matcher.get('index', 0))
    within = matcher.get('within')
    withins = within if isinstance(within, list) else [within] if within else []
    hits = []
    for root in roots:
        for node, anc in walk(root, children):
            a = attrs(node)
            if not node_matches(a, matcher):
                continue
            if visible_only and not (usable_frame(a.get('frame'))
                                     and not clipped(a['frame'], [attrs(x) for x in anc])):
                continue
            if withins and not any(node_matches(attrs(x), w) for x in anc for w in withins):
                continue
            hits.append(node)
            if len(hits) > index:
                return hits[index]
    return None


def usable_frame(frame):
    return bool(frame) and frame[2] > 1 and frame[3] > 1 and frame[0] > -10000 and frame[1] > -10000


def clipped(frame, ancestors):
    """True when frame's centre lies outside a scroll area or window it sits in,
    which is how a row scrolled out of view looks: AX still reports its frame."""
    cx, cy = frame[0] + frame[2] / 2, frame[1] + frame[3] / 2
    for a in ancestors:
        f = a.get('frame')
        if a.get('role') in CLIP_ROLES and usable_frame(f):
            if not (f[0] <= cx <= f[0] + f[2] and f[1] <= cy <= f[1] + f[3]):
                return True
    return False


def collect_text(roots, attrs, children):
    parts = []
    for root in roots:
        for node, _ in walk(root, children):
            a = attrs(node)
            for k in ('title', 'description', 'value'):
                v = a.get(k)
                if isinstance(v, str) and v:
                    parts.append(v)
    return '\n'.join(parts).lower()


# ---------------------------------------------------------------- done checks

class StepWatch:
    """Per-step memory: elements/windows seen (for *Gone) and when the step began."""

    def __init__(self):
        self.started = time.time()
        self.seen_element = False
        self.seen_window = False
        self.last_shell = 0.0
        self.shell_ok = False


def file_appeared(pattern, since):
    for path in glob.glob(os.path.expanduser(pattern)):
        try:
            if os.path.getmtime(path) >= since - 1:
                return path
        except OSError:
            pass
    return None


def is_step_done(done, watch, probe):
    """
    Any condition in done holding finishes the step (same rule as browser guides).
    probe supplies the live state: find(matcher) -> node|None, value(node),
    window_titles() -> [str], text() -> str, frontmost() -> (bundle, name),
    running(app) -> bool, shell(cmd) -> bool.
    """
    if not done:
        return False
    hit = False
    if 'elementGone' in done:
        present = probe.find(done['elementGone']) is not None
        if present:
            watch.seen_element = True
        elif watch.seen_element:
            hit = True
    if 'windowGone' in done:
        want = done['windowGone'].lower()
        present = any(want in t.lower() for t in probe.window_titles())
        if present:
            watch.seen_window = True
        elif watch.seen_window:
            hit = True
    if hit:
        return True
    if 'elementAppears' in done and probe.find(done['elementAppears']) is not None:
        return True
    if 'windowAppears' in done:
        want = done['windowAppears'].lower()
        if any(want in t.lower() for t in probe.window_titles()):
            return True
    if 'valueEquals' in done:
        node = probe.find(done['valueEquals']['target'])
        if node is not None and _norm(probe.value(node)) == _norm(done['valueEquals']['value']):
            return True
    if 'textAppears' in done and done['textAppears'].lower() in probe.text():
        return True
    if 'appFrontmost' in done:
        want = done['appFrontmost'].lower()
        if any(want == (x or '').lower() for x in probe.frontmost()):
            return True
    if 'appRunning' in done and probe.running(done['appRunning']):
        return True
    if 'appQuit' in done and not probe.running(done['appQuit']):
        return True
    if 'fileAppears' in done and file_appeared(done['fileAppears'], watch.started):
        return True
    if 'shell' in done:
        now = time.time()
        if now - watch.last_shell >= 3:
            watch.last_shell = now
            watch.shell_ok = probe.shell(done['shell'])
        if watch.shell_ok:
            return True
    return False


# ---------------------------------------------------------------- geometry

def ax_to_cocoa(frame, primary_height):
    """AX frames have a top-left origin on the primary screen; Cocoa is bottom-left."""
    x, y, w, h = frame
    return (x, primary_height - y - h, w, h)


def place_tooltip(target, size, screen, gap=12):
    """
    Cocoa-coords origin for a tooltip of size (w, h) next to target (x, y, w, h)
    inside screen (x, y, w, h): below the target if it fits, else above, else to
    the right, else the left; clamped to the screen. No target: top centre.
    """
    tw, th = size
    sx, sy, sw, sh = screen
    if not target:
        return (sx + (sw - tw) / 2, sy + sh - th - 80)
    x, y, w, h = target
    cx = x + w / 2 - tw / 2
    options = [
        (cx, y - gap - th),            # below (Cocoa y grows upward)
        (cx, y + h + gap),             # above
        (x + w + gap, y + h / 2 - th / 2),  # right
        (x - gap - tw, y + h / 2 - th / 2),  # left
    ]
    for ox, oy in options:
        if sx <= ox and ox + tw <= sx + sw and sy <= oy and oy + th <= sy + sh:
            return (ox, oy)
    ox, oy = options[0]
    ox = min(max(ox, sx + 8), sx + sw - tw - 8)
    oy = min(max(oy, sy + 8), sy + sh - th - 8)
    return (ox, oy)


# ---------------------------------------------------------------- results

def result_dir():
    return os.path.expanduser(os.environ.get('YESHIE_MAC_GUIDE_DIR', '~/.yeshie/mac-guides'))


def result_path(guide_id):
    return os.path.join(result_dir(), f'{guide_id}.json')


def write_result(guide_id, payload):
    os.makedirs(result_dir(), exist_ok=True)
    path = result_path(guide_id)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh)
    os.replace(tmp, path)


def read_result(guide_id):
    try:
        with open(result_path(guide_id), encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
