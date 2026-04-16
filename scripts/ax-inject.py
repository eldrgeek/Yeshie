#!/usr/bin/env python3
"""
ax-inject.py — Inject a message into a Claude Desktop session via AX APIs.

Usage:
  python3 ax-inject.py "message"
  python3 ax-inject.py --session "Chat Title" "message"
  python3 ax-inject.py --session "Chat Title" --save-restore "message"

State handling:
  - Mid-response: Queue button appears and undims when text is set → click it
  - Idle: No button → focus text area + CGEvent Return keystroke
"""
import sys
import time
import argparse
import ApplicationServices as AS
import AppKit
import Quartz


# ── AX helpers ────────────────────────────────────────────────────────────────

def get_attr(elem, attr):
    err, val = AS.AXUIElementCopyAttributeValue(elem, attr, None)
    return val if err == 0 else None


def find_roles(elem, targets, depth=0, max_depth=35, results=None):
    if results is None:
        results = []
    if depth > max_depth:
        return results
    role = get_attr(elem, 'AXRole')
    if role in targets:
        results.append((role, elem))
    children = get_attr(elem, 'AXChildren')
    if children:
        for child in children:
            find_roles(child, targets, depth + 1, max_depth, results)
    return results


# Known non-session UI button labels to skip when scanning for nav/session items
_UI_BUTTONS = {
    'Queue message', 'Send message', 'New chat', 'Search chats',
    'Close', 'Minimize', 'Zoom', 'New Conversation', 'Settings',
    'Start new chat', 'Menu', 'Back', 'Toggle sidebar', '',
}


def find_nav_buttons(elem, depth=0, max_depth=35, results=None):
    """Collect AXButton elements that look like session/nav items (non-empty title, not a known UI control)."""
    if results is None:
        results = []
    if depth > max_depth:
        return results
    role = get_attr(elem, 'AXRole')
    if role == 'AXButton':
        title = get_attr(elem, 'AXTitle') or get_attr(elem, 'AXDescription') or ''
        if title and title not in _UI_BUTTONS and len(title) > 2:
            selected = get_attr(elem, 'AXSelected') or False
            results.append({'title': title, 'elem': elem, 'selected': bool(selected)})
    children = get_attr(elem, 'AXChildren')
    if children:
        for child in children:
            find_nav_buttons(child, depth + 1, max_depth, results)
    return results


def find_session_button(win, target_title):
    """Find a sidebar session button — exact match first, then substring."""
    buttons = find_nav_buttons(win)
    tl = target_title.lower()
    for b in buttons:
        if b['title'].lower() == tl:
            return b
    for b in buttons:
        if tl in b['title'].lower():
            return b
    return None


def get_selected_session(win):
    """Return the currently selected/highlighted session button, or None."""
    for b in find_nav_buttons(win):
        if b['selected']:
            return b
    return None


def find_text_area(win):
    found = find_roles(win, ['AXTextArea'])
    for _, elem in found:
        desc = get_attr(elem, 'AXDescription') or ''
        ph   = get_attr(elem, 'AXPlaceholderValue') or ''
        if ('prompt' in desc.lower()
                or 'reply' in ph.lower()
                or 'prompt' in ph.lower()
                or 'write' in desc.lower()):
            return elem
    # Fallback: return first textarea found
    return found[0][1] if found else None


def wait_for_text_area(win, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        ta = find_text_area(win)
        if ta:
            return ta
        time.sleep(0.25)
    return None


def find_send_button(win):
    for _, elem in find_roles(win, ['AXButton']):
        desc = get_attr(elem, 'AXDescription') or ''
        if desc in ('Queue message', 'Send message'):
            return (desc, elem)
    return None


def send_return():
    """Post a Return keystroke via CGEvent (works regardless of focus state)."""
    src = Quartz.CGEventSourceCreate(Quartz.kCGEventSourceStateHIDSystemState)
    dn = Quartz.CGEventCreateKeyboardEvent(src, 0x24, True)
    up = Quartz.CGEventCreateKeyboardEvent(src, 0x24, False)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, dn)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)


def inject_message(win, msg):
    """Set text in the active session's text area and submit."""
    text_area = wait_for_text_area(win, timeout=5.0)
    if not text_area:
        print('ERROR: text area not found', file=sys.stderr)
        return False

    err = AS.AXUIElementSetAttributeValue(text_area, 'AXValue', msg)
    if err != 0:
        print(f'ERROR: could not set AXValue (err={err})', file=sys.stderr)
        return False

    send_btn = find_send_button(win)
    if send_btn:
        desc, btn = send_btn
        AS.AXUIElementPerformAction(btn, 'AXPress')
        print(f'sent via {desc}')
    else:
        AS.AXUIElementSetAttributeValue(text_area, 'AXFocused', True)
        time.sleep(0.1)
        send_return()
        print('sent via Return (idle mode)')
    return True


# ── Arg parsing ───────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description='Inject a message into Claude Desktop')
parser.add_argument('--session', default=None, metavar='TITLE',
                    help='Target session title — switch to that session before injecting')
parser.add_argument('--save-restore', action='store_true',
                    help='Save current session text and restore it (plus switch back) after injection')
parser.add_argument('message', nargs='+')
args = parser.parse_args()
msg = ' '.join(args.message)

# ── Find Claude Desktop ───────────────────────────────────────────────────────

workspace = AppKit.NSWorkspace.sharedWorkspace()
claude_pid = None
for app in workspace.runningApplications():
    if app.bundleIdentifier() == 'com.anthropic.claudefordesktop':
        claude_pid = app.processIdentifier()
        break

if not claude_pid:
    print('ERROR: Claude Desktop not running', file=sys.stderr)
    sys.exit(1)

app_elem = AS.AXUIElementCreateApplication(claude_pid)
err, windows = AS.AXUIElementCopyAttributeValue(app_elem, 'AXWindows', None)
if err != 0 or not windows:
    print('ERROR: no Claude Desktop windows found', file=sys.stderr)
    sys.exit(1)
win = windows[0]

# ── Session-targeted injection ────────────────────────────────────────────────

if args.session:
    target = find_session_button(win, args.session)
    if not target:
        print(f'ERROR: session "{args.session}" not found in sidebar', file=sys.stderr)
        sys.exit(1)

    saved_text = ''
    saved_session = None

    if args.save_restore:
        current_ta = find_text_area(win)
        if current_ta:
            saved_text = get_attr(current_ta, 'AXValue') or ''
        saved_session = get_selected_session(win)
        if saved_session:
            print(f'saved: session={saved_session["title"]!r}  text={saved_text[:40]!r}')

    # Switch to target session
    print(f'switching to: {target["title"]!r}')
    AS.AXUIElementPerformAction(target['elem'], 'AXPress')
    time.sleep(1.2)   # wait for session pane to render

    ok = inject_message(win, msg)

    if args.save_restore and saved_session:
        time.sleep(0.5)
        print(f'restoring: {saved_session["title"]!r}')
        AS.AXUIElementPerformAction(saved_session['elem'], 'AXPress')
        time.sleep(0.8)
        if saved_text:
            restored_ta = wait_for_text_area(win, timeout=3.0)
            if restored_ta:
                AS.AXUIElementSetAttributeValue(restored_ta, 'AXValue', saved_text)
                print(f'restored text: {saved_text[:40]!r}')

    sys.exit(0 if ok else 1)

# ── Simple injection into current session ─────────────────────────────────────

ok = inject_message(win, msg)
sys.exit(0 if ok else 1)
