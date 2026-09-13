export interface DocsViewportPoint { x: number; y: number; }
export interface DocsBodyState { clickPoint: DocsViewportPoint | null; focused: boolean; }
export interface DocsFindState { visible: boolean; focused: boolean; current: number; total: number; unreadable: boolean; noResults: boolean; }
export interface DocsComposerState { visible: boolean; focused: boolean; text: string; }
interface DocsCommentWindow extends Window {
  __yeshiePinnedComposerTokens?: Record<string, true>;
}

type DocsCommentDOMAction =
  | 'bodyState'
  | 'blockingModalText'
  | 'findBoxState'
  | 'composerState'
  | 'composerCommentButtonPoint'
  | 'composerCancelButtonPoint'
  | 'cardExactTextCount';

// Executed in the page; keep this function self-contained (no module closures).
export function docsCommentDOM(action: DocsCommentDOMAction, expectedText = '', composerToken = ''): unknown {
  const visible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    return el.getClientRects().length > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      !el.closest('[aria-hidden="true"], [hidden]');
  };

  const point = (el: Element): DocsViewportPoint => {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, rect.left + rect.width / 2),
      y: Math.max(0, rect.top + rect.height / 2),
    };
  };

  const normalized = (text: string | null | undefined) => (text || '').replace(/\s+/g, ' ').trim();
  // Docs trims trailing whitespace when a comment is posted. Keep this
  // normalization so post verification compares equivalent comment text
  // while still requiring the exact card count to increase by one.
  const normalizeCardExact = (text: string | null | undefined) => (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/u, '');
  const composerPinAttr = 'data-yeshie-anchor-composer';
  const pinRegistry = ((window as DocsCommentWindow).__yeshiePinnedComposerTokens ||= {});
  const composerSelector = '.docos-input-contenteditable[role="textbox"], [role="textbox"][aria-label="Comment draft"]';
  const composerFields = () => Array.from(document.querySelectorAll<HTMLElement>(composerSelector));
  const visibleComposerFields = () => composerFields().filter(visible);
  const activeInside = (field: HTMLElement) => {
    const active = document.activeElement as Node | null;
    return !!active && (active === field || field.contains(active));
  };
  const pinnedComposer = (token: string) => (
    token
      ? composerFields().find((field) => field.getAttribute(composerPinAttr) === token) || null
      : null
  );
  const composerForState = (token: string): DocsComposerState => {
    if (token) {
      const pinned = pinnedComposer(token);
      if (pinned) {
        if (!visible(pinned)) return { visible: false, focused: false, text: '' } as DocsComposerState;
        return {
          visible: true,
          focused: activeInside(pinned),
          text: pinned.innerText || '',
        } as DocsComposerState;
      }
      if (pinRegistry[token]) return { visible: false, focused: false, text: '' } as DocsComposerState;
      const visibleFields = visibleComposerFields();
      if (!visibleFields.length) return { visible: false, focused: false, text: '' } as DocsComposerState;
      const focusedField = visibleFields.find(activeInside) || null;
      if (focusedField) {
        focusedField.setAttribute(composerPinAttr, token);
        pinRegistry[token] = true;
        return {
          visible: true,
          focused: true,
          text: focusedField.innerText || '',
        } as DocsComposerState;
      }
      return {
        visible: true,
        focused: false,
        text: visibleFields[0].innerText || '',
      } as DocsComposerState;
    }
    const field = visibleComposerFields()[0] || null;
    if (!field) return { visible: false, focused: false, text: '' } as DocsComposerState;
    return {
      visible: true,
      focused: activeInside(field),
      text: field.innerText || '',
    } as DocsComposerState;
  };
  const composerForActions = (token: string) => {
    if (token) {
      const pinned = pinnedComposer(token);
      if (!pinned || !visible(pinned)) return null;
      return pinned;
    }
    return visibleComposerFields()[0] || null;
  };

  const parseFindCounter = (text: string): { current: number; total: number; unreadable: boolean; noResults: boolean } => {
    const match = text.match(/(\d+)\s+of\s+(\d+)/i);
    if (match) return { current: Number(match[1]), total: Number(match[2]), unreadable: false, noResults: false };
    const noResults = /no\s+(matches|results?)/i.test(text);
    if (noResults) return { current: 0, total: 0, unreadable: false, noResults: true };
    return { current: 0, total: 0, unreadable: true, noResults: false };
  };

  if (action === 'bodyState') {
    const page = Array.from(document.querySelectorAll('.kix-page-paginated')).find(visible) || null;
    const active = document.activeElement as Element | null;
    return {
      clickPoint: page ? point(page) : null,
      focused: !!active && active.classList?.contains('docs-texteventtarget-iframe'),
    } as DocsBodyState;
  }

  if (action === 'blockingModalText') {
    const bodyText = normalized(document.body?.innerText);
    if (bodyText.includes('File is in trash')) return 'File is in trash';

    const modal = Array.from(document.querySelectorAll<HTMLElement>(
      '.modal-dialog, [aria-modal="true"], [role="alertdialog"], [role="dialog"]'
    )).find((candidate) => {
      if (!visible(candidate)) return false;
      if (candidate.matches('html, body')) return false;
      if (candidate.matches('.docs-bubble')) return false;
      if (candidate.closest('.docs-bubble')) return false;
      if (candidate.matches('[class*="FindBarContainer"]')) return false;
      if (candidate.querySelector('input[aria-label="Find in document"]')) return false;
      if (candidate.querySelector('.kix-appview-editor')) return false;
      return true;
    });
    if (!modal) return null;
    const text = normalized(modal.innerText || modal.textContent);
    const label = normalized(modal.getAttribute('aria-label'));
    return text || label || 'untitled modal';
  }

  if (action === 'findBoxState') {
    const visibleInputs = Array.from(document.querySelectorAll<HTMLInputElement>(
      'input[aria-label="Find in document"]'
    )).filter(visible);
    const input = visibleInputs.find((candidate) => candidate === document.activeElement) || visibleInputs[0] || null;
    const isVisible = !!input;
    const focused = !!input && document.activeElement === input;
    const host = input?.closest('[class*="FindBarContainer"], [role="dialog"], .docs-findinput-container, .docs-findinput') || null;
    if (!host) {
      return { visible: isVisible, focused, current: 0, total: 0, unreadable: true, noResults: false } as DocsFindState;
    }
    const counter = Array.from(host.querySelectorAll<HTMLElement>('[class*="FindInputCounter"]')).find(visible) || null;
    const counterText = counter ? normalized(counter.innerText || counter.textContent) : '';
    const parsedCounter = counterText ? parseFindCounter(counterText) : { current: 0, total: 0, unreadable: true, noResults: false };
    const { current, total, unreadable, noResults } = parsedCounter.unreadable
      ? parseFindCounter(normalized((host as HTMLElement).innerText || host.textContent))
      : parsedCounter;
    return { visible: isVisible, focused, current, total, unreadable, noResults } as DocsFindState;
  }

  if (action === 'composerState') {
    return composerForState(composerToken);
  }

  if (action === 'composerCommentButtonPoint') {
    const field = composerForActions(composerToken);
    const root = field?.closest('.docos-input');
    if (!root) return null;
    const button = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], .jfk-button, .docos-input-post')).find(el => {
      if (!visible(el)) return false;
      if (el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled') || el.classList.contains('jfk-button-disabled')) return false;
      const text = normalized(el.textContent);
      const ariaLabel = normalized(el.getAttribute('aria-label'));
      if (text === 'Cancel' || ariaLabel === 'Discard comment' || el.classList.contains('docos-input-cancel')) return false;
      return text === 'Comment' || ariaLabel === 'Post Comment' || el.classList.contains('docos-input-post');
    });
    return button ? point(button) : null;
  }

  if (action === 'composerCancelButtonPoint') {
    const field = composerForActions(composerToken);
    const root = field?.closest('.docos-input');
    if (!root) return null;
    const button = Array.from(root?.querySelectorAll<HTMLElement>('button, [role="button"], .jfk-button, .docos-input-cancel') || []).find(el => {
      if (!visible(el)) return false;
      const label = normalized(el.getAttribute('aria-label') || el.textContent);
      return label === 'Cancel' || label === 'Discard comment' || el.classList.contains('docos-input-cancel');
    });
    return button ? point(button) : null;
  }

  const expected = normalizeCardExact(expectedText);
  if (!expected) return 0;
  const bodies = Array.from(document.querySelectorAll<HTMLElement>(
    '.docos-streamreplyview-body, .docos-replyview-body, .docos-comment-content, .docos-docoview-comment-content'
  )).filter(visible);
  return bodies.reduce((count, body) => (
    normalizeCardExact(body.innerText || body.textContent) === expected ? count + 1 : count
  ), 0);
}
