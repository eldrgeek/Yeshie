/**
 * @jest-environment node
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const projectRoot = resolve('/Users/mikewolf/Projects/yeshie');
const scriptPath = join(projectRoot, 'scripts/ax-inject.py');

function writeStubModules(dir: string) {
  writeFileSync(
    join(dir, 'ApplicationServices.py'),
    `
import json
import os

_state_path = os.environ['AX_TEST_STATE_PATH']
with open(_state_path, 'r', encoding='utf-8') as fh:
    _state = json.load(fh)

def _record(event):
    _state.setdefault('events', []).append(event)
    with open(_state_path, 'w', encoding='utf-8') as fh:
        json.dump(_state, fh)

def _match(elem):
    if isinstance(elem, dict) and 'id' in elem:
        return elem
    raise RuntimeError(f'Unknown AX element: {elem!r}')

def AXUIElementCopyAttributeValue(elem, attr, _unused=None):
    if isinstance(elem, dict):
        if attr == 'AXWindows':
            return (0, elem.get('AXWindows'))
        return (0, elem.get(attr))
    return (1, None)

def AXUIElementSetAttributeValue(elem, attr, value):
    target = _match(elem)
    target[attr] = value
    _record({'type': 'set', 'id': target['id'], 'attr': attr, 'value': value})
    return 0

def AXUIElementPerformAction(elem, action):
    target = _match(elem)
    _record({'type': 'action', 'id': target['id'], 'action': action})
    return 0

def AXUIElementCreateApplication(pid):
    _record({'type': 'create_app', 'pid': pid})
    # Claude Desktop 1.3561+ exposes its web content through AXFocusedUIElement
    # (an AXWebArea), not the native window. Share the window's children list so
    # edits made through either root land in the same recorded state.
    web_area = {'id': 'web-area', 'AXRole': 'AXWebArea', 'AXChildren': _state['windows'][0]['AXChildren']}
    return {'id': 'app', 'AXWindows': _state['windows'], 'AXFocusedUIElement': web_area}
`,
  );

  writeFileSync(
    join(dir, 'AppKit.py'),
    `
import json
import os

import ApplicationServices

_apps = json.loads(os.environ['AX_TEST_APPS'])
NSApplicationActivateIgnoringOtherApps = 2

class RunningApp:
    def __init__(self, item):
        self.item = item

    def bundleIdentifier(self):
        return self.item['bundleIdentifier']

    def processIdentifier(self):
        return self.item['pid']

    def activateWithOptions_(self, options):
        ApplicationServices._record({'type': 'activate', 'pid': self.item['pid'], 'options': options})
        return True

class Workspace:
    def runningApplications(self):
        return [RunningApp(item) for item in _apps]

class NSWorkspace:
    @staticmethod
    def sharedWorkspace():
        return Workspace()
`,
  );

  writeFileSync(
    join(dir, 'Quartz.py'),
    `
import json
import os

_events = json.loads(os.environ.get('AX_TEST_QUARTZ_EVENTS', '[]'))
kCGEventSourceStateHIDSystemState = 1
kCGHIDEventTap = 2

def CGEventSourceCreate(state):
    _events.append({'type': 'source', 'state': state})
    return {'state': state}

def CGEventCreateKeyboardEvent(src, keycode, is_down):
    event = {'type': 'key', 'keycode': keycode, 'down': bool(is_down)}
    _events.append(event)
    return event

def CGEventPost(tap, event):
    _events.append({'type': 'post', 'tap': tap, 'event': event})
`,
  );
}

function runAxInject(args: string[], state: any) {
  const stubDir = mkdtempSync(join(tmpdir(), 'ax-inject-stubs-'));
  const statePath = join(stubDir, 'ax-state.json');
  const osascriptLog = join(stubDir, 'osascript.log');
  writeStubModules(stubDir);
  writeFileSync(statePath, JSON.stringify(state));
  // The script shells out to osascript to activate Claude and to post a
  // notification. A unit test must never reach the live Claude Desktop, so a
  // fake osascript goes first on PATH and records its arguments instead.
  writeFileSync(join(stubDir, 'osascript'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${osascriptLog}"\n`, { mode: 0o755 });

  try {
    const env = {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH}`,
      PYTHONPATH: stubDir,
      // Closed port: the relay /notify POST fails fast instead of hitting the live relay.
      YESHIE_RELAY: 'http://127.0.0.1:9',
      AX_TEST_APPS: JSON.stringify([{ bundleIdentifier: 'com.anthropic.claudefordesktop', pid: 321 }]),
      AX_TEST_STATE_PATH: statePath,
      AX_TEST_QUARTZ_EVENTS: '[]',
    };

    const stdout = execFileSync('python3', [scriptPath, ...args], {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
    });

    const nextState = JSON.parse(readFileSync(statePath, 'utf8'));
    const osascript = existsSync(osascriptLog)
      ? readFileSync(osascriptLog, 'utf8').split('\n').filter(Boolean)
      : [];
    return { stdout, state: nextState, events: nextState.events ?? [], osascript };
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }
}

function buildWindowState() {
  const textArea: any = {
    id: 'text-area',
    AXRole: 'AXTextArea',
    AXDescription: 'Write your prompt',
    AXPlaceholderValue: 'Reply to Claude',
    AXChildren: [],
  };
  const sendButton: any = {
    id: 'send-button',
    AXRole: 'AXButton',
    AXDescription: 'Send message',
    AXChildren: [],
  };
  const selectedSession: any = {
    id: 'session-current',
    AXRole: 'AXButton',
    AXTitle: 'Current Session',
    AXSelected: true,
    AXChildren: [],
  };
  const targetSession: any = {
    id: 'session-target',
    AXRole: 'AXButton',
    AXTitle: 'Target Session',
    AXSelected: false,
    AXChildren: [],
  };
  const window: any = {
    id: 'window-1',
    AXRole: 'AXWindow',
    AXChildren: [selectedSession, targetSession, textArea, sendButton],
  };
  return { windows: [window], textArea, selectedSession, targetSession, sendButton, events: [] as any[] };
}

function findElementById(root: any, id: string): any {
  if (!root || typeof root !== 'object') return null;
  if (root.id === id) return root;
  const children = root.AXChildren ?? [];
  for (const child of children) {
    const match = findElementById(child, id);
    if (match) return match;
  }
  return null;
}

describe('ax-inject.py', () => {
  test('injects text and clicks the send button when available', () => {
    const state = buildWindowState();

    const result = runAxInject(['hello from test'], state);

    expect(result.stdout).toContain('sent via Send message');
    expect(findElementById(result.state.windows[0], 'text-area')?.AXValue).toBe('hello from test');
    expect(result.events).toEqual(
      expect.arrayContaining([
        { type: 'create_app', pid: 321 },
        { type: 'activate', pid: 321, options: 2 },
        { type: 'set', id: 'text-area', attr: 'AXValue', value: 'hello from test' },
        { type: 'action', id: 'send-button', action: 'AXPress' },
      ]),
    );
    // The activation fallback went to the fake osascript, not the real one.
    expect(result.osascript.some((line: string) => line.includes('tell application "Claude" to activate'))).toBe(true);
  });

  test('switches sessions and restores prior draft when save-restore is requested', () => {
    const state = buildWindowState();
    state.textArea.AXValue = 'draft already here';

    const result = runAxInject(
      ['--session', 'Target Session', '--save-restore', 'follow up message'],
      state,
    );

    expect(result.stdout).toContain("switching to: 'Target Session'");
    expect(result.stdout).toContain("restoring: 'Current Session'");
    expect(findElementById(result.state.windows[0], 'text-area')?.AXValue).toBe('draft already here');
    expect(result.events).toEqual(
      expect.arrayContaining([
        { type: 'action', id: 'session-target', action: 'AXPress' },
        { type: 'set', id: 'text-area', attr: 'AXValue', value: 'follow up message' },
        { type: 'action', id: 'send-button', action: 'AXPress' },
        { type: 'action', id: 'session-current', action: 'AXPress' },
        { type: 'set', id: 'text-area', attr: 'AXValue', value: 'draft already here' },
      ]),
    );
  });
});
