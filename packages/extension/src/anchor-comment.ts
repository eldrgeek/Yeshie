import {
  closeDocsFindEvents,
  mouseClickEvents,
  openCommentComposerEvents,
  openDocsFindEvents,
  submitDocsFindEvents,
} from '../../../src/cdp-input.js';

export interface AnchorIO {
  platform(): Promise<string>;
  attach(): Promise<unknown>;
  send(method: string, payload: object): Promise<unknown>;
  bodyState(): Promise<{ clickPoint: { x: number; y: number } | null; focused: boolean }>;
  modalText(): Promise<string | null>;
  findState(): Promise<{ visible: boolean; focused: boolean; current: number; total: number; unreadable?: boolean; noResults?: boolean }>;
  composerState(composerToken: string): Promise<{ visible: boolean; focused: boolean; text: string }>;
  composerCommentButtonPoint(composerToken: string): Promise<{ x: number; y: number } | null>;
  composerCancelButtonPoint(composerToken: string): Promise<{ x: number; y: number } | null>;
  cardExactTextCount(text: string): Promise<number>;
  cancelled(): boolean;
}

// Each IO method issues exactly one operation: timed-out continuations cannot
// dispatch more input. Browser commands already submitted cannot be recalled.
export async function anchorComment(targetPhrase: unknown, occurrence: unknown, comment: unknown, io: AnchorIO, timeoutMs = 2000) {
  if (typeof targetPhrase !== 'string' || targetPhrase.length < 1 || targetPhrase.length > 500) {
    throw new Error('target_phrase length must be 1 to 500');
  }
  const targetOccurrence = occurrence === '' || occurrence === undefined || occurrence === null
    ? 1
    : Number(occurrence);
  if (!Number.isSafeInteger(targetOccurrence) || targetOccurrence < 1 || targetOccurrence > 10000) {
    throw new Error('occurrence must be an integer from 1 to 10000');
  }
  if (typeof comment !== 'string' || !comment.length) throw new Error('comment_text is required');

  const normalize = (text: string) => text.replace(/\r\n/g, '\n');
  let findOpenAttempted = false;
  let composerPinned = false;
  let postAttempted = false;
  const composerToken = `yeshie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
  const sendAll = async (method: string, events: object[], cleanup = false) => {
    for (const event of events) await bounded(() => io.send(method, event), cleanup);
  };

  const click = async (point: { x: number; y: number }, cleanup = false) => {
    await sendAll('Input.dispatchMouseEvent', mouseClickEvents(point), cleanup);
  };
  const pause = async (ms: number) => bounded(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

  const ensureFindFocused = async () => {
    const state = await bounded(() => io.findState());
    if (!state.visible || !state.focused) throw new Error('find_not_focused');
    return state;
  };
  const waitForFindFocusedAfterOpen = async () => {
    const started = Date.now();
    while (Date.now() - started <= 3000) {
      const state = await bounded(() => io.findState());
      if (state.visible && state.focused) return state;
      const elapsed = Date.now() - started;
      const remaining = 3000 - elapsed;
      if (remaining <= 0) break;
      await pause(Math.min(100, remaining));
    }
    throw new Error('find_not_focused');
  };
  const hasReadableCounter = (state: { current: number; total: number; unreadable?: boolean; noResults?: boolean }) =>
    !state.unreadable && Number.isInteger(state.current) && Number.isInteger(state.total) && state.current >= 0 && state.total >= 0;
  const sameCounter = (
    a: { current: number; total: number },
    b: { current: number; total: number },
  ) => a.current === b.current && a.total === b.total;
  const waitForStableFindCounter = async (previousCurrent?: number) => {
    let sawReadable = false;
    let sawUnreadable = false;
    for (let poll = 0; poll < 20; poll++) {
      const first = await ensureFindFocused();
      if (!hasReadableCounter(first) && !first.noResults) {
        sawUnreadable = true;
        await pause(100);
        continue;
      }
      await pause(100);
      const second = await ensureFindFocused();
      if (!hasReadableCounter(second) && !second.noResults) {
        sawUnreadable = true;
        continue;
      }
      sawReadable = true;
      if (!sameCounter(first, second)) continue;
      if (previousCurrent !== undefined && second.current === previousCurrent) continue;
      return second;
    }
    if (sawUnreadable && !sawReadable) throw new Error('find_counter_unreadable');
    throw new Error('find_counter_unstable');
  };

  try {
    if (await bounded(() => io.platform()) !== 'mac') throw new Error('anchor_comment requires macOS');
    await bounded(() => io.attach());

    const modal = await bounded(() => io.modalText());
    if (modal) throw new Error(`blocking_modal_present: ${modal}`);

    const beforeFocus = await bounded(() => io.bodyState());
    if (!beforeFocus.clickPoint) throw new Error('cannot_focus_body');
    await click(beforeFocus.clickPoint);
    const afterFocus = await bounded(() => io.bodyState());
    if (!afterFocus.focused) throw new Error('cannot_focus_body');

    findOpenAttempted = true;
    await sendAll('Input.dispatchKeyEvent', openDocsFindEvents());
    await waitForFindFocusedAfterOpen();
    await bounded(() => io.send('Input.insertText', { text: targetPhrase }));

    let find = await waitForStableFindCounter();
    if (!hasReadableCounter(find) && !find.noResults) throw new Error('find_counter_unreadable');
    if (find.noResults || (find.current === 0 && find.total === 0)) throw new Error('phrase_not_found');
    if (targetOccurrence > find.total) throw new Error('occurrence_out_of_range');

    let presses = 0;
    const maxPresses = find.total + 1;
    while (find.current !== targetOccurrence && presses < maxPresses) {
      const beforeEnter = find.current;
      await ensureFindFocused();
      await sendAll('Input.dispatchKeyEvent', submitDocsFindEvents());
      find = await waitForStableFindCounter(beforeEnter);
      presses++;
    }
    if (find.current !== targetOccurrence) throw new Error('occurrence_not_reached');

    await sendAll('Input.dispatchKeyEvent', closeDocsFindEvents());
    findOpenAttempted = false;

    await sendAll('Input.dispatchKeyEvent', openCommentComposerEvents());
    let composerFocused = false;
    const composerWaitStarted = Date.now();
    while (Date.now() - composerWaitStarted <= 3000) {
      const state = await bounded(() => io.composerState(composerToken));
      if (state.visible && state.focused) {
        composerFocused = true;
        composerPinned = true;
        break;
      }
      const elapsed = Date.now() - composerWaitStarted;
      const remaining = 3000 - elapsed;
      if (remaining <= 0) break;
      await pause(Math.min(100, remaining));
    }
    if (!composerFocused) throw new Error('composer_not_focused');

    const beforeType = await bounded(() => io.composerState(composerToken));
    if (!beforeType.visible || !beforeType.focused) throw new Error('composer_not_focused');
    await bounded(() => io.send('Input.insertText', { text: comment }));
    const composer = await bounded(() => io.composerState(composerToken));
    if (!composer.visible || !composer.focused) throw new Error('composer_not_focused');
    if (normalize(composer.text) !== normalize(comment)) throw new Error('composer_text_mismatch');

    const postPoint = await bounded(() => io.composerCommentButtonPoint(composerToken));
    if (!postPoint) throw new Error('comment_button_not_found');
    const beforeCardCount = await bounded(() => io.cardExactTextCount(comment));
    if (io.cancelled()) throw new Error('Anchor cancelled');
    postAttempted = true;
    await click(postPoint, true);
    if (io.cancelled()) throw new Error('Anchor cancelled');

    let composerClosed = false;
    let cardCountUpByOne = false;
    for (let poll = 0; poll < 20; poll++) {
      const state = await bounded(() => io.composerState(composerToken));
      composerClosed = !state.visible;
      const count = await bounded(() => io.cardExactTextCount(comment));
      cardCountUpByOne = count === beforeCardCount + 1;
      if (composerClosed && cardCountUpByOne) break;
      await pause(100);
    }
    const verified = composerClosed && cardCountUpByOne;
    return {
      posted: verified ? true : 'uncertain',
      verified,
      phrase: targetPhrase,
      occurrence: targetOccurrence,
      matchTotal: find.total,
      anchor: 'UNVERIFIED',
      cardShowsText: cardCountUpByOne,
    };
  } catch (error) {
    const failures: string[] = [];
    if (composerPinned && !postAttempted) {
      try {
        const state = await bounded(() => io.composerState(composerToken), true);
        if (state.visible) {
          const cancelPoint = await bounded(() => io.composerCancelButtonPoint(composerToken), true);
          if (!cancelPoint) failures.push('composer_cancel_not_found');
          else await click(cancelPoint, true);
        }
      } catch (cleanupError) {
        failures.push(String(cleanupError));
      }
    }
    if (findOpenAttempted) {
      try { await sendAll('Input.dispatchKeyEvent', closeDocsFindEvents(), true); }
      catch (cleanupError) { failures.push(String(cleanupError)); }
    }
    const message = error instanceof Error ? error.message : String(error);
    const withCleanup = failures.length ? `${message}; cleanup failed: ${failures.join('; ')}` : message;
    if (postAttempted) {
      const postedError = error instanceof Error ? error : new Error(withCleanup);
      postedError.message = withCleanup;
      (postedError as Error & { postedStatus?: string }).postedStatus = 'clicked';
      throw postedError;
    }
    if (failures.length) throw new Error(withCleanup);
    throw error;
  }
}
