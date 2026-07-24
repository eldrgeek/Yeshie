/**
 * @jest-environment node
 */

import { parsePulseVoiceTurn } from '../../packages/relay/pulse-voice.js';

describe('Pulse glasses voice routing', () => {
  test('defaults a plain turn to Dee', () => {
    expect(parsePulseVoiceTurn({ text: 'What should we focus on today?' })).toEqual({
      text: 'What should we focus on today?',
      mode: 'conversation',
      recipient: 'dee',
      dispatchTarget: 'auto',
    });
  });

  test('routes a spoken addressee and removes the invocation', () => {
    expect(parsePulseVoiceTurn({ text: 'Codex, inspect the release plan' })).toMatchObject({
      text: 'inspect the release plan',
      mode: 'conversation',
      recipient: 'codex',
    });
  });

  test('routes strategic discussions to the team panel', () => {
    expect(parsePulseVoiceTurn({ text: 'Start a strategic discussion about Legends' })).toMatchObject({
      mode: 'strategy',
      recipient: 'team',
    });
  });

  test('parses dispatch target and task', () => {
    expect(parsePulseVoiceTurn({ text: 'Dispatch to code: fix the failing tests' })).toEqual({
      text: 'fix the failing tests',
      mode: 'dispatch',
      recipient: 'dispatcher',
      dispatchTarget: 'code',
    });
  });

  test('explicit controls override voice auto-routing', () => {
    expect(parsePulseVoiceTurn({
      text: 'Dispatch this thought to Codex',
      mode: 'conversation',
      recipient: 'opie',
    })).toMatchObject({
      mode: 'conversation',
      recipient: 'opie',
      text: 'Dispatch this thought to Codex',
    });
  });

  test('rejects unknown recipients', () => {
    expect(() => parsePulseVoiceTurn({ text: 'hello', recipient: 'nobody' }))
      .toThrow('unknown recipient');
  });
});
