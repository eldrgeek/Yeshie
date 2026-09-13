import { anchorComment, AnchorIO } from '../../packages/extension/src/anchor-comment';
import { jest } from '@jest/globals';

function harness(options: {
  total?: number;
  initialCurrent?: number;
  modal?: string | null;
  noBodyPoint?: boolean;
  blockFindOpen?: boolean;
  delayedFindOpenMs?: number;
  findUnfocused?: boolean;
  blockComposerOpen?: boolean;
  delayedComposerOpenMs?: number;
  composerUnfocused?: boolean;
  composerMismatch?: boolean;
  noCommentButton?: boolean;
  noCancelButton?: boolean;
  delayedCounterReads?: number;
  stuckFind?: boolean;
  neverSettles?: boolean;
  unreadableCounter?: boolean;
  noResults?: boolean;
  noComposerCloseAfterPost?: boolean;
  noCardIncreaseAfterPost?: boolean;
  initialCardCount?: number;
  cancelAfterFindOpen?: boolean;
  cancelAfterComposerOpen?: boolean;
  cancelAfterClick?: boolean;
  cancelAfterCommentMousePressed?: boolean;
  cancelDuringPostPollMs?: number;
  mouseReleasedReject?: boolean;
  mouseReleasedHang?: boolean;
  delayedComposerCloseMs?: number;
  delayedCardIncreaseMs?: number;
} = {}) {
  const calls: string[] = [];
  let enterPresses = 0;
  let escapePresses = 0;
  let cancelClicks = 0;
  let cancelled = false;
  const bodyPoint = { x: 10, y: 20 };
  const commentPoint = { x: 50, y: 60 };
  const cancelPoint = { x: 20, y: 60 };
  const total = options.total ?? 1;
  let current = options.initialCurrent ?? 0;
  let delayedCurrent: number | null = null;
  let staleReadsLeft = 0;
  let oscillate = false;
  let bodyFocused = false;
  let findVisible = false;
  let findFocused = false;
  let composerVisible = false;
  let composerFocused = false;
  let composerText = '';
  let commentClickDispatched = false;
  let cardCount = options.initialCardCount ?? 0;
  const findReads: Array<{ at: number; current: number; total: number }> = [];

  const io: AnchorIO = {
    platform: async () => 'mac',
    attach: async () => { },
    bodyState: async () => ({ clickPoint: options.noBodyPoint ? null : bodyPoint, focused: bodyFocused }),
    modalText: async () => options.modal ?? null,
    findState: async () => {
      if (options.unreadableCounter) {
        const state = { visible: findVisible, focused: findFocused, current: 0, total: 0, unreadable: true, noResults: false };
        findReads.push({ at: Date.now(), current: state.current, total: state.total });
        return state;
      }
      if (options.noResults) {
        const state = { visible: findVisible, focused: findFocused, current: 0, total: 0, unreadable: false, noResults: true };
        findReads.push({ at: Date.now(), current: state.current, total: state.total });
        return state;
      }
      if (options.neverSettles) {
        oscillate = !oscillate;
        const state = { visible: findVisible, focused: findFocused, current: oscillate ? 1 : 2, total, unreadable: false, noResults: false };
        findReads.push({ at: Date.now(), current: state.current, total: state.total });
        return state;
      }
      if (delayedCurrent !== null) {
        if (staleReadsLeft > 0) staleReadsLeft--;
        else {
          current = delayedCurrent;
          delayedCurrent = null;
        }
      }
      const state = { visible: findVisible, focused: findFocused, current, total, unreadable: false, noResults: false };
      findReads.push({ at: Date.now(), current: state.current, total: state.total });
      return state;
    },
    composerState: async (_composerToken?: string) => ({ visible: composerVisible, focused: composerFocused, text: composerText }),
    composerCommentButtonPoint: async (_composerToken?: string) => (options.noCommentButton ? null : commentPoint),
    composerCancelButtonPoint: async (_composerToken?: string) => (options.noCancelButton ? null : cancelPoint),
    cardExactTextCount: async () => cardCount,
    send: async (method, payload: any) => {
      if (method === 'Input.dispatchKeyEvent') calls.push(`key:${payload.type}:${payload.key}:${payload.modifiers}`);
      if (method === 'Input.dispatchMouseEvent') calls.push(`mouse:${payload.type}:${payload.x},${payload.y}`);
      if (method === 'Input.insertText') calls.push(`text:${payload.text}`);

      if (method === 'Input.dispatchMouseEvent' && payload.type === 'mousePressed') {
        if (payload.x === commentPoint.x && payload.y === commentPoint.y && composerVisible && options.cancelAfterCommentMousePressed) {
          cancelled = true;
        }
      }

      if (method === 'Input.dispatchMouseEvent' && payload.type === 'mouseReleased') {
        if (payload.x === bodyPoint.x && payload.y === bodyPoint.y) bodyFocused = true;
        if (payload.x === commentPoint.x && payload.y === commentPoint.y && composerVisible) {
          if (options.mouseReleasedHang) return new Promise(() => { });
          if (options.mouseReleasedReject) throw new Error('mouseReleased rejected');
          commentClickDispatched = true;
          if (!options.noComposerCloseAfterPost) {
            if ((options.delayedComposerCloseMs ?? 0) > 0) {
              setTimeout(() => {
                composerVisible = false;
                composerFocused = false;
              }, options.delayedComposerCloseMs);
            } else {
              composerVisible = false;
              composerFocused = false;
            }
          }
          if (!options.noCardIncreaseAfterPost) {
            if ((options.delayedCardIncreaseMs ?? 0) > 0) {
              setTimeout(() => { cardCount += 1; }, options.delayedCardIncreaseMs);
            } else {
              cardCount += 1;
            }
          }
          if ((options.cancelDuringPostPollMs ?? 0) > 0) {
            setTimeout(() => { cancelled = true; }, options.cancelDuringPostPollMs);
          }
          if (options.cancelAfterClick) cancelled = true;
        }
        if (payload.x === cancelPoint.x && payload.y === cancelPoint.y) {
          cancelClicks++;
          composerVisible = false;
          composerFocused = false;
          composerText = '';
        }
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'f' && payload.modifiers === 4) {
        const openFind = () => {
          findVisible = true;
          findFocused = !options.findUnfocused;
          if (options.cancelAfterFindOpen) cancelled = true;
        };
        if (!options.blockFindOpen) {
          if ((options.delayedFindOpenMs ?? 0) > 0) setTimeout(openFind, options.delayedFindOpenMs);
          else openFind();
        }
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'keyDown' && payload.key === 'Enter' && findVisible && findFocused) {
        enterPresses++;
        if (total > 0) {
          const next = options.stuckFind ? current : (current === 0 ? 1 : (current === total ? 1 : current + 1));
          if ((options.delayedCounterReads ?? 0) > 0) {
            delayedCurrent = next;
            staleReadsLeft = options.delayedCounterReads ?? 0;
          } else {
            current = next;
          }
        }
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'Escape' && findVisible) {
        escapePresses++;
        findVisible = false;
        findFocused = false;
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'm' && payload.modifiers === 5) {
        const openComposer = () => {
          composerVisible = true;
          composerFocused = !options.composerUnfocused;
          if (options.cancelAfterComposerOpen) cancelled = true;
        };
        if (!options.blockComposerOpen) {
          if ((options.delayedComposerOpenMs ?? 0) > 0) setTimeout(openComposer, options.delayedComposerOpenMs);
          else openComposer();
        }
      }
      if (method === 'Input.insertText') {
        if (findVisible && findFocused) return;
        if (composerVisible && composerFocused) {
          composerText = options.composerMismatch ? `${payload.text}x` : payload.text;
          return;
        }
        calls.push(`typed-without-focus:${payload.text}`);
      }
    },
    cancelled: () => cancelled,
  };

  return {
    io,
    calls,
    cancel: () => { cancelled = true; },
    enterPresses: () => enterPresses,
    escapePresses: () => escapePresses,
    cancelClicks: () => cancelClicks,
    clickedComment: () => commentClickDispatched,
    findReads: () => findReads,
  };
}

function dualComposerHarness(options: {
  focusedOnOpen?: 'second' | 'none';
  missingCommentButton?: boolean;
  hidePinnedBeforeType?: boolean;
} = {}) {
  const calls: string[] = [];
  const composerTokens: string[] = [];
  let bodyFocused = false;
  let findVisible = false;
  let findFocused = false;
  let current = 0;
  const total = 1;
  let firstVisible = true;
  let secondVisible = false;
  let focusedComposer: 'none' | 'second' = 'none';
  let firstText = 'existing draft';
  let secondText = '';
  let firstCommentClicks = 0;
  let secondCommentClicks = 0;
  let firstCancelClicks = 0;
  let secondCancelClicks = 0;
  let typedIntoFirst = 0;
  let typedIntoSecond = 0;
  let cardCount = 0;
  let pinnedToken: string | null = null;
  let pinnedReads = 0;
  const bodyPoint = { x: 10, y: 20 };
  const secondCommentPoint = { x: 70, y: 80 };
  const secondCancelPoint = { x: 90, y: 80 };
  const firstCommentPoint = { x: 700, y: 710 };
  const firstCancelPoint = { x: 720, y: 710 };

  const io: AnchorIO = {
    platform: async () => 'mac',
    attach: async () => { },
    bodyState: async () => ({ clickPoint: bodyPoint, focused: bodyFocused }),
    modalText: async () => null,
    findState: async () => ({ visible: findVisible, focused: findFocused, current, total, unreadable: false, noResults: false }),
    composerState: async (composerToken: string) => {
      composerTokens.push(composerToken);
      if (!pinnedToken) {
        if (!firstVisible && !secondVisible) return { visible: false, focused: false, text: '' };
        if (focusedComposer === 'second' && secondVisible) {
          pinnedToken = composerToken;
          return { visible: true, focused: true, text: secondText };
        }
        return { visible: true, focused: false, text: firstText };
      }
      if (composerToken !== pinnedToken) return { visible: false, focused: false, text: '' };
      pinnedReads++;
      if (options.hidePinnedBeforeType && pinnedReads >= 1) {
        secondVisible = false;
        focusedComposer = 'none';
      }
      if (!secondVisible) return { visible: false, focused: false, text: '' };
      return { visible: true, focused: focusedComposer === 'second', text: secondText };
    },
    composerCommentButtonPoint: async (composerToken: string) => {
      composerTokens.push(composerToken);
      if (!pinnedToken || composerToken !== pinnedToken || !secondVisible) return null;
      return options.missingCommentButton ? null : secondCommentPoint;
    },
    composerCancelButtonPoint: async (composerToken: string) => {
      composerTokens.push(composerToken);
      if (!pinnedToken || composerToken !== pinnedToken || !secondVisible) return null;
      return secondCancelPoint;
    },
    cardExactTextCount: async () => cardCount,
    send: async (method, payload: any) => {
      if (method === 'Input.dispatchKeyEvent') calls.push(`key:${payload.type}:${payload.key}:${payload.modifiers}`);
      if (method === 'Input.dispatchMouseEvent') calls.push(`mouse:${payload.type}:${payload.x},${payload.y}`);
      if (method === 'Input.insertText') calls.push(`text:${payload.text}`);

      if (method === 'Input.dispatchMouseEvent' && payload.type === 'mouseReleased') {
        if (payload.x === bodyPoint.x && payload.y === bodyPoint.y) bodyFocused = true;
        if (payload.x === secondCommentPoint.x && payload.y === secondCommentPoint.y) {
          secondCommentClicks++;
          secondVisible = false;
          focusedComposer = 'none';
          cardCount += 1;
        }
        if (payload.x === firstCommentPoint.x && payload.y === firstCommentPoint.y) firstCommentClicks++;
        if (payload.x === secondCancelPoint.x && payload.y === secondCancelPoint.y) {
          secondCancelClicks++;
          secondVisible = false;
          focusedComposer = 'none';
        }
        if (payload.x === firstCancelPoint.x && payload.y === firstCancelPoint.y) firstCancelClicks++;
      }

      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'f' && payload.modifiers === 4) {
        findVisible = true;
        findFocused = true;
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'keyDown' && payload.key === 'Enter' && findVisible && findFocused) {
        current = 1;
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'Escape' && findVisible) {
        findVisible = false;
        findFocused = false;
      }
      if (method === 'Input.dispatchKeyEvent' && payload.type === 'rawKeyDown' && payload.key === 'm' && payload.modifiers === 5) {
        secondVisible = true;
        focusedComposer = options.focusedOnOpen === 'none' ? 'none' : 'second';
      }
      if (method === 'Input.insertText') {
        if (findVisible && findFocused) return;
        if (secondVisible && focusedComposer === 'second') {
          typedIntoSecond++;
          secondText = payload.text;
          return;
        }
        if (firstVisible) {
          typedIntoFirst++;
          firstText = payload.text;
          return;
        }
      }
    },
    cancelled: () => false,
  };

  return {
    io,
    calls,
    firstCommentClicks: () => firstCommentClicks,
    secondCommentClicks: () => secondCommentClicks,
    firstCancelClicks: () => firstCancelClicks,
    secondCancelClicks: () => secondCancelClicks,
    typedIntoFirst: () => typedIntoFirst,
    typedIntoSecond: () => typedIntoSecond,
    pinnedToken: () => pinnedToken,
    composerTokens: () => composerTokens.filter(Boolean),
  };
}

it('pins the focused second composer, posts there, and ignores another visible composer during closure checks', async () => {
  const h = dualComposerHarness();
  await expect(anchorComment('target phrase', 1, 'hello', h.io)).resolves.toEqual({
    posted: true,
    verified: true,
    phrase: 'target phrase',
    occurrence: 1,
    matchTotal: 1,
    anchor: 'UNVERIFIED',
    cardShowsText: true,
  });
  expect(h.pinnedToken()).toBeTruthy();
  expect(h.typedIntoSecond()).toBe(1);
  expect(h.typedIntoFirst()).toBe(0);
  expect(h.secondCommentClicks()).toBe(1);
  expect(h.firstCommentClicks()).toBe(0);
  expect(h.firstCancelClicks()).toBe(0);
});

it('cancels only the pinned composer on pre-post failure', async () => {
  const h = dualComposerHarness({ missingCommentButton: true });
  await expect(anchorComment('target phrase', 1, 'hello', h.io)).rejects.toThrow('comment_button_not_found');
  expect(h.secondCancelClicks()).toBe(1);
  expect(h.firstCancelClicks()).toBe(0);
});

it('skips cancel cleanup when no composer is pinned', async () => {
  const h = dualComposerHarness({ focusedOnOpen: 'none' });
  await expect(anchorComment('target phrase', 1, 'hello', h.io)).rejects.toThrow('composer_not_focused');
  expect(h.firstCancelClicks()).toBe(0);
  expect(h.secondCancelClicks()).toBe(0);
});

it('fails when the pinned composer disappears and does not fall back to another visible composer', async () => {
  const h = dualComposerHarness({ hidePinnedBeforeType: true });
  await expect(anchorComment('target phrase', 1, 'hello', h.io)).rejects.toThrow('composer_not_focused');
  expect(h.typedIntoSecond()).toBe(0);
  expect(h.typedIntoFirst()).toBe(0);
  expect(h.firstCommentClicks()).toBe(0);
  expect(h.secondCommentClicks()).toBe(0);
});

it('posts verified when composer closes and exact-match card count rises by one', async () => {
  const h = harness({ total: 3 });
  await expect(anchorComment('ready for a reading', 2, 'hello', h.io)).resolves.toEqual({
    posted: true,
    verified: true,
    phrase: 'ready for a reading',
    occurrence: 2,
    matchTotal: 3,
    anchor: 'UNVERIFIED',
    cardShowsText: true,
  });
  expect(h.calls).toContain('text:ready for a reading');
  expect(h.calls).toContain('text:hello');
  expect(h.enterPresses()).toBe(2);
});

it('waits for delayed Find counter updates before accepting k', async () => {
  const h = harness({ total: 3, delayedCounterReads: 3 });
  await expect(anchorComment('ready for a reading', 2, 'hello', h.io)).resolves.toMatchObject({
    posted: true,
    verified: true,
    occurrence: 2,
    matchTotal: 3,
  });
  expect(h.enterPresses()).toBe(2);
});

it('waits at least 100ms between stable find-counter reads', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ total: 1 });
    const started = Date.now();
    const run = anchorComment('x', 1, 'hello', h.io);
    await jest.runAllTimersAsync();
    await expect(run).resolves.toMatchObject({ posted: true, verified: true });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(100);
    const hasStablePairWithElapsedGap = h.findReads().some((read, idx, all) =>
      idx > 0 &&
      read.current === all[idx - 1].current &&
      read.total === all[idx - 1].total &&
      read.at - all[idx - 1].at >= 100
    );
    expect(hasStablePairWithElapsedGap).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('fails with find_counter_unstable when counter never settles', async () => {
  const h = harness({ total: 3, neverSettles: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('find_counter_unstable');
  expect(h.clickedComment()).toBe(false);
  expect(h.escapePresses()).toBeGreaterThan(0);
});

it('accepts Enter wrap from N to 1 when selecting occurrence', async () => {
  const h = harness({ total: 3, initialCurrent: 3 });
  await expect(anchorComment('x', 1, 'hello', h.io)).resolves.toMatchObject({
    posted: true,
    verified: true,
    occurrence: 1,
    matchTotal: 3,
  });
  expect(h.enterPresses()).toBe(1);
});

it('checks modal presence before any body focus click', async () => {
  const h = harness({ modal: 'File is in trash' });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('blocking_modal_present');
  expect(h.calls).toEqual([]);
});

it('sends zero input when modal is present without text', async () => {
  const h = harness({ modal: 'untitled modal' });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('blocking_modal_present');
  expect(h.calls).toEqual([]);
});

it('fails with phrase_not_found only for 0 of 0/no-results state', async () => {
  const h = harness({ total: 0 });
  await expect(anchorComment('missing', 1, 'hello', h.io)).rejects.toThrow('phrase_not_found');
  expect(h.clickedComment()).toBe(false);
});

it('fails with find_counter_unreadable when counter cannot be parsed', async () => {
  const h = harness({ unreadableCounter: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('find_counter_unreadable');
  expect(h.clickedComment()).toBe(false);
});

it('returns uncertain when click is sent but composer does not close', async () => {
  const h = harness({ noComposerCloseAfterPost: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).resolves.toMatchObject({
    posted: 'uncertain',
    verified: false,
    cardShowsText: true,
  });
  expect(h.clickedComment()).toBe(true);
});

it('returns uncertain when click is sent but exact-match card count does not increase', async () => {
  const h = harness({ noCardIncreaseAfterPost: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).resolves.toMatchObject({
    posted: 'uncertain',
    verified: false,
    cardShowsText: false,
  });
  expect(h.clickedComment()).toBe(true);
});

it('verifies posting when composer closure and card appearance are delayed', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ delayedComposerCloseMs: 250, delayedCardIncreaseMs: 350 });
    let settled = false;
    const run = anchorComment('x', 1, 'hello', h.io).then(result => {
      settled = true;
      return result;
    });
    await jest.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);
    await jest.runAllTimersAsync();
    await expect(run).resolves.toMatchObject({ posted: true, verified: true, cardShowsText: true });
  } finally {
    jest.useRealTimers();
  }
});

it('throws postedStatus clicked when cancellation happens during pending post-verification poll', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({
      noComposerCloseAfterPost: true,
      noCardIncreaseAfterPost: true,
      cancelDuringPostPollMs: 50,
    });
    const run = anchorComment('x', 1, 'hello', h.io).catch(e => e);
    await jest.runAllTimersAsync();
    const error = await run;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { postedStatus?: string }).postedStatus).toBe('clicked');
    expect((error as Error).message).toMatch(/cancelled/i);
    expect(h.cancelClicks()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

it('throws with postedStatus clicked when cancellation happens after comment click', async () => {
  const h = harness({ cancelAfterClick: true });
  const error = await anchorComment('x', 1, 'hello', h.io).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error & { postedStatus?: string }).postedStatus).toBe('clicked');
  expect((error as Error).message).toMatch(/cancelled/i);
});

it('marks postedStatus clicked and skips Cancel when mouseReleased rejects', async () => {
  const h = harness({ mouseReleasedReject: true });
  const error = await anchorComment('x', 1, 'hello', h.io).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error & { postedStatus?: string }).postedStatus).toBe('clicked');
  expect(h.cancelClicks()).toBe(0);
});

it('marks postedStatus clicked and skips Cancel when mouseReleased hangs to timeout', async () => {
  const h = harness({ mouseReleasedHang: true });
  const error = await anchorComment('x', 1, 'hello', h.io, 300).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/timed out/i);
  expect((error as Error & { postedStatus?: string }).postedStatus).toBe('clicked');
  expect(h.cancelClicks()).toBe(0);
});

it('marks postedStatus clicked and skips Cancel when cancellation happens after mousePressed', async () => {
  const h = harness({ cancelAfterCommentMousePressed: true });
  const error = await anchorComment('x', 1, 'hello', h.io).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error & { postedStatus?: string }).postedStatus).toBe('clicked');
  expect((error as Error).message).toMatch(/cancelled/i);
  expect(h.cancelClicks()).toBe(0);
});

it('sends Escape cleanup if cancellation interrupts Find opening', async () => {
  const h = harness({ cancelAfterFindOpen: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow(/cancelled/i);
  expect(h.calls).toContain('key:rawKeyDown:Escape:0');
});

it('clicks Cancel cleanup when cancellation occurs after composer becomes visible', async () => {
  const h = harness({ cancelAfterComposerOpen: true, composerUnfocused: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow(/cancelled/i);
  expect(h.cancelClicks()).toBe(0);
});

it('never types or presses Enter unless Find input is visible and focused', async () => {
  const h = harness({ findUnfocused: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('find_not_focused');
  expect(h.calls).not.toContain('text:x');
  expect(h.calls).not.toContain('key:keyDown:Enter:0');
});

it('waits for Find to become visible and focused before typing', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ delayedFindOpenMs: 600 });
    let settled = false;
    const run = anchorComment('x', 1, 'hello', h.io).then(result => {
      settled = true;
      return result;
    });

    await jest.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);
    expect(h.calls).not.toContain('text:x');
    expect(h.calls).not.toContain('key:keyDown:Enter:0');

    await jest.runAllTimersAsync();
    await expect(run).resolves.toMatchObject({ posted: true, verified: true });
  } finally {
    jest.useRealTimers();
  }
});

it('fails find_not_focused after about 3000ms when Find never opens', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ blockFindOpen: true });
    const started = Date.now();
    let settled = false;
    const run = anchorComment('x', 1, 'hello', h.io).catch(e => {
      settled = true;
      return e;
    });

    await jest.advanceTimersByTimeAsync(2900);
    expect(settled).toBe(false);

    await jest.runAllTimersAsync();
    const error = await run;
    const elapsed = Date.now() - started;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('find_not_focused');
    expect(elapsed).toBeGreaterThanOrEqual(3000);
    expect(elapsed).toBeLessThan(3400);
    expect(h.calls).not.toContain('text:x');
    expect(h.calls).not.toContain('key:keyDown:Enter:0');
  } finally {
    jest.useRealTimers();
  }
});

it('waits up to 3000ms for delayed composer open', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ delayedComposerOpenMs: 1500 });
    let settled = false;
    const run = anchorComment('x', 1, 'hello', h.io).then(result => {
      settled = true;
      return result;
    });

    await jest.advanceTimersByTimeAsync(1400);
    expect(settled).toBe(false);
    expect(h.calls).not.toContain('text:hello');

    await jest.runAllTimersAsync();
    await expect(run).resolves.toMatchObject({ posted: true, verified: true });
  } finally {
    jest.useRealTimers();
  }
});

it('fails composer_not_focused after about 3000ms and keeps cleanup behavior', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ blockComposerOpen: true });
    const started = Date.now();
    const run = anchorComment('x', 1, 'hello', h.io).catch(e => e);

    await jest.runAllTimersAsync();
    const error = await run;
    const elapsed = Date.now() - started;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('composer_not_focused');
    expect(elapsed).toBeGreaterThanOrEqual(3000);
    expect(elapsed).toBeLessThan(3600);
    expect(h.cancelClicks()).toBe(0);
    expect(h.escapePresses()).toBe(1);
    expect(h.clickedComment()).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('honors cancellation while waiting for Find to open', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ delayedFindOpenMs: 2000 });
    const run = anchorComment('x', 1, 'hello', h.io).catch(e => e);
    setTimeout(() => { h.cancel(); }, 700);

    await jest.runAllTimersAsync();
    const error = await run;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cancelled/i);
    expect(h.calls).toContain('key:rawKeyDown:Escape:0');
    expect(h.calls).not.toContain('text:x');
    expect(h.calls).not.toContain('key:keyDown:Enter:0');
  } finally {
    jest.useRealTimers();
  }
});

it('honors cancellation while waiting for composer to open', async () => {
  jest.useFakeTimers();
  try {
    const h = harness({ blockComposerOpen: true });
    const run = anchorComment('x', 1, 'hello', h.io).catch(e => e);
    setTimeout(() => { h.cancel(); }, 1500);

    await jest.runAllTimersAsync();
    const error = await run;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cancelled/i);
    expect(h.calls).toContain('key:rawKeyDown:m:5');
    expect(h.cancelClicks()).toBe(0);
    expect(h.clickedComment()).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('fails with occurrence_out_of_range when target is greater than N', async () => {
  const h = harness({ total: 2 });
  await expect(anchorComment('x', 3, 'hello', h.io)).rejects.toThrow('occurrence_out_of_range');
  expect(h.clickedComment()).toBe(false);
});

it('fails with find_counter_unstable when Enter does not advance current', async () => {
  const h = harness({ total: 3, stuckFind: true });
  await expect(anchorComment('x', 2, 'hello', h.io)).rejects.toThrow('find_counter_unstable');
  expect(h.clickedComment()).toBe(false);
});

it('enforces posting guard when composer text does not match comment_text', async () => {
  const h = harness({ composerMismatch: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('composer_text_mismatch');
  expect(h.calls).not.toContain('mouse:mouseReleased:50,60');
  expect(h.clickedComment()).toBe(false);
});

it('fails cleanly when body cannot be focused', async () => {
  const h = harness({ noBodyPoint: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('cannot_focus_body');
  expect(h.calls).toEqual([]);
});

it('clicks composer Cancel on failures after composer opens', async () => {
  const h = harness({ noCommentButton: true });
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow('comment_button_not_found');
  expect(h.calls).toContain('mouse:mouseReleased:20,60');
  expect(h.clickedComment()).toBe(false);
});

it.each(['', 'x'.repeat(501), 42])('rejects invalid target_phrase %s', async phrase => {
  const h = harness();
  await expect(anchorComment(phrase as never, 1, 'hello', h.io)).rejects.toThrow('target_phrase');
});

it.each([0, 1.2, NaN, 'bad'])('rejects invalid occurrence %s', async occurrence => {
  const h = harness();
  await expect(anchorComment('x', occurrence as never, 'hello', h.io)).rejects.toThrow('occurrence');
});

it('rejects empty comment text', async () => {
  const h = harness();
  await expect(anchorComment('x', 1, '', h.io)).rejects.toThrow('comment_text');
});

it('cancels between bounded operations and avoids posting', async () => {
  const h = harness();
  const send = h.io.send;
  h.io.send = async (method, payload) => {
    await send(method, payload);
    if (method === 'Input.dispatchKeyEvent' && (payload as any).key === 'f') h.cancel();
  };
  await expect(anchorComment('x', 1, 'hello', h.io)).rejects.toThrow(/cancelled/i);
  expect(h.clickedComment()).toBe(false);
});

it.each(['bodyState', 'findState', 'send'] as const)('bounds hung %s and never resumes posting after late completion', async method => {
  let resolve!: (value?: any) => void;
  const h = harness();
  const stalled = () => new Promise<any>(r => { resolve = r; });
  if (method === 'send') h.io.send = stalled as any;
  else (h.io as any)[method] = stalled;
  await expect(anchorComment('x', 1, 'hello', h.io, 20)).rejects.toThrow(/timed out/);
  const before = [...h.calls];
  resolve();
  await new Promise(r => setTimeout(r, 25));
  expect(h.calls).toEqual(before);
  expect(h.clickedComment()).toBe(false);
});
