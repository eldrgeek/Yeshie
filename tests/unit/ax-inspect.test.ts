/**
 * @jest-environment node
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const projectRoot = resolve('/Users/mikewolf/Projects/yeshie');
const scriptPath = join(projectRoot, 'scripts/ax-inspect.py');

function writeStubModules(dir: string) {
  writeFileSync(
    join(dir, 'ApplicationServices.py'),
    `
import json
import os

_state_path = os.environ['AX_TEST_STATE_PATH']
with open(_state_path, 'r', encoding='utf-8') as fh:
    _state = json.load(fh)

def AXUIElementCopyAttributeValue(elem, attr, _unused=None):
    if isinstance(elem, dict):
        if attr == 'AXWindows':
            return (0, elem.get('AXWindows'))
        return (0, elem.get(attr))
    return (1, None)

def AXUIElementSetAttributeValue(elem, attr, value):
    elem[attr] = value
    return 0

def AXUIElementPerformAction(elem, action):
    return 0

def AXUIElementCreateApplication(pid):
    return {'id': 'app', 'AXWindows': _state['windows']}
`,
  );

  writeFileSync(
    join(dir, 'AppKit.py'),
    `
import json
import os

_apps = json.loads(os.environ['AX_TEST_APPS'])

class RunningApp:
    def __init__(self, item):
        self.item = item

    def bundleIdentifier(self):
        return self.item['bundleIdentifier']

    def processIdentifier(self):
        return self.item['pid']

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
kCGEventSourceStateHIDSystemState = 1
kCGHIDEventTap = 2

def CGEventSourceCreate(state):
    return {'state': state}

def CGEventCreateKeyboardEvent(src, keycode, is_down):
    return {'keycode': keycode, 'down': bool(is_down)}

def CGEventPost(tap, event):
    return None
`,
  );
}

function buildWindowState() {
  const textArea: any = {
    id: 'text-area',
    AXRole: 'AXTextArea',
    AXDescription: 'Write your prompt',
    AXPlaceholderValue: 'Reply to Claude',
    AXValue: 'draft text',
    AXChildren: [],
  };
  const queueButton: any = {
    id: 'queue-button',
    AXRole: 'AXButton',
    AXDescription: 'Queue message',
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
    AXChildren: [selectedSession, targetSession, textArea, queueButton],
  };
  return { windows: [window] };
}

function runInspect(args: string[], state: any) {
  const stubDir = mkdtempSync(join(tmpdir(), 'ax-inspect-stubs-'));
  const statePath = join(stubDir, 'ax-state.json');
  writeStubModules(stubDir);
  writeFileSync(statePath, JSON.stringify(state));

  try {
    const env = {
      ...process.env,
      PYTHONPATH: stubDir,
      AX_TEST_APPS: JSON.stringify([{ bundleIdentifier: 'com.anthropic.claudefordesktop', pid: 321 }]),
      AX_TEST_STATE_PATH: statePath,
    };

    const stdout = execFileSync('python3', [scriptPath, ...args], {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
    });

    return JSON.parse(stdout);
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }
}

describe('ax-inspect.py', () => {
  test('overview reports sessions and composer state', () => {
    const output = runInspect(['overview'], buildWindowState());

    expect(output.selected_session).toBe('Current Session');
    expect(output.session_count).toBe(2);
    expect(output.sessions).toEqual([
      { title: 'Current Session', selected: true },
      { title: 'Target Session', selected: false },
    ]);
    expect(output.composer).toEqual({
      has_text_area: true,
      draft_text: 'draft text',
      send_action: 'Queue message',
      active_web_title: null,
    });
  });

  test('tree dumps AX roles with children', () => {
    const output = runInspect(['tree', '--max-depth', '2'], buildWindowState());

    expect(output.role).toBe('AXWindow');
    expect(Array.isArray(output.children)).toBe(true);
    expect(output.children.map((child: any) => child.role)).toEqual([
      'AXButton',
      'AXButton',
      'AXTextArea',
      'AXButton',
    ]);
  });
});
