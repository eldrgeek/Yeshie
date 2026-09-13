import {
  closeDocsFindEvents,
  dragSelectEvents,
  keyChordEvents,
  keyRepeatCount,
  mouseClickEvents,
  openCommentComposerEvents,
  openDocsFindEvents,
  submitDocsFindEvents,
} from '../../src/cdp-input';
import { readFileSync } from 'fs';
import { PayloadSchema } from '../../src/schema';

const cases = [
  ['cmd+a', 'a', 'KeyA', 65, 4, 'selectAll'],
  ['shift+arrowleft', 'ArrowLeft', 'ArrowLeft', 37, 8, 'moveLeftAndModifySelection'],
  ['shift+arrowright', 'ArrowRight', 'ArrowRight', 39, 8, 'moveRightAndModifySelection'],
  ['shift+arrowup', 'ArrowUp', 'ArrowUp', 38, 8, 'moveUpAndModifySelection'],
  ['shift+arrowdown', 'ArrowDown', 'ArrowDown', 40, 8, 'moveDownAndModifySelection'],
  ...(['left', 'right'] as const).flatMap((d) => {
    const D = d === 'left' ? 'Left' : 'Right';
    const edge = d === 'left' ? 'Beginning' : 'End';
    const vk = d === 'left' ? 37 : 39;
    return [
      [`alt+shift+arrow${d}`, `Arrow${D}`, `Arrow${D}`, vk, 9, `moveWord${D}AndModifySelection`],
      [`alt+arrow${d}`, `Arrow${D}`, `Arrow${D}`, vk, 1, `moveWord${D}`],
      [`cmd+shift+arrow${d}`, `Arrow${D}`, `Arrow${D}`, vk, 12, `moveTo${edge}OfLineAndModifySelection`],
      [`cmd+arrow${d}`, `Arrow${D}`, `Arrow${D}`, vk, 4, `moveTo${edge}OfLine`],
    ];
  }),
  ...(['home', 'end', 'arrowup', 'arrowdown'] as const).flatMap(k => {
    const key = {home:'Home', end:'End', arrowup:'ArrowUp', arrowdown:'ArrowDown'}[k];
    const vk = {home:36, end:35, arrowup:38, arrowdown:40}[k];
    const edge = k === 'home' || k === 'arrowup' ? 'Beginning' : 'End';
    return [
      [`cmd+${k}`, key, key, vk, 4, `moveTo${edge}OfDocument`],
      [`cmd+shift+${k}`, key, key, vk, 12, `moveTo${edge}OfDocumentAndModifySelection`],
      ...(['home','end'].includes(k) ? [[`shift+${k}`, key, key, vk, 8, `moveTo${edge}OfDocumentAndModifySelection`]] : []),
    ];
  }),
];
it.each(cases)('exact macOS payload for %s', (spec, key, code, vk, modifiers, command) => {
  const base = {key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers};
  expect(keyChordEvents(String(spec), 'mac')).toEqual([
    {type:'keyDown', ...base, commands:[command]}, {type:'keyUp', ...base},
  ]);
});
it.each(['win','linux','cros'])('preserves non-Mac payloads on %s', platform => {
  for (const [spec] of cases) {
    const expected = keyChordEvents(String(spec), 'mac').map(({commands, ...event}: any) => event);
    expect(keyChordEvents(String(spec), platform)).toEqual(expected);
  }
});
it('normalizes existing aliases and modifier order', () => {
  expect(keyChordEvents('Shift+Command+Home','mac')).toEqual(keyChordEvents('cmd+shift+home','mac'));
  expect(keyChordEvents('meta+a','mac')).toEqual(keyChordEvents('cmd+a','mac'));
});
it.each(['cmd+c','Home','End','Enter','cmd+alt+m','cmd+Enter','ctrl+a','ctrl+cmd+a'])('does not add editing commands to %s', spec => {
  expect(keyChordEvents(spec,'mac').every(e => !('commands' in e))).toBe(true);
});
it('builds exact Docs Find open payload with no commands', () => {
  expect(openDocsFindEvents()).toEqual([
    { type: 'rawKeyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, modifiers: 4 },
    { type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, modifiers: 4 },
  ]);
  expect(openDocsFindEvents().every(e => !('commands' in e))).toBe(true);
});
it('builds exact Docs Find Enter/Escape payloads', () => {
  expect(submitDocsFindEvents()).toEqual([
    {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 0,
      text: '\r',
      unmodifiedText: '\r',
    },
    {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 0,
    },
  ]);
  expect(closeDocsFindEvents()).toEqual([
    { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, modifiers: 0 },
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, modifiers: 0 },
  ]);
});
it('builds exact comment-composer shortcut with no commands', () => {
  expect(openCommentComposerEvents()).toEqual([
    { type: 'rawKeyDown', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77, nativeVirtualKeyCode: 77, modifiers: 5 },
    { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77, nativeVirtualKeyCode: 77, modifiers: 5 },
  ]);
  expect(openCommentComposerEvents().every(e => !('commands' in e))).toBe(true);
});
it('builds trusted left-click payload', () => {
  expect(mouseClickEvents({ x: 10, y: 20 })).toEqual([
    { type: 'mousePressed', x: 10, y: 20, button: 'left', buttons: 1, clickCount: 1 },
    { type: 'mouseReleased', x: 10, y: 20, button: 'left', buttons: 0, clickCount: 1 },
  ]);
});
it.each([NaN, Infinity, -1, undefined, 'x'])('rejects invalid click coordinate %s', x => {
  expect(() => mouseClickEvents({ x: x as number, y: 5 })).toThrow();
});
it('generates trusted drag press, held move, release in viewport CSS pixels', () => {
  expect(dragSelectEvents({x:0,y:12.5},{x:200,y:30})).toEqual([
    {type:'mousePressed',x:0,y:12.5,button:'left',buttons:1,clickCount:1},
    {type:'mouseMoved',x:200,y:30,button:'left',buttons:1},
    {type:'mouseReleased',x:200,y:30,button:'left',buttons:0,clickCount:1},
  ]);
});
it.each([NaN,Infinity,-1,undefined,'2'])('rejects invalid drag coordinate %s', x => {
  expect(() => dragSelectEvents({x:x as number,y:1},{x:2,y:3})).toThrow();
});
it('counts phrase graphemes and permits zero-offset movement', () => {
  expect(keyRepeatCount()).toBe(1);
  expect(keyRepeatCount('0')).toBe(0);
  expect(keyRepeatCount(undefined,'ready for a reading')).toBe(19);
  expect(keyRepeatCount(undefined,'e\u0301')).toBe(1);
});
it.each([-1,1.5,Infinity,'bad',10001])('rejects invalid repeat %s', count => {
  expect(() => keyRepeatCount(count)).toThrow();
});
it('recipe validates and selects by count before inserting and posting', () => {
  const recipe = JSON.parse(readFileSync(new URL('../../sites/docs.google.com/tasks/04-anchor-comment-on-text.payload.json', import.meta.url),'utf8'));
  expect(PayloadSchema.safeParse(recipe).success).toBe(true);
  expect(recipe._meta.validationStatus).toBe('COS raw-CDP live proof 2026-09-13; extension path not yet live-verified');
  expect(recipe._meta.runCount).toBe(1);
  expect(recipe._meta.requiredParams).toEqual(['target_phrase', 'comment_text']);
  expect(recipe._meta.params.occurrence.default).toBe(1);
  expect(recipe._meta.supersededFindings).toHaveLength(1);
  expect(recipe.chain).toEqual([{
    stepId:'anchor-comment',
    action:'anchor_comment',
    target_phrase:'{{target_phrase}}',
    occurrence:'{{occurrence}}',
    comment_text:'{{comment_text}}',
  }]);
});

const background = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');
it('background drag action sends events in order and releases after a failed move', async () => {
  const sent: any[] = [];
  let fail = false;
  const run = actionHarness('drag_select', async (method, event) => {
    sent.push([{tabId:42}, method, event]);
    if (fail && event.type === 'mouseMoved') throw new Error('move failed');
  }, () => false);
  const step = {stepId:'drag',start:{x:10,y:20},end:{x:50,y:20}};
  expect((await run(step)).status).toBe('ok');
  const expected = dragSelectEvents(step.start,step.end).map(e => [{tabId:42},'Input.dispatchMouseEvent',e]);
  expect(sent).toEqual(expected);
  sent.length=0; fail=true;
  await expect(run(step)).rejects.toThrow('move failed');
  expect(sent).toEqual([...expected, ...keyChordEvents('ArrowRight','mac').map(e => [{tabId:42},'Input.dispatchKeyEvent',e])]);
});

// Execute the actual action branches with a stalled/cancellable debugger.
import ts from 'typescript';
import * as input from '../../src/cdp-input';
function actionHarness(action: string, send: (method: string, event: any) => Promise<unknown>, cancelled: () => boolean, attach = async () => {}) {
  const body = background.split(`      if (a === '${action}') {`)[1].split("      if (a === '")[0];
  const source = `return async function(step) {
    let _debuggerTabId=null; const tabId=42, a='${action}', t0=Date.now(), params={}, buffer={}, run={runId:'test'},
      abortFlags={get:()=>cancelled()};
    ${background.split('  // Bounded input attachment recovery')[1].split('  async function releaseDebugger')[0]}
    ${body}`;
  const names = Object.keys(input);
  return new Function(...names, 'chrome', 'ensureDebugger', 'cancelled', 'interpolate', 'dispatchKeyChordCDP',
    ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(
    ...Object.values(input), {runtime:{getPlatformInfo:async()=>({os:'mac'})}, debugger:{attach,sendCommand:(_:any,m:string,e:any)=>send(m,e)}},
    attach, cancelled, (v:string)=>v, async (_:number,s:string)=>{for(const e of keyChordEvents(s,'mac')) await send('Input.dispatchKeyEvent',e);});
}
it('cancels a 10000-repeat selection between events and collapses it', async () => {
  const events:any[]=[];
  let cancelled=false;
  const run=actionHarness('key',async (_,e)=>{events.push(e); if(events.length===5) cancelled=true;},()=>cancelled);
  await expect(run({key:'shift+ArrowRight',repeat:10000})).rejects.toThrow(/cancel/i);
  expect(events).toHaveLength(7);
  expect(events.slice(-2)).toEqual(keyChordEvents('ArrowRight','mac'));
});
it('times out a hung mouse move, releases, and collapses selection', async () => {
  const events:any[]=[];
  const run=actionHarness('drag_select',async (_,e)=>{events.push(e); if(e.type==='mouseMoved') return new Promise(()=>{});},()=>false);
  await expect(run({start:{x:1,y:2},end:{x:3,y:4}})).rejects.toThrow(/timed out/i);
  expect(events.map(e=>e.type)).toEqual(['mousePressed','mouseMoved','mouseReleased','keyDown','keyUp']);
  expect(events.slice(-2)).toEqual(keyChordEvents('ArrowRight','mac'));
}, 7000);

it.each(['keyDown', 'keyUp'])('bounds a stalled repeated-key %s and collapses', async stalled => {
  const events:any[]=[];
  await expect(input.repeatedKeys(['shift+ArrowRight'],10000,{
    attach:async()=>{}, platform:async()=> 'mac', cancelled:()=>false,
    send:async (_,e:any)=>{events.push(e); if(e.modifiers===8 && e.type===stalled) return new Promise(()=>{});},
  },15)).rejects.toThrow('timed out');
  expect(events.slice(-2)).toEqual(keyChordEvents('ArrowRight','mac'));
});
it.each(['attach','mousePressed','mouseReleased','keyDown'])('bounds drag %s including cleanup', async stalled => {
  const events:any[]=[];
  await expect(input.dragSelection({x:1,y:2},{x:3,y:4},{
    attach:async()=>{if(stalled==='attach') return new Promise(()=>{});},
    platform:async()=> 'mac', cancelled:()=>false,
    send:async (_,e:any)=>{
      events.push(e);
      if(e.type===stalled) return new Promise(()=>{});
      if(stalled==='keyDown' && e.type==='mouseMoved') throw new Error('move failed');
    },
  },15)).rejects.toThrow();
  expect(events.some(e=>e.type==='mouseReleased')).toBe(true);
  expect(events.slice(-2).map(e=>[e.type,e.key,e.modifiers])).toEqual([['keyDown','ArrowRight',0],['keyUp','ArrowRight',0]]);
});
it('cancels a pending mouse move and still releases and collapses', async () => {
  let cancelled=false;
  const events:any[]=[];
  await expect(input.dragSelection({x:1,y:2},{x:3,y:4},{
    attach:async()=>{}, platform:async()=> 'mac', cancelled:()=>cancelled,
    send:async (_,e:any)=>{events.push(e); if(e.type==='mouseMoved') {cancelled=true; return new Promise(()=>{});}},
  },100)).rejects.toThrow('cancelled');
  expect(events.map(e=>e.type)).toEqual(['mousePressed','mouseMoved','mouseReleased','keyDown','keyUp']);
});
