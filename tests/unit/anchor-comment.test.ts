import { anchorComment, AnchorIO } from '../../packages/extension/src/anchor-comment';

function harness(failAt = '') {
  const calls: string[] = [];
  let cancelled = false;
  const op = async (name: string) => { calls.push(name); if (name === failAt) throw new Error('failed ' + name); };
  const io: AnchorIO = {
    platform: async () => { await op('platform'); return 'mac'; },
    attach: () => op('attach'), focusBody: () => op('body'),
    focusComposer: () => op('composer'), type: text => op('type:' + text),
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
it.each(['platform','attach','body','keyDown:moveToBeginningOfDocument:4','keyDown:moveRight:0','keyDown:moveRightAndModifySelection:8','keyDown:m:5','composer','type:hello'])('never posts after failure at %s', async stage => {
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
it.each(['focusBody','focusComposer','type','event'] as const)('bounds hung %s and never resumes posting after late completion', async method => {
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
