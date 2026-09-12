import { anchorComment, AnchorIO } from '../../packages/extension/src/anchor-comment';

function harness(failAt = '') {
  const calls: string[] = [];
  let cancelled = false;
  const op = async (name: string) => { calls.push(name); if (name === failAt) throw new Error('failed ' + name); };
  const io: AnchorIO = {
    platform: async () => { await op('platform'); return 'mac'; },
    attach: () => op('attach'), focusBody: () => op('body'),
    suggestionVisible: async () => { await op('suggestion'); return false; },
    insertComment: async () => { await op('toolbar'); return true; },
    focusComposer: async () => { await op('composer'); return true; }, type: text => op('type:' + text),
    event: async (e: any) => op(`${e.type}:${e.commands?.[0] || e.key}:${e.modifiers}`),
    cancelled: () => cancelled,
  };
  return { io, calls, cancel: () => { cancelled = true; } };
}
it('uses supplied offset and UTF-16 length, returning explicitly unverified', async () => {
  const h = harness();
  expect(await anchorComment(2, '😀', 'hello', h.io)).toEqual({anchor:'UNVERIFIED',verified:false,start_offset:2,length:2});
  expect(h.calls.filter(x => x === 'keyDown:moveRight:0')).toHaveLength(2);
  expect(h.calls.filter(x => x === 'keyDown:moveRightAndModifySelection:8')).toHaveLength(2);
  expect(h.calls.indexOf('composer')).toBeLessThan(h.calls.indexOf('type:hello'));
  expect(h.calls.at(-2)).toBe('keyDown:Enter:4');
});
it.each(['platform','attach','body','keyDown:moveToBeginningOfDocument:4','keyDown:moveRight:0','keyDown:moveRightAndModifySelection:8','keyDown:Escape:0','suggestion','keyDown:m:5','composer','type:hello'])('never posts after failure at %s', async stage => {
  const h = harness(stage);
  await expect(anchorComment(1,'x','hello',h.io)).rejects.toThrow();
  expect(h.calls).not.toContain('keyDown:Enter:4');
  if (!['platform','attach','body'].includes(stage)) expect(h.calls).toContain('keyDown:moveRight:0');
});
it('cancels between selection keystrokes and collapses without Shift', async () => {
  const h = harness(); const event = h.io.event;
  h.io.event = async (e: any) => { await event(e); if (e.commands?.[0] === 'moveRightAndModifySelection') h.cancel(); };
  await expect(anchorComment(0,'long','hello',h.io)).rejects.toThrow('cancelled');
  expect(h.calls.slice(-3)).toEqual(['body','keyDown:moveRight:0','keyUp:ArrowRight:0']);
  expect(h.calls).not.toContain('composer');
});
it.each(['focusBody','suggestionVisible','focusComposer','type','event'] as const)('bounds hung %s and never resumes posting after late completion', async method => {
  const h = harness(); let resolve!: () => void;
  h.io[method] = (() => new Promise<void>(r => { resolve = r; })) as any;
  await expect(anchorComment(0,'x','hello',h.io,20)).rejects.toThrow(/timed out/);
  const before = [...h.calls]; resolve(); await new Promise(r => setTimeout(r,25));
  expect(h.calls).toEqual(before);
  expect(h.calls).not.toContain('keyDown:Enter:4');
});
it.each([undefined, -1, 1.2, NaN, '2'])('rejects invalid offset %s before focus', async offset => {
  const h = harness(); await expect(anchorComment(offset,'x','hello',h.io)).rejects.toThrow('start_offset'); expect(h.calls).toEqual([]);
});
it('sends exactly the live offset and phrase length from document start', async () => {
  const h = harness();
  await anchorComment(25, 'ready for a reading', 'hello', h.io);
  expect(h.calls.filter(x => x === 'keyDown:moveRight:0')).toHaveLength(25);
  expect(h.calls.filter(x => x === 'keyUp:ArrowRight:0')).toHaveLength(25);
  expect(h.calls.filter(x => x === 'keyDown:moveRightAndModifySelection:8')).toHaveLength(19);
  expect(h.calls.filter(x => x === 'keyUp:ArrowRight:8')).toHaveLength(19);
  expect(h.calls.indexOf('keyDown:moveToBeginningOfDocument:4')).toBeLessThan(h.calls.indexOf('keyDown:moveRight:0'));
  expect(h.calls.indexOf('keyDown:Escape:0')).toBeLessThan(h.calls.indexOf('keyDown:m:5'));
});
it('dismisses a chip that reappears while opening, then retries', async () => {
  const h = harness();
  const visibility = [true, false, true, false, false, false];
  h.io.suggestionVisible = async () => visibility.shift() ?? false;
  await anchorComment(0, 'x', 'hello', h.io);
  expect(h.calls.filter(x => x === 'keyDown:Escape:0')).toHaveLength(3);
  expect(h.calls.filter(x => x === 'keyDown:m:5')).toHaveLength(2);
  expect(h.calls.filter(x => x === 'type:hello')).toHaveLength(1);
});
it('uses the toolbar after two bounded shortcut attempts', async () => {
  const h = harness();
  h.io.focusComposer = async () => h.calls.includes('toolbar');
  await anchorComment(0, 'x', 'hello', h.io);
  expect(h.calls.filter(x => x === 'keyDown:m:5')).toHaveLength(2);
  expect(h.calls.filter(x => x === 'toolbar')).toHaveLength(1);
  expect(h.calls).toContain('type:hello');
});
it.each(['chip', 'composer'])('aborts and collapses if %s never becomes ready', async mode => {
  const h = harness();
  h.io.suggestionVisible = async () => mode === 'chip';
  h.io.focusComposer = async () => false;
  await expect(anchorComment(0, 'x', 'hello', h.io)).rejects.toThrow(/Cannot/);
  expect(h.calls).not.toContain('type:hello');
  expect(h.calls).not.toContain('keyDown:Enter:4');
  expect(h.calls.slice(-3)).toEqual(['body','keyDown:moveRight:0','keyUp:ArrowRight:0']);
});
it('cancels during composer polling without typing', async () => {
  const h = harness();
  h.io.focusComposer = async () => { h.cancel(); return false; };
  await expect(anchorComment(0, 'x', 'hello', h.io)).rejects.toThrow('cancelled');
  expect(h.calls).not.toContain('type:hello');
});
