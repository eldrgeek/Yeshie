// Split View helpers for the side panel's "Make split" button.
//
// Chrome has no extension API that creates a split view yet
// (chrome.tabs.createSplit is documented as "Pending"). The relay's
// POST /chrome/split runs scripts/chrome-split.py, which presses Chrome's own
// tab-menu item "New Split View with Current Tab" through macOS Accessibility.
// That item pairs the right-clicked tab with the window's active tab, so the
// request names both by their position in the tab strip.

export const SPLIT_VIEW_ID_NONE = -1;

export interface SplitTab {
  id?: number;
  index: number;
  windowId: number;
  title?: string;
  active: boolean;
  highlighted?: boolean;
  splitViewId?: number;
}

export interface SplitCandidate {
  windowId: number;
  tabIds: [number, number];
  titles: [string, string];
}

export interface SplitRequest {
  titles: string[];
  activeIndex: number;
  targetIndex: number;
}

function inSplit(tab: SplitTab): boolean {
  return typeof tab.splitViewId === 'number' && tab.splitViewId !== SPLIT_VIEW_ID_NONE;
}

/**
 * The selected tabs qualify when there are exactly two, in one window, and
 * neither is already part of a split view. Chrome itself refuses to nest splits.
 */
export function splitCandidate(highlighted: SplitTab[]): SplitCandidate | null {
  if (highlighted.length !== 2) return null;
  const [a, b] = [...highlighted].sort((x, y) => x.index - y.index);
  if (a.id === undefined || b.id === undefined) return null;
  if (a.windowId !== b.windowId) return null;
  if (inSplit(a) || inSplit(b)) return null;
  return { windowId: a.windowId, tabIds: [a.id, b.id], titles: [a.title ?? '', b.title ?? ''] };
}

/**
 * Build the relay request from the window's full tab list. The active tab of
 * the pair stays put; the other one is right-clicked. If neither is active
 * (the selection changed underneath us), the request is refused.
 */
export function buildSplitRequest(windowTabs: SplitTab[], tabIds: [number, number]): SplitRequest | null {
  const ordered = [...windowTabs].sort((x, y) => x.index - y.index);
  const pair = tabIds.map(id => ordered.findIndex(t => t.id === id));
  if (pair.some(i => i < 0)) return null;
  const activePos = pair.find(i => ordered[i].active);
  if (activePos === undefined) return null;
  const targetPos = pair.find(i => i !== activePos)!;
  return {
    titles: ordered.map(t => t.title ?? ''),
    activeIndex: activePos,
    targetIndex: targetPos,
  };
}

/** True once Chrome reports both tabs in the same split view. */
export function isSplitTogether(tabs: SplitTab[]): boolean {
  return tabs.length === 2 && inSplit(tabs[0]) && tabs[0].splitViewId === tabs[1].splitViewId;
}
