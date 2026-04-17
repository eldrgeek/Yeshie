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
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import objc
import AppKit
from Foundation import NSMakeRect, NSURL, NSURLRequest, NSTimer, NSRunLoop

# WebKit isn't a top-level pyobjc package — load via bundle
_wk = {}
objc.loadBundle('WebKit',
    bundle_path='/System/Library/Frameworks/WebKit.framework',
    module_globals=_wk)
WKWebView              = _wk['WKWebView']
WKWebViewConfiguration = _wk['WKWebViewConfiguration']

HUD_URL   = "http://localhost:3333/hud"
CTRL_PORT = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--port' else 3334
POS_FILE  = "/tmp/yeshie-hud-pos.json"

panel   = None   # global NSPanel reference
webview = None   # global WKWebView reference

# Queue for dispatching work to the main thread from the HTTP server thread
_main_queue = queue.Queue()

# ── Control server (POST /show /hide /reload, GET /wv-status) ────────────────

class CtrlHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
        sel = None
        if   self.path == '/show':   sel = b'show_panel'
        elif self.path == '/hide':   sel = b'hide_panel'
        elif self.path == '/reload': sel = b'reload_panel'
        if sel:
            AppKit.NSApplication.sharedApplication() \
                .performSelectorOnMainThread_withObject_waitUntilDone_(
                    objc.selector(None, selector=sel, isClassMethod=False), None, False)

    def do_GET(self):
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
        panel.setLevel_(AppKit.NSFloatingWindowLevel)
        panel.setCollectionBehavior_(
            AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces |
            AppKit.NSWindowCollectionBehaviorStationary
        )
        panel.setDelegate_(self)

        # Embed WKWebView (saved globally for reload_panel + wv-status)
        cfg = WKWebViewConfiguration.alloc().init()
        webview = WKWebView.alloc().initWithFrame_configuration_(
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
