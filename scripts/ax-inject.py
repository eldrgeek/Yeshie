#!/usr/bin/env python3
"""
ax-inject.py — Inject a message into the active Claude Desktop session via AX APIs.
Usage: python3 ax-inject.py "your message here"

State handling:
  - Mid-response: Queue button appears and undims when text is set → click it
  - Idle: No button → focus text area + CGEvent Return keystroke
"""
import sys
import time
import ApplicationServices as AS
import AppKit
import Quartz

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
            find_roles(child, targets, depth+1, max_depth, results)
    return results

def send_return():
    """Post a Return keystroke via CGEvent (works regardless of window focus tricks)."""
    src = Quartz.CGEventSourceCreate(Quartz.kCGEventSourceStateHIDSystemState)
    dn = Quartz.CGEventCreateKeyboardEvent(src, 0x24, True)
    up = Quartz.CGEventCreateKeyboardEvent(src, 0x24, False)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, dn)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)

msg = ' '.join(sys.argv[1:])
if not msg:
    print('Usage: ax-inject.py "message"', file=sys.stderr)
    sys.exit(1)

workspace = AppKit.NSWorkspace.sharedWorkspace()
claude_pid = None
for app in workspace.runningApplications():
    if app.bundleIdentifier() == 'com.anthropic.claudefordesktop':
        claude_pid = app.processIdentifier()
        break

if not claude_pid:
    print('ERROR: Claude not running', file=sys.stderr)
    sys.exit(1)

app_elem = AS.AXUIElementCreateApplication(claude_pid)
err, windows = AS.AXUIElementCopyAttributeValue(app_elem, 'AXWindows', None)
win = windows[0]

found = find_roles(win, ['AXTextArea', 'AXButton'])
text_area = None
send_btn = None

for role, elem in found:
    if role == 'AXTextArea':
        desc = get_attr(elem, 'AXDescription') or ''
        if 'prompt' in desc.lower():
            text_area = elem
    if role == 'AXButton':
        desc = get_attr(elem, 'AXDescription') or ''
        if desc in ('Queue message', 'Send message'):
            send_btn = (desc, elem)

if not text_area:
    print('ERROR: text area not found', file=sys.stderr)
    sys.exit(1)

# Set the message text
err = AS.AXUIElementSetAttributeValue(text_area, 'AXValue', msg)
if err != 0:
    print(f'ERROR: could not set value (err={err})', file=sys.stderr)
    sys.exit(1)

if send_btn:
    # Mid-response: Queue button is available
    desc, btn = send_btn
    AS.AXUIElementPerformAction(btn, 'AXPress')
    print(f'sent via {desc}')
else:
    # Idle: focus the text area and send Return
    AS.AXUIElementSetAttributeValue(text_area, 'AXFocused', True)
    time.sleep(0.1)
    send_return()
    print('sent via Return keystroke (idle mode)')
