import { StepExecutor } from '../../src/step-executor.js';

function makeExec(html = '<div></div>') {
  document.body.innerHTML = html;
  return new StepExecutor(document, {}, {}, {});
}

// ── key action ────────────────────────────────────────────────────────────────
describe('key action', () => {
  it('dispatches single key to active element', () => {
    const ex = makeExec('<input id="q" />');
    const input = document.getElementById('q') as HTMLInputElement;
    input.focus();

    const events: string[] = [];
    input.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: 't' });
    expect(r.status).toBe('ok');
    expect(events).toContain('t');
  });

  it('dispatches named key Enter', () => {
    const ex = makeExec('<button id="btn">Go</button>');
    const btn = document.getElementById('btn')!;
    btn.focus();

    const events: string[] = [];
    btn.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: 'Enter' });
    expect(r.status).toBe('ok');
    expect(events).toContain('Enter');
  });

  it('dispatches Escape key (case-insensitive)', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    const events: string[] = [];
    el.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: 'escape' });
    expect(r.status).toBe('ok');
    expect(events).toContain('Escape');
  });

  it('dispatches ctrl+a modifier chord', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    let caught: KeyboardEvent | null = null;
    el.addEventListener('keydown', (e) => { caught = e as KeyboardEvent; });

    const r = ex.execute({ stepId: 's1', action: 'key', key: 'ctrl+a' });
    expect(r.status).toBe('ok');
    expect(caught).not.toBeNull();
    expect((caught as any).ctrlKey).toBe(true);
    expect((caught as any).key).toBe('a');
  });

  it('dispatches meta+a modifier chord', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    let caught: KeyboardEvent | null = null;
    el.addEventListener('keydown', (e) => { caught = e as KeyboardEvent; });

    const r = ex.execute({ stepId: 's1', action: 'key', key: 'meta+a' });
    expect(r.status).toBe('ok');
    expect((caught as any).metaKey).toBe(true);
    expect((caught as any).key).toBe('a');
  });

  it('dispatches key sequence as space-separated string', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    const events: string[] = [];
    el.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: 'g c' });
    expect(r.status).toBe('ok');
    expect(events).toEqual(['g', 'c']);
  });

  it('dispatches key sequence from keys array', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    const events: string[] = [];
    el.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: '', keys: ['g', 'c'] });
    expect(r.status).toBe('ok');
    expect(events).toEqual(['g', 'c']);
  });

  it('dispatches slash key', () => {
    const ex = makeExec('<div id="d" tabindex="0"></div>');
    const el = document.getElementById('d')!;
    el.focus();

    const events: string[] = [];
    el.addEventListener('keydown', (e) => events.push(e.key));

    const r = ex.execute({ stepId: 's1', action: 'key', key: '/' });
    expect(r.status).toBe('ok');
    expect(events).toContain('/');
  });
});

// ── wait action ────────────────────────────────────────────────────────────────
describe('wait action', () => {
  it('wait with ms only returns ok immediately in jsdom', () => {
    const ex = makeExec('<div></div>');
    const r = ex.execute({ stepId: 's1', action: 'wait', ms: 500 } as any);
    expect(r.status).toBe('ok');
    expect((r as any).delayMs).toBe(500);
  });

  it('wait with selector returns ok when element present', () => {
    const ex = makeExec('<div id="target"></div>');
    const r = ex.execute({ stepId: 's1', action: 'wait', selector: '#target' } as any);
    expect(r.status).toBe('ok');
  });

  it('wait with selector throws when element absent', () => {
    const ex = makeExec('<div></div>');
    const r = ex.execute({ stepId: 's1', action: 'wait', selector: '#missing' } as any);
    expect(r.status).toBe('error');
    expect(r.error).toContain('wait timeout');
  });
});

// ── extract_text action ────────────────────────────────────────────────────────
describe('extract_text action', () => {
  it('extracts text from a div', () => {
    const ex = makeExec('<div id="title">Hello World</div>');
    const r = ex.execute({ stepId: 's1', action: 'extract_text', selector: '#title' } as any);
    expect(r.status).toBe('ok');
    expect(r.text).toBe('Hello World');
  });

  it('extracts value from an input', () => {
    const ex = makeExec('<input id="q" value="test query" />');
    const r = ex.execute({ stepId: 's1', action: 'extract_text', selector: '#q' } as any);
    expect(r.status).toBe('ok');
    expect(r.text).toBe('test query');
  });

  it('stores result in buffer via store_as', () => {
    const ex = makeExec('<p id="msg">Important</p>');
    ex.execute({ stepId: 's1', action: 'extract_text', selector: '#msg', store_as: 'msg_text' } as any);
    expect(ex.getBuffer()['msg_text']).toBe('Important');
  });

  it('returns null for missing selector target', () => {
    const ex = makeExec('<div></div>');
    const r = ex.execute({ stepId: 's1', action: 'extract_text', selector: '#missing' } as any);
    expect(r.status).toBe('ok');
    expect(r.text).toBeNull();
  });

  it('errors when no selector provided', () => {
    const ex = makeExec('<div></div>');
    const r = ex.execute({ stepId: 's1', action: 'extract_text' } as any);
    expect(r.status).toBe('error');
  });
});
