#!/usr/bin/env python3
"""
hud.py — Floating always-on-top status panel for Yeshie job tracking.
- NSPanel: stays above all windows, never steals focus
- WKWebView: loads localhost:3333/hud (Socket.IO live updates)
- Listens on localhost:3334 for POST /show and POST /hide from the relay
- No Dock icon

Usage: python3 hud.py [--port 3334]
"""
import sys
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import objc
import AppKit
from Foundation import NSMakeRect, NSURL, NSURLRequest

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

panel = None  # global reference

# ── Control server (POST /show, POST /hide) ──────────────────────────────────

class CtrlHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
        if self.path == '/show':
            AppKit.NSApp.callOnMainThread_withObject_waitUntilDone_(
                'show_panel', None, False) if False else \
            AppKit.NSApplication.sharedApplication().performSelectorOnMainThread_withObject_waitUntilDone_(
                objc.selector(None, selector=b'show_panel', isClassMethod=False), None, False)
        elif self.path == '/hide':
            AppKit.NSApplication.sharedApplication().performSelectorOnMainThread_withObject_waitUntilDone_(
                objc.selector(None, selector=b'hide_panel', isClassMethod=False), None, False)

    def log_message(self, *args): pass  # suppress access logs

def run_ctrl_server():
    srv = HTTPServer(('127.0.0.1', CTRL_PORT), CtrlHandler)
    srv.serve_forever()

# ── App delegate ─────────────────────────────────────────────────────────────

class AppDelegate(AppKit.NSObject):
    def applicationDidFinishLaunching_(self, note):
        global panel

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

        # Embed WKWebView
        cfg = WKWebViewConfiguration.alloc().init()
        wv = WKWebView.alloc().initWithFrame_configuration_(
            panel.contentView().bounds(), cfg
        )
        wv.setAutoresizingMask_(
            AppKit.NSViewWidthSizable | AppKit.NSViewHeightSizable
        )
        panel.contentView().addSubview_(wv)
        req = NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL))
        wv.loadRequest_(req)

        panel.makeKeyAndOrderFront_(None)

        # Start control server in background
        t = threading.Thread(target=run_ctrl_server, daemon=True)
        t.start()

    def show_panel(self):
        if panel:
            panel.makeKeyAndOrderFront_(None)

    def hide_panel(self):
        if panel:
            panel.orderOut_(None)

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
