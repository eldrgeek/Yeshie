const TEAMMATES = new Map([
  ['dee', 'dee'],
  ['codex', 'codex'],
  ['cody', 'codex'],
  ['opie', 'opie'],
  ['skip', 'skip'],
  ['cal', 'cal'],
  ['mem', 'mem'],
  ['sol', 'sol'],
  ['mae', 'mae'],
  ['kelp', 'kelp'],
  ['greta', 'greta'],
  ['locke', 'locke'],
  ['ren', 'ren'],
  ['tilt', 'tilt'],
  ['sona', 'sona'],
  ['drew', 'drew'],
  ['riff', 'riff'],
  ['rally', 'rally'],
  ['team', 'team'],
  ['panel', 'team'],
]);

const MODES = new Set(['auto', 'conversation', 'dispatch', 'strategy']);
const DISPATCH_TARGETS = new Set(['auto', 'code', 'chat', 'cowork']);

function canonicalTeammate(value) {
  return TEAMMATES.get(String(value || '').trim().toLowerCase()) || null;
}

/**
 * Turn a transcript plus optional UI selections into one safe routing envelope.
 * Explicit app controls win; voice grammar is only used when a control is "auto".
 */
export function parsePulseVoiceTurn(input = {}) {
  const originalText = String(input.text || '').trim();
  if (!originalText) throw new Error('text required');

  let text = originalText;
  let mode = String(input.mode || 'auto').toLowerCase();
  if (!MODES.has(mode)) throw new Error('mode must be auto|conversation|dispatch|strategy');

  let recipient = canonicalTeammate(input.recipient || input.target);
  if ((input.recipient || input.target) && !recipient) throw new Error('unknown recipient');

  let dispatchTarget = String(input.dispatch_target || 'auto').toLowerCase();
  if (!DISPATCH_TARGETS.has(dispatchTarget)) {
    throw new Error('dispatch_target must be auto|code|chat|cowork');
  }

  if (mode === 'auto') {
    if (/^(?:please\s+)?(?:dispatch|delegate|assign|send\s+(?:this|a task))\b/i.test(text)) {
      mode = 'dispatch';
      text = text.replace(/^(?:please\s+)?(?:dispatch|delegate|assign|send\s+(?:this|a task))\s*(?:to\s+(?:code|chat|cowork))?\s*[:,-]?\s*/i, '').trim() || originalText;
    } else if (/\b(?:roundtable|strategy session|strategic discussion|ask the (?:whole )?team|bring in the team)\b/i.test(text)) {
      mode = 'strategy';
      recipient = 'team';
    } else {
      mode = 'conversation';
    }
  }

  if (mode === 'dispatch') {
    const targetMatch = originalText.match(/^(?:please\s+)?(?:dispatch|delegate|assign|send\s+(?:this|a task))\s+to\s+(code|chat|cowork)\b/i);
    if (targetMatch && dispatchTarget === 'auto') dispatchTarget = targetMatch[1].toLowerCase();
    return { text, mode, recipient: 'dispatcher', dispatchTarget };
  }

  if (!recipient || recipient === 'dee') {
    const direct = text.match(/^(?:hey\s+)?([a-z0-9-]+)\s*[:,]\s*(.+)$/i)
      || text.match(/^(?:ask|tell|talk\s+to)\s+([a-z0-9-]+)\s+(?:to\s+)?(.+)$/i);
    if (direct) {
      const named = canonicalTeammate(direct[1]);
      if (named) {
        recipient = named;
        text = direct[2].trim();
      }
    }
  }

  if (mode === 'strategy' || recipient === 'team') {
    mode = 'strategy';
    recipient = 'team';
  }

  return {
    text,
    mode,
    recipient: recipient || 'dee',
    dispatchTarget,
  };
}

export const pulseVoiceTeammates = Object.freeze([...new Set(TEAMMATES.values())]);
