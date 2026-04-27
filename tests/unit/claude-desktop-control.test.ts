/**
 * @jest-environment node
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const projectRoot = resolve('/Users/mikewolf/Projects/yeshie');
const scriptPath = join(projectRoot, 'scripts/claude-desktop-control.py');

function writeStubModules(dir: string) {
  writeFileSync(
    join(dir, 'ApplicationServices.py'),
    `
import json
import os

_state_path = os.environ['AX_TEST_STATE_PATH']
with open(_state_path, 'r', encoding='utf-8') as fh:
    _state = json.load(fh)

def _save():
    with open(_state_path, 'w', encoding='utf-8') as fh:
        json.dump(_state, fh)

def AXUIElementCopyAttributeValue(elem, attr, _unused=None):
    if isinstance(elem, dict):
        if attr == 'AXWindows':
            return (0, elem.get('AXWindows'))
        return (0, elem.get(attr))
    return (1, None)

def AXUIElementSetAttributeValue(elem, attr, value):
    elem[attr] = value
    _save()
    return 0

def AXUIElementPerformAction(elem, action):
    elem['lastAction'] = action
    _save()
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

    def activateWithOptions_(self, options):
        self.item['activated'] = options

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
kCGEventFlagMaskCommand = 16
kCGEventFlagMaskShift = 32
kCGEventFlagMaskAlternate = 64
kCGEventFlagMaskControl = 128

def CGEventSourceCreate(state):
    return {'state': state}

def CGEventCreateKeyboardEvent(src, keycode, is_down):
    return {'keycode': keycode, 'down': bool(is_down)}

def CGEventSetFlags(event, flags):
    event['flags'] = flags

def CGEventPost(tap, event):
    return None
`,
  );
}

function buildWindowState() {
  const sessionCurrent: any = {
    id: 'session-current',
    AXRole: 'AXButton',
    AXTitle: 'Current Session',
    AXSelected: false,
    AXChildren: [],
  };
  const sessionTarget: any = {
    id: 'session-target',
    AXRole: 'AXButton',
    AXTitle: 'Target Session',
    AXSelected: false,
    AXChildren: [],
  };
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
  const webArea: any = {
    id: 'web-area',
    AXRole: 'AXWebArea',
    AXTitle: 'Current Session - Claude',
    AXChildren: [],
  };
  const window: any = {
    id: 'window-1',
    AXRole: 'AXWindow',
    AXChildren: [sessionCurrent, sessionTarget, textArea, queueButton, webArea],
  };
  return { windows: [window] };
}

function runControl(args: string[], state: any, parseJson = true) {
  const stubDir = mkdtempSync(join(tmpdir(), 'claude-control-stubs-'));
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

    const nextState = JSON.parse(readFileSync(statePath, 'utf8'));
    return {
      stdout,
      state: nextState,
      json: parseJson ? JSON.parse(stdout) : null,
    };
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }
}

describe('claude-desktop-control.py', () => {
  test('focus-map infers selected session from active web title', () => {
    const output = runControl(['focus-map'], buildWindowState()).json;

    expect(output.active_web_title).toBe('Current Session');
    expect(output.selected_session).toBe('Current Session');
    expect(output.composer.send_action).toBe('Queue message');
  });

  test('controls lists named button and textarea controls', () => {
    const output = runControl(['controls', '--role', 'AXButton', '--role', 'AXTextArea'], buildWindowState()).json;
    expect(output.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'AXButton', title: 'Current Session' }),
        expect.objectContaining({ role: 'AXTextArea', description: 'Write your prompt' }),
      ]),
    );
  });

  test('open-projects clicks the Projects button', () => {
    const state = buildWindowState();
    state.windows[0].AXChildren.unshift({
      id: 'projects-button',
      AXRole: 'AXButton',
      AXTitle: 'Projects',
      AXDescription: '',
      AXChildren: [],
    });
    const result = runControl(['open-projects'], state, false);
    const projects = result.state.windows[0].AXChildren.find((child: any) => child.id === 'projects-button');
    expect(projects.lastAction).toBe('AXPress');
  });

  test('submit presses the queue button when available', () => {
    const result = runControl(['submit'], buildWindowState(), false);
    const queue = result.state.windows[0].AXChildren.find((child: any) => child.id === 'queue-button');
    expect(queue.lastAction).toBe('AXPress');
    expect(result.stdout).toContain('sent via Queue message');
  });

  test('open-dispatch clicks a visible Dispatch button', () => {
    const state = buildWindowState();
    state.windows[0].AXChildren.unshift({
      id: 'dispatch-button',
      AXRole: 'AXButton',
      AXTitle: 'Dispatch',
      AXDescription: '',
      AXChildren: [],
    });
    const result = runControl(['open-dispatch'], state, false);
    const dispatch = result.state.windows[0].AXChildren.find((child: any) => child.id === 'dispatch-button');
    expect(dispatch.lastAction).toBe('AXPress');
  });

  test('attach-file clicks the attach button when visible', () => {
    const state = buildWindowState();
    state.windows[0].AXChildren.push({
      id: 'attach-button',
      AXRole: 'AXButton',
      AXTitle: '',
      AXDescription: 'Attach file',
      AXChildren: [],
    });
    const result = runControl(['attach-file'], state, false);
    const attach = result.state.windows[0].AXChildren.find((child: any) => child.id === 'attach-button');
    expect(attach.lastAction).toBe('AXPress');
  });

  test('share-chat clicks the share button when visible', () => {
    const state = buildWindowState();
    state.windows[0].AXChildren.push({
      id: 'share-button',
      AXRole: 'AXButton',
      AXTitle: '',
      AXDescription: 'Share chat',
      AXChildren: [],
    });
    const result = runControl(['share-chat'], state, false);
    const share = result.state.windows[0].AXChildren.find((child: any) => child.id === 'share-button');
    expect(share.lastAction).toBe('AXPress');
  });
});
