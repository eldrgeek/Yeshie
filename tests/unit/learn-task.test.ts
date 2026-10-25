/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { compileTrace, reduceTrace, selectorFor, urlMarker } from '../../scripts/learn-task.mjs';

const ROOT = join(process.cwd());
const zoomTrace = readFileSync(join(ROOT, 'tests/fixtures/traces/zoom-passcode.trace.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(line => JSON.parse(line));

const ev = (event_type: string, url: string, extra: object = {}, ts = 0) => ({
  event_type, url, episode_id: 'e1', ts: `2026-10-25T12:00:${String(ts).padStart(2, '0')}.000Z`, ...extra,
});

describe('reduceTrace', () => {
  test('keeps one input per field, drops the focus click and ties the page load to its click', () => {
    const { startUrl, actions } = reduceTrace(zoomTrace);
    expect(startUrl).toBe('https://zoom.us/profile');
    expect(actions.map((a: any) => a.kind)).toEqual(['click', 'input', 'click', 'click']);
    expect(actions[0].navigatedTo).toBe('https://zoom.us/meeting/8546384441/edit');
    expect(actions[1].value).toBe('Tr0ub4dor9x');
  });

  test('a URL change with no click before it becomes its own step', () => {
    const { actions } = reduceTrace([
      ev('input', 'https://a.test/x', { target: { role: 'textbox', name: 'Search' }, value: { literal: 'q' } }, 1),
      ev('navigate', 'https://a.test/results', {}, 2),
    ]);
    expect(actions.map((a: any) => a.kind)).toEqual(['input', 'navigate']);
  });
});

describe('compileTrace on the Zoom passcode recording', () => {
  const { guide, payload, notes, host } = compileTrace(zoomTrace, { name: 'zoom-passcode', episodeId: 'e1' });

  test('matches the shape of the hand-written guide: Edit, type then Save, Copy', () => {
    expect(host).toBe('zoom.us');
    expect(guide.url).toBe('https://zoom.us/profile');
    expect(guide.steps.map((s: any) => s.instruction)).toEqual([
      'Click the Edit link.',
      'Type the passcode in the Passcode box, then click Save.',
      'Click Copy Invitation.',
    ]);
    expect(guide.steps[0].doneWhen).toEqual({ urlIncludes: 'zoom.us/meeting/8546384441/edit' });
  });

  test('waits for Save to go when the next URL is a prefix of the current one', () => {
    expect(guide.steps[1].doneWhen).toEqual({ selectorGone: guide.steps[1].target });
  });

  test('never writes a secret-looking value to the guide or payload', () => {
    expect(JSON.stringify({ guide, payload })).not.toContain('Tr0ub4dor9x');
    expect(notes.join(' ')).toContain('looks secret');
  });

  test('payload is a draft with the typed value as a param', () => {
    expect(payload._meta.learned).toMatchObject({ status: 'draft', cleanGuidedRuns: 0, promoteAfter: 2, episodeId: 'e1' });
    expect(payload.chain.map((s: any) => `${s.action}:${s.target || s.url}`)).toEqual([
      'navigate:{{start_url}}', 'click:edit', 'wait_for:passcode', 'type:passcode', 'click:save', 'wait_for:copy_invitation', 'click:copy_invitation',
    ]);
    expect(payload.chain.find((s: any) => s.action === 'type').value).toBe('{{passcode}}');
    expect(payload.abstractTargets.passcode.anchors).toEqual({ ariaLabel: 'Passcode' });
  });

  test('keeps a non-secret recorded value as an example', () => {
    const r = compileTrace([
      ev('input', 'https://a.test/', { target: { role: 'textbox', name: 'Title', selector: '[placeholder="Title"]' }, value: { literal: 'Hello' } }, 1),
      ev('click', 'https://a.test/', { target: { role: 'button', name: 'Publish' } }, 2),
    ]);
    expect(r.payload._meta.params.title.example).toBe('Hello');
  });

  test('refuses a recording with nothing done in it', () => {
    expect(() => compileTrace([ev('episode_start', 'https://a.test/')])).toThrow('no clicks or typing');
  });
});

describe('helpers', () => {
  test('selectorFor puts the stable attribute first and escapes quotes', () => {
    expect(selectorFor({ role: 'button', name: 'Say "hi"', selector: '[data-testid="hi"]' }))
      .toBe('[data-testid="hi"], button:has-text("Say \\"hi\\""), [role="button"]:has-text("Say \\"hi\\"")');
    expect(selectorFor({ role: 'textbox', name: 'Email', selector: null })).toBe('');
  });

  test('urlMarker keeps host and path, or the host alone for a root page', () => {
    expect(urlMarker('https://zoom.us/profile?x=1')).toBe('zoom.us/profile');
    expect(urlMarker('https://chatgpt.com/')).toBe('chatgpt.com');
  });
});

describe('start page checks', () => {
  test('flags a recording that starts on a non-https page', () => {
    const r = compileTrace([ev('click', 'http://127.0.0.1:8099/index.html', { target: { role: 'link', name: 'Edit' } }, 1)]);
    expect(r.notes.join(' ')).toContain('not https');
  });

  test('sorts events by time even when they arrived out of order', () => {
    const field = { role: 'textbox', name: 'Title' };
    const { actions } = reduceTrace([
      ev('input', 'https://a.test/', { target: field, value: { literal: 'abc' } }, 3),
      ev('input', 'https://a.test/', { target: field, value: { literal: 'ab' } }, 2),
    ]);
    expect(actions[0].value).toBe('abc');
  });
});
