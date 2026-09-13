// Pure CDP payload construction. Commands belong on keyDown only.
export const MAC_EDITING_COMMANDS: Readonly<Record<string, string>> = {
  'cmd+a': 'selectAll',
  'arrowright': 'moveRight',
  'arrowleft': 'moveLeft',
  'shift+arrowleft': 'moveLeftAndModifySelection',
  'shift+arrowright': 'moveRightAndModifySelection',
  'shift+arrowup': 'moveUpAndModifySelection',
  'shift+arrowdown': 'moveDownAndModifySelection',
  'alt+shift+arrowleft': 'moveWordLeftAndModifySelection',
  'alt+shift+arrowright': 'moveWordRightAndModifySelection',
  'cmd+shift+arrowleft': 'moveToBeginningOfLineAndModifySelection',
  'cmd+shift+arrowright': 'moveToEndOfLineAndModifySelection',
  'shift+home': 'moveToBeginningOfDocumentAndModifySelection',
  'shift+end': 'moveToEndOfDocumentAndModifySelection',
  'cmd+shift+arrowup': 'moveToBeginningOfDocumentAndModifySelection',
  'cmd+shift+arrowdown': 'moveToEndOfDocumentAndModifySelection',
  'cmd+shift+home': 'moveToBeginningOfDocumentAndModifySelection',
  'cmd+shift+end': 'moveToEndOfDocumentAndModifySelection',
  'cmd+arrowleft': 'moveToBeginningOfLine',
  'cmd+arrowright': 'moveToEndOfLine',
  'cmd+arrowup': 'moveToBeginningOfDocument',
  'cmd+arrowdown': 'moveToEndOfDocument',
  'cmd+home': 'moveToBeginningOfDocument',
  'cmd+end': 'moveToEndOfDocument',
  'alt+arrowleft': 'moveWordLeft',
  'alt+arrowright': 'moveWordRight',
};

export function keyChordEvents(spec: string, platform: string) {
    const parts = spec.toLowerCase().split('+');
    const rawKey = parts[parts.length - 1];
    const ctrl = parts.includes('ctrl') || parts.includes('control');
    const meta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
    const shift = parts.includes('shift');
    const alt = parts.includes('alt');

    const KEY_MAP: Record<string, { key: string; code: string; vkCode: number }> = {
      enter:     { key: 'Enter',      code: 'Enter',      vkCode: 13 },
      return:    { key: 'Enter',      code: 'Enter',      vkCode: 13 },
      escape:    { key: 'Escape',     code: 'Escape',     vkCode: 27 },
      esc:       { key: 'Escape',     code: 'Escape',     vkCode: 27 },
      tab:       { key: 'Tab',        code: 'Tab',        vkCode: 9  },
      backspace: { key: 'Backspace',  code: 'Backspace',  vkCode: 8  },
      space:     { key: ' ',          code: 'Space',      vkCode: 32 },
      arrowdown: { key: 'ArrowDown',  code: 'ArrowDown',  vkCode: 40 },
      arrowup:   { key: 'ArrowUp',    code: 'ArrowUp',    vkCode: 38 },
      arrowleft: { key: 'ArrowLeft',  code: 'ArrowLeft',  vkCode: 37 },
      arrowright:{ key: 'ArrowRight', code: 'ArrowRight', vkCode: 39 },
      delete:    { key: 'Delete',     code: 'Delete',     vkCode: 46 },
      home:      { key: 'Home',       code: 'Home',       vkCode: 36 },
      end:       { key: 'End',        code: 'End',        vkCode: 35 },
      pageup:    { key: 'PageUp',     code: 'PageUp',     vkCode: 33 },
      pagedown:  { key: 'PageDown',   code: 'PageDown',   vkCode: 34 },
      '/':       { key: '/',          code: 'Slash',      vkCode: 191 },
      slash:     { key: '/',          code: 'Slash',      vkCode: 191 },
    };

    const mapped = KEY_MAP[rawKey] ?? {
      key: rawKey.length === 1 ? rawKey : rawKey.charAt(0).toUpperCase() + rawKey.slice(1),
      code: rawKey.length === 1 ? 'Key' + rawKey.toUpperCase() : rawKey.charAt(0).toUpperCase() + rawKey.slice(1),
      vkCode: rawKey.length === 1 ? rawKey.toUpperCase().charCodeAt(0) : 0,
    };

    const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);

    const base = {
      key: mapped.key,
      code: mapped.code,
      windowsVirtualKeyCode: mapped.vkCode,
      nativeVirtualKeyCode: mapped.vkCode,
      modifiers,
    };


    const chord = [alt && 'alt', ctrl && 'ctrl', meta && 'cmd', shift && 'shift', rawKey].filter(Boolean).join('+');
    const command = platform === 'mac' ? MAC_EDITING_COMMANDS[chord] : undefined;
    return [
      { type: 'keyDown', ...base, ...(command ? { commands: [command] } : {}) },
      { type: 'keyUp', ...base },
    ];
}

export function keyRepeatCount(repeat: unknown = 1, repeatText?: string): number {
  // Grapheme clusters correspond to caret steps for ordinary text. Complex Docs
  // objects, paragraph boundaries and bidi text require live calibration.
  const count = repeatText === undefined ? Number(repeat)
    : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(repeatText)).length;
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000) {
    throw new Error('key repeat must be an integer between 0 and 10000');
  }
  return count;
}

export interface ViewportPoint { x: number; y: number; }

function validatePoint(point: ViewportPoint, action: string): ViewportPoint {
  if (![point?.x, point?.y].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
    throw new Error(`${action} requires finite nonnegative viewport coordinates`);
  }
  return point;
}

export function mouseClickEvents(point: ViewportPoint) {
  const { x, y } = validatePoint(point, 'mouse click');
  return [
    { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 },
    { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 },
  ];
}

export function openDocsFindEvents() {
  const base = { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, modifiers: 4 };
  return [{ type: 'rawKeyDown', ...base }, { type: 'keyUp', ...base }];
}

export function submitDocsFindEvents() {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 0 };
  return [
    { type: 'keyDown', ...base, text: '\r', unmodifiedText: '\r' },
    { type: 'keyUp', ...base },
  ];
}

export function closeDocsFindEvents() {
  const base = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, modifiers: 0 };
  return [{ type: 'rawKeyDown', ...base }, { type: 'keyUp', ...base }];
}

export function openCommentComposerEvents() {
  const base = { key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77, nativeVirtualKeyCode: 77, modifiers: 5 };
  return [{ type: 'rawKeyDown', ...base }, { type: 'keyUp', ...base }];
}

export function dragSelectEvents(start: { x: number; y: number }, end: { x: number; y: number }) {
  if (![start?.x, start?.y, end?.x, end?.y].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
    throw new Error('drag_select requires finite nonnegative viewport coordinates');
  }
  // CDP coordinates are CSS pixels relative to the main-frame viewport.
  return [
    { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 },
    { type: 'mouseMoved', ...end, button: 'left', buttons: 1 },
    { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 },
  ];
}

export interface InputIO {
  attach(): Promise<unknown>;
  platform(): Promise<string>;
  send(method: string, event: object): Promise<unknown>;
  cancelled(): boolean;
}

// Bound individual operations, never a loop whose continuation could send more
// input after timeout. Already submitted CDP commands cannot be recalled.
function inputSession(io: InputIO, timeoutMs: number) {
  const bounded = async (operation: () => Promise<unknown>, cleanup = false) => {
    if (!cleanup && io.cancelled()) throw new Error('Input cancelled');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Input operation timed out')), timeoutMs);
          if (!cleanup) poll = setInterval(() => {
            if (io.cancelled()) reject(new Error('Input cancelled'));
          }, 10);
        }),
      ]);
      if (!cleanup && io.cancelled()) throw new Error('Input cancelled');
      return result;
    } finally { clearTimeout(timer); clearInterval(poll); }
  };
  const collapse = async (platform: string) => {
    // Attempt keyUp even if keyDown fails or never acknowledges.
    for (const event of keyChordEvents('ArrowRight', platform)) {
      try { await bounded(() => io.send('Input.dispatchKeyEvent', event), true); } catch (_) {}
    }
  };
  return { bounded, collapse };
}

export async function repeatedKeys(specs: string[], repeat: number, io: InputIO, timeoutMs = 2000) {
  const { bounded, collapse } = inputSession(io, timeoutMs);
  let platform = '';
  let selection = false;
  try {
    await bounded(() => io.attach());
    platform = String(await bounded(() => io.platform()));
    for (let i = 0; i < repeat; i++) for (const spec of specs) {
      for (const event of keyChordEvents(spec, platform)) {
        await bounded(() => {
          if (event.type === 'keyDown' && ((event.modifiers & 8) || event.commands?.includes('selectAll') ||
            (event.key === 'a' && (event.modifiers & 6)))) selection = true;
          return io.send('Input.dispatchKeyEvent', event);
        });
      }
      if (specs.length > 1) await bounded(() => new Promise(resolve => setTimeout(resolve, 60)));
    }
  } catch (error) {
    if (selection) await collapse(platform);
    throw error;
  }
}

export async function dragSelection(start: { x: number; y: number }, end: { x: number; y: number }, io: InputIO, timeoutMs = 2000) {
  const events = dragSelectEvents(start, end);
  const { bounded, collapse } = inputSession(io, timeoutMs);
  let platform = '';
  let failure: unknown;
  try {
    await bounded(() => io.attach());
    platform = String(await bounded(() => io.platform()));
    for (const event of events.slice(0, 2)) {
      await bounded(() => io.send('Input.dispatchMouseEvent', event));
    }
  } catch (error) { failure = error; }
  finally {
    try { await bounded(() => io.send('Input.dispatchMouseEvent', events[2]), true); }
    catch (error) { failure ??= error; }
    if (io.cancelled()) failure ??= new Error('Input cancelled');
    // A successful drag must retain its selection for the caller.
    if (failure) await collapse(platform);
  }
  if (failure) throw failure;
}
