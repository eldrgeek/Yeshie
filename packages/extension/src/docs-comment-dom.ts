// Executed in the page; keep this function self-contained (no module closures).
// Selectors VERIFIED against the live Google Docs DOM on 2026-09-12 (probe doc
// 1ihp7YQB…, read-only inspection by the PlayMaker COS session):
//   - grammar/spelling chip: div.docs-bubble.kix-spell-bubble, role="dialog",
//     aria-label "Spellcheck options" (its Ignore button is .kix-spell-bubble-ignore);
//   - comment button: #insertCommentButton, role="button", aria-label
//     "Add comment (⌘+Option+M)"; a goog-toolbar-button needs mousedown/mouseup/click,
//     a bare .click() is not reliable;
//   - comment composer: NOT a textarea. div.docos-input-textarea.docos-input-contenteditable,
//     role="textbox", aria-label "Comment draft", contenteditable="true"; it takes focus
//     itself when it opens. Discard button: .docos-input-cancel (aria "Discard comment").
// Live run 1 failed at "Cannot focus comment composer" because the old code
// only looked for <textarea> elements.
export function docsCommentDOM(action: 'suggestionVisible' | 'focusComposer' | 'insertComment'): boolean {
  const visible = (el: Element) => {
    const style = getComputedStyle(el);
    return el.getClientRects().length > 0 && style.display !== 'none' &&
      style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
      !el.closest('[aria-hidden="true"], [hidden]');
  };
  if (action === 'suggestionVisible') {
    return Array.from(document.querySelectorAll(
      '.kix-spell-bubble, [role="dialog"][aria-label="Spellcheck options"], ' +
      '.docs-spellcheck-bubble, .docs-spelling-bubble, .docs-grammar-bubble, ' +
      '[role="dialog"][aria-label*="spell" i], [role="dialog"][aria-label*="grammar" i]'
    )).some(visible);
  }
  if (action === 'insertComment') {
    const button = Array.from(document.querySelectorAll<HTMLElement>(
      '#insertCommentButton, [role="button"][aria-label^="Add comment"], [role="button"][aria-label^="Insert comment"]'
    )).find(el => visible(el) && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled'));
    if (!button) return false;
    const opts = { bubbles: true, cancelable: true, view: window };
    button.dispatchEvent(new MouseEvent('mousedown', opts));
    button.dispatchEvent(new MouseEvent('mouseup', opts));
    button.dispatchEvent(new MouseEvent('click', opts));
    return true;
  }
  const composer = Array.from(document.querySelectorAll<HTMLElement>(
    '.docos-input-contenteditable[role="textbox"], [role="textbox"][aria-label="Comment draft"], ' +
    'textarea.docos-input-textarea, textarea[aria-label="Comment"], textarea[aria-label="Add a comment"]'
  )).find(el => {
    if (!visible(el)) return false;
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
    return el.isContentEditable;
  });
  if (!composer) return false;
  if (document.activeElement !== composer) composer.focus();
  return document.activeElement === composer;
}
