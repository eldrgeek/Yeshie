import { docsCommentDOM } from '../../packages/extension/src/docs-comment-dom';

beforeEach(() => { document.body.innerHTML = ''; });
function rect(el: Element) {
  Object.defineProperty(el, 'getClientRects', { value: () => [{ width: 100, height: 20 }] });
}
it('detects a visible chip, ignoring hidden stale nodes', () => {
  document.body.innerHTML = '<div class="docs-spellcheck-bubble" hidden></div>';
  const chip = document.querySelector('div')!; rect(chip);
  expect(docsCommentDOM('suggestionVisible')).toBe(false);
  chip.removeAttribute('hidden');
  expect(docsCommentDOM('suggestionVisible')).toBe(true);
  chip.style.visibility = 'hidden';
  expect(docsCommentDOM('suggestionVisible')).toBe(false);
});
it('focuses only a visible writable comment textarea', () => {
  document.body.innerHTML = '<textarea aria-label="Comment" hidden></textarea><textarea class="docos-input-textarea"></textarea>';
  const fields = document.querySelectorAll('textarea'); fields.forEach(rect);
  expect(docsCommentDOM('focusComposer')).toBe(true);
  expect(document.activeElement).toBe(fields[1]);
  fields[1].disabled = true;
  expect(docsCommentDOM('focusComposer')).toBe(false);
});
it('does not accept a textarea whose focus failed', () => {
  document.body.innerHTML = '<textarea aria-label="Comment"></textarea>';
  const field = document.querySelector('textarea')!; rect(field); field.focus = () => {};
  expect(docsCommentDOM('focusComposer')).toBe(false);
});
it.each(['id="insertCommentButton"', 'role="button" aria-label="Insert comment (⌘+Option+M)"'])('clicks toolbar fallback %s', attrs => {
  document.body.innerHTML = `<button ${attrs}></button>`;
  const button = document.querySelector('button')!; rect(button);
  let clicks = 0; button.onclick = () => { clicks++; };
  expect(docsCommentDOM('insertComment')).toBe(true);
  expect(clicks).toBe(1);
  button.disabled = true;
  expect(docsCommentDOM('insertComment')).toBe(false);
});
