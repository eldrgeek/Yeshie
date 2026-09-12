import { keyChordEvents } from '../../../src/cdp-input.js';

export interface AnchorIO {
  platform(): Promise<string>;
  attach(): Promise<unknown>;
  focusBody(): Promise<unknown>;
  event(event: object): Promise<unknown>;
  suggestionVisible(): Promise<boolean>;
  insertComment(): Promise<boolean>;
  focusComposer(): Promise<boolean>;
  type(text: string): Promise<unknown>;
  cancelled(): boolean;
}

// Each IO method issues exactly one operation: timed-out continuations cannot
// dispatch more input. Browser commands already submitted cannot be recalled.
export async function anchorComment(offset: unknown, phrase: string, comment: string, io: AnchorIO, timeoutMs = 2000) {
  if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > 10000) throw new Error('start_offset must be an integer from 0 to 10000');
  if (typeof phrase !== 'string' || !phrase.length || phrase.length > 10000) throw new Error('target_phrase length must be 1 to 10000');
  if (typeof comment !== 'string' || !comment.length) throw new Error('comment_text is required');
  let moved = false;
  const bounded = async <T>(operation: () => Promise<T>, cleanup = false): Promise<T> => {
    if (!cleanup && io.cancelled()) throw new Error('Anchor cancelled');
    let timer: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;
    try {
      const value = await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Anchor operation timed out')), timeoutMs);
          poll = setInterval(() => { if (!cleanup && io.cancelled()) reject(new Error('Anchor cancelled')); }, 10);
        }),
      ]);
      if (!cleanup && io.cancelled()) throw new Error('Anchor cancelled');
      return value;
    } finally { clearTimeout(timer!); clearInterval(poll!); }
  };
  const key = async (chord: string, cleanup = false) => {
    for (const event of keyChordEvents(chord, 'mac')) await bounded(() => io.event(event), cleanup);
  };
  try {
    if (await bounded(() => io.platform()) !== 'mac') throw new Error('anchor_comment requires macOS');
    await bounded(() => io.attach());
    await bounded(() => io.focusBody());
    moved = true;
    await key('cmd+Home');
    for (let i = 0; i < Number(offset); i++) await key('ArrowRight');
    for (let i = 0; i < phrase.length; i++) await key('shift+ArrowRight');
    // Retry only observed UI absence/interference, never rejected/timed-out IO.
    // Polling is outside page scripts so timeout/cancellation cannot leave a
    // continuation that later clicks, focuses, or posts.
    const pause = () => bounded(() => new Promise<void>(resolve => setTimeout(resolve, 50)));
    const dismissSuggestions = async () => {
      await key('Escape'); // No modifiers or editing commands.
      for (let poll = 0; poll < 10; poll++) {
        if (!await bounded(() => io.suggestionVisible())) return;
        await pause();
        await key('Escape');
      }
      throw new Error('Cannot dismiss spelling or grammar suggestion chip');
    };
    let focused = false;
    for (let attempt = 0; attempt < 3 && !focused; attempt++) {
      await dismissSuggestions();
      if (attempt < 2) await key('cmd+alt+m');
      else if (!await bounded(() => io.insertComment())) break;
      for (let poll = 0; poll < 10; poll++) {
        if (await bounded(() => io.suggestionVisible())) break; // Re-dismiss on next attempt.
        if (await bounded(() => io.focusComposer())) {
          // Check again after focus: a suggestion can reappear during opening.
          if (await bounded(() => io.suggestionVisible())) break;
          focused = await bounded(() => io.focusComposer());
          if (focused) break;
        }
        await pause();
      }
    }
    if (!focused) throw new Error('Cannot focus comment composer');
    await bounded(() => io.type(comment));
    await key('cmd+Enter');
    return { anchor: 'UNVERIFIED', verified: false, start_offset: offset, length: phrase.length };
  } catch (error) {
    if (moved) {
      const failures: string[] = [];
      try { await bounded(() => io.focusBody(), true); } catch (e) { failures.push(String(e)); }
      try { await key('ArrowRight', true); } catch (e) { failures.push(String(e)); }
      if (failures.length) throw new Error(`${String(error)}; selection cleanup failed: ${failures.join('; ')}`);
    }
    throw error;
  }
}
