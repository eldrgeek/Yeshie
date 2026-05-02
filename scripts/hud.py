#!/usr/bin/env python3
"""
hud.py — Floating always-on-top status panel for Yeshie job tracking.
- NSPanel: stays above all windows, never steals focus
- WKWebView: loads localhost:3333/hud (Socket.IO live updates)
- Listens on localhost:3334 for POST /show /hide /reload  GET /wv-status
- No Dock icon

Usage: python3 hud.py [--port 3334]
"""
import sys
import json
import queue
import subprocess
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import objc
import AppKit
from Foundation import NSMakeRect, NSURL, NSURLRequest, NSTimer, NSRunLoop

AFK_THRESHOLD_S = 600  # 10 minutes of user idle → auto-surface HUD


def _get_idle_seconds():
    try:
        result = subprocess.run(
            ['ioreg', '-c', 'IOHIDSystem'],
            capture_output=True, text=True, timeout=3,
        )
        for line in result.stdout.split('\n'):
            if 'HIDIdleTime' in line:
                ns = int(line.split('=')[-1].strip())
                return ns / 1_000_000_000
    except Exception:
        pass
    return 0

# WebKit isn't a top-level pyobjc package — load via bundle
_wk = {}
objc.loadBundle('WebKit',
    bundle_path='/System/Library/Frameworks/WebKit.framework',
    module_globals=_wk)
WKWebView              = _wk['WKWebView']
WKWebViewConfiguration = _wk['WKWebViewConfiguration']

# Subclass so first mouse click on a non-activating panel reaches HTML buttons
# (default acceptsFirstMouse: returns NO, so AppKit eats the click as an "activate
# the window" pass and never dispatches mouseDown: into the WKWebView content).
class ClickableWebView(WKWebView):
    def acceptsFirstMouse_(self, event):
        return True

# Register block signature for evaluateJavaScript:completionHandler:
# Signature: void (^)(id result, NSError *error)
objc.registerMetaDataForSelector(
    b'WKWebView',
    b'evaluateJavaScript:completionHandler:',
    {
        'arguments': {
            2 + 1: {  # arg index 3 = the block (after self, _cmd, jsString)
                'callable': {
                    'retval': {'type': b'v'},
                    'arguments': {
                        0: {'type': b'^v'},  # block self
                        1: {'type': b'@'},   # id result
                        2: {'type': b'@'},   # NSError* error
                    },
                },
            },
        },
    },
)

HUD_URL   = "http://localhost:3333/hud"
CTRL_PORT = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--port' else 3334
POS_FILE  = "/tmp/yeshie-hud-pos.json"

panel   = None   # global NSPanel reference
webview = None   # global WKWebView reference

# Queue for dispatching work to the main thread from the HTTP server thread
_main_queue = queue.Queue()

# ── Control server (POST /show /hide /reload, GET /wv-status) ────────────────

def _show_panel():
    """Bring the HUD panel forward on the current Space, without stealing focus."""
    if not panel:
        return
    # Move to whichever Space the user is on right now (Stationary would pin it
    # to its original Space and Mike would never see it after switching).
    panel.setCollectionBehavior_(
        AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces |
        AppKit.NSWindowCollectionBehaviorStationary
    )
    # NSStatusWindowLevel (25) sits above NSFloatingWindowLevel (3) and full-screen apps.
    panel.setLevel_(AppKit.NSStatusWindowLevel)
    # orderFrontRegardless reliably surfaces a NonactivatingPanel; makeKey is a no-op for those.
    panel.orderFrontRegardless()
    print(f"[hud] _show_panel: orderFrontRegardless called, visible={panel.isVisible()}", flush=True)

class CtrlHandler(BaseHTTPRequestHandler):
    def _handle(self, path):
        if path == '/show':
            _main_queue.put(_show_panel)
        elif path == '/hide':
            _main_queue.put(lambda: panel and panel.orderOut_(None))
        elif path == '/reload':
            def _reload():
                if webview:
                    webview.loadRequest_(NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL)))
                _show_panel()
            _main_queue.put(_reload)

    def do_POST(self):
        if self.path == '/eval':
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length else b''
            try:
                payload = json.loads(raw.decode('utf-8') or '{}')
                js_src = payload.get('js', '')
            except Exception as e:
                self.send_response(400); self.send_header('Content-Type','application/json'); self.end_headers()
                self.wfile.write(json.dumps({'error': f'bad JSON: {e}'}).encode())
                return
            holder = [None]
            ev = threading.Event()
            def do_eval():
                try:
                    if not webview:
                        holder[0] = {'error': 'no webview'}
                        ev.set(); return
                    def completion(result, err):
                        if err is not None:
                            try:
                                holder[0] = {'error': str(err.localizedDescription())}
                            except Exception:
                                holder[0] = {'error': repr(err)}
                        else:
                            try:
                                # Result may be NS types — coerce via str() then attempt JSON parse
                                if result is None:
                                    holder[0] = {'result': None}
                                else:
                                    s = str(result)
                                    try:
                                        holder[0] = {'result': json.loads(s)}
                                    except Exception:
                                        holder[0] = {'result': s}
                            except Exception as e:
                                holder[0] = {'error': f'coerce: {e}'}
                        ev.set()
                    webview.evaluateJavaScript_completionHandler_(js_src, completion)
                except Exception as e:
                    holder[0] = {'error': f'dispatch: {e}'}
                    ev.set()
            _main_queue.put(do_eval)
            ev.wait(timeout=5.0)
            body = json.dumps(holder[0] or {'error': 'timeout'}).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
        self._handle(self.path)

    def do_GET(self):
        # Allow GET for /show /hide /reload too — easier for `fetch()` and `curl` callers.
        if self.path in ('/show', '/hide', '/reload'):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            self._handle(self.path)
            return
        if self.path == '/wv-status':
            result_holder = [None]
            ev = threading.Event()
            js = ("JSON.stringify({"
                  "loaded:true,"
                  "conn:document.getElementById('conn')?document.getElementById('conn').textContent:'?',"
                  "jobCount:typeof jobs!=='undefined'?jobs.size:-1,"
                  "url:location.href"
                  "})")
            def do_eval():
                if webview:
                    url     = webview.URL()
                    loading = webview.isLoading()
                    result_holder[0] = json.dumps({
                        'loaded':    bool(url),
                        'url':       str(url) if url else None,
                        'isLoading': bool(loading),
                    })
                else:
                    result_holder[0] = json.dumps({'loaded': False, 'error': 'no webview'})
                ev.set()
            _main_queue.put(do_eval)
            ev.wait(timeout=3.0)
            body = (result_holder[0] or json.dumps({'loaded': False, 'error': 'timeout'})).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args): pass  # suppress access logs

def run_ctrl_server():
    srv = HTTPServer(('127.0.0.1', CTRL_PORT), CtrlHandler)
    srv.serve_forever()

# ── App delegate ─────────────────────────────────────────────────────────────

class AppDelegate(AppKit.NSObject):
    def applicationDidFinishLaunching_(self, note):
        global panel, webview

        # Load saved position
        pos_x, pos_y = 40, 40
        try:
            with open(POS_FILE) as f:
                d = json.load(f)
                pos_x, pos_y = d.get('x', 40), d.get('y', 40)
        except Exception:
            pass

        # Create NSPanel
        panel = AppKit.NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(
            NSMakeRect(pos_x, pos_y, 420, 320),
            AppKit.NSWindowStyleMaskTitled |
            AppKit.NSWindowStyleMaskClosable |
            AppKit.NSWindowStyleMaskResizable |
            AppKit.NSWindowStyleMaskNonactivatingPanel,
            AppKit.NSBackingStoreBuffered,
            False
        )
        panel.setTitle_("Yeshie HUD")
        panel.setLevel_(AppKit.NSStatusWindowLevel)
        panel.setCollectionBehavior_(
            AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces |
            AppKit.NSWindowCollectionBehaviorStationary
        )
        panel.setHidesOnDeactivate_(False)
        panel.setDelegate_(self)

        # Embed WKWebView (saved globally for reload_panel + wv-status)
        cfg = WKWebViewConfiguration.alloc().init()
        webview = ClickableWebView.alloc().initWithFrame_configuration_(
            panel.contentView().bounds(), cfg
        )
        webview.setAutoresizingMask_(
            AppKit.NSViewWidthSizable | AppKit.NSViewHeightSizable
        )
        panel.contentView().addSubview_(webview)
        req = NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL))
        webview.loadRequest_(req)

        panel.makeKeyAndOrderFront_(None)

        # NSTimer drains _main_queue every 50ms so HTTP thread can dispatch to main thread
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            0.05, self,
            objc.selector(None, selector=b'drainQueue:', isClassMethod=False),
            None, True
        )

        # Separate 60s AFK check timer — surfaces HUD if user has been idle past threshold
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            60.0, self,
            objc.selector(None, selector=b'afkCheck:', isClassMethod=False),
            None, True
        )

        # Startup auto-show: surface the panel ~2s after launch so it's actually visible
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            2.0, self,
            objc.selector(None, selector=b'startupShow:', isClassMethod=False),
            None, False
        )

        # Start control server in background
        t = threading.Thread(target=run_ctrl_server, daemon=True)
        t.start()

    def drainQueue_(self, timer):
        try:
            while True:
                fn = _main_queue.get_nowait()
                fn()
        except queue.Empty:
            pass

    def afkCheck_(self, timer):
        idle = _get_idle_seconds()
        if idle > AFK_THRESHOLD_S and panel:
            # Only auto-show if there are active jobs in the relay
            try:
                import urllib.request
                r = urllib.request.urlopen('http://localhost:3333/jobs/status', timeout=1)
                import json as _json
                data = _json.loads(r.read())
                has_jobs = len(data.get('jobs', [])) > 0
            except Exception:
                has_jobs = False
            if has_jobs:
                print(f"[hud] AFK auto-show: idle={idle:.0f}s > {AFK_THRESHOLD_S}s, {len(data.get("jobs",[]))} jobs", flush=True)
                _show_panel()

    def startupShow_(self, timer):
        print("[hud] startup auto-show", flush=True)
        _show_panel()

    def show_panel(self):
        if panel:
            panel.makeKeyAndOrderFront_(None)

    def hide_panel(self):
        if panel:
            panel.orderOut_(None)

    def reload_panel(self):
        """Force WKWebView to reload (picks up new relay HTML)."""
        if webview:
            req = NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL))
            webview.loadRequest_(req)
        if panel:
            panel.makeKeyAndOrderFront_(None)

    def windowDidMove_(self, note):
        win = note.object()
        frame = win.frame()
        try:
            with open(POS_FILE, 'w') as f:
                json.dump({'x': frame.origin.x, 'y': frame.origin.y}, f)
        except Exception:
            pass

    def windowShouldClose_(self, win):
        # Hide instead of close so process stays alive for reopen
        win.orderOut_(None)
        return False

# ── Main ──────────────────────────────────────────────────────────────────────

app = AppKit.NSApplication.sharedApplication()
app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)  # no Dock icon
delegate = AppDelegate.alloc().init()
app.setDelegate_(delegate)
app.run()
