import { docsCommentDOM } from '../../packages/extension/src/docs-comment-dom';

beforeEach(() => {
  document.body.innerHTML = '';
  delete (document.body as HTMLElement & { innerText?: string }).innerText;
  delete (window as Window & { __yeshiePinnedComposerTokens?: Record<string, true> }).__yeshiePinnedComposerTokens;
});
function rect(el: Element, left = 0, top = 0, width = 100, height = 20) {
  Object.defineProperty(el, 'getClientRects', { configurable: true, value: () => [{ width, height }] });
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
  });
}

it('returns body click point and focus state', () => {
  document.body.innerHTML = '<div class="kix-page-paginated"></div>';
  const page = document.querySelector('.kix-page-paginated')!;
  rect(page, 10, 20, 200, 100);
  expect(docsCommentDOM('bodyState')).toEqual({ clickPoint: { x: 110, y: 70 }, focused: false });

  const iframe = document.createElement('iframe');
  iframe.className = 'docs-texteventtarget-iframe';
  document.body.appendChild(iframe);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => iframe });

  expect(docsCommentDOM('bodyState')).toEqual({ clickPoint: { x: 110, y: 70 }, focused: true });
});

it('does not treat docs-material page shell as a blocking modal', () => {
  document.body.className = 'docs-material';
  document.body.innerHTML = `
    <div class="kix-appview-editor"></div>
    <div class="docos-docoview-comment-content">Comment card</div>
  `;
  expect(docsCommentDOM('blockingModalText')).toBeNull();
});

it('does not treat docs-bubble popups as blocking modals', () => {
  document.body.innerHTML = '<div class="docs-bubble kix-spell-bubble" role="dialog" aria-label="Spellcheck options"></div>';
  const bubble = document.querySelector('.docs-bubble') as HTMLElement;
  rect(bubble);
  expect(docsCommentDOM('blockingModalText')).toBeNull();
});

it('blocks immediately when page body text indicates file is in trash', () => {
  document.body.innerHTML = '<div>File is in trash ... Take out of trash</div>';
  Object.defineProperty(document.body, 'innerText', { configurable: true, value: 'File is in trash ... Take out of trash' });
  expect(docsCommentDOM('blockingModalText')).toBe('File is in trash');
});

it('detects visible real modal-dialog text as blocking', () => {
  const modal = document.createElement('div');
  modal.className = 'modal-dialog';
  modal.textContent = 'Restore this file?';
  document.body.appendChild(modal);
  rect(modal);
  Object.defineProperty(modal, 'innerText', { configurable: true, value: 'Restore this file?' });
  expect(docsCommentDOM('blockingModalText')).toBe('Restore this file?');
});

it('uses aria-label fallback for visible aria-modal dialogs without text', () => {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Restore file');
  document.body.appendChild(modal);
  rect(modal);
  Object.defineProperty(modal, 'innerText', { configurable: true, value: '' });
  expect(docsCommentDOM('blockingModalText')).toBe('Restore file');
});

it('uses untitled fallback for visible aria-modal dialogs with no text or label', () => {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  document.body.appendChild(modal);
  rect(modal);
  Object.defineProperty(modal, 'innerText', { configurable: true, value: '' });
  expect(docsCommentDOM('blockingModalText')).toBe('untitled modal');
});

it('ignores hidden real modals', () => {
  const modal = document.createElement('div');
  modal.className = 'modal-dialog';
  modal.textContent = 'Hidden modal';
  modal.style.display = 'none';
  document.body.appendChild(modal);
  rect(modal);
  expect(docsCommentDOM('blockingModalText')).toBeNull();
});

it('reads find state from the focused find input and in-bar counter only', () => {
  document.body.innerHTML = `
    <div class="appsDocsUiWizFindbarFindBarContainer" role="dialog" aria-label="Find in document">
      <div class="appsDocsUiWizFindbarFindInputContainer">
        <input class="javascriptMaterialdesignGm3WizTextFieldOutlined-text-field__input" aria-label="Find in document" />
        <span class="appsDocsUiWizFindbarFindInputCounter">1 of 1</span>
      </div>
    </div>
    <div>1 of 1</div>
    <div>Body text says 3 of 7 and should not be used.</div>
  `;
  const container = document.querySelector('.appsDocsUiWizFindbarFindBarContainer')!;
  const input = document.querySelector('input[aria-label="Find in document"]')!;
  const counter = document.querySelector('.appsDocsUiWizFindbarFindInputCounter')!;
  rect(container);
  rect(input);
  rect(counter);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => input });

  expect(docsCommentDOM('findBoxState')).toEqual({
    visible: true,
    focused: true,
    current: 1,
    total: 1,
    unreadable: false,
    noResults: false,
  });
});

it('prefers the active visible find input when multiple are present', () => {
  document.body.innerHTML = `
    <div class="appsDocsUiWizFindbarFindBarContainer" role="dialog">
      <input aria-label="Find in document" />
      <span class="appsDocsUiWizFindbarFindInputCounter">1 of 3</span>
    </div>
    <div class="appsDocsUiWizFindbarFindBarContainer" role="dialog">
      <input aria-label="Find in document" />
      <span class="appsDocsUiWizFindbarFindInputCounter">2 of 5</span>
    </div>
  `;
  const hosts = document.querySelectorAll('.appsDocsUiWizFindbarFindBarContainer');
  const inputs = document.querySelectorAll('input[aria-label="Find in document"]');
  const counters = document.querySelectorAll('.appsDocsUiWizFindbarFindInputCounter');
  hosts.forEach(host => rect(host));
  inputs.forEach(input => rect(input));
  counters.forEach(counter => rect(counter));
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => inputs[1] });

  expect(docsCommentDOM('findBoxState')).toEqual({
    visible: true,
    focused: true,
    current: 2,
    total: 5,
    unreadable: false,
    noResults: false,
  });
});

it('marks find counter unreadable when no find bar host exists', () => {
  document.body.innerHTML = `
    <input aria-label="Find in document" />
    <div>1 of 1</div>
    <div>Body text says 3 of 7 and should not be used.</div>
  `;
  const input = document.querySelector('input[aria-label="Find in document"]')!;
  rect(input);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => input });

  expect(docsCommentDOM('findBoxState')).toEqual({
    visible: true,
    focused: true,
    current: 0,
    total: 0,
    unreadable: true,
    noResults: false,
  });
});

it('returns find focused false when labeled input is visible but unfocused', () => {
  document.body.innerHTML = `
    <div class="appsDocsUiWizFindbarFindBarContainer" role="dialog">
      <input aria-label="Find in document" />
      <span class="appsDocsUiWizFindbarFindInputCounter">1 of 1</span>
    </div>
    <textarea></textarea>
  `;
  const input = document.querySelector('input[aria-label="Find in document"]')!;
  const host = document.querySelector('.appsDocsUiWizFindbarFindBarContainer')!;
  const counter = document.querySelector('.appsDocsUiWizFindbarFindInputCounter')!;
  const other = document.querySelector('textarea')!;
  rect(host);
  rect(input);
  rect(counter);
  rect(other);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => other });

  expect(docsCommentDOM('findBoxState')).toEqual({
    visible: true,
    focused: false,
    current: 1,
    total: 1,
    unreadable: false,
    noResults: false,
  });
});

it('does not treat find bar as blocking modal, but still reports real modals', () => {
  document.body.innerHTML = `
    <div class="appsDocsUiWizFindbarFindBarContainer" role="dialog">
      <input aria-label="Find in document" />
      <span class="appsDocsUiWizFindbarFindInputCounter">1 of 1</span>
    </div>
  `;
  const findBar = document.querySelector('.appsDocsUiWizFindbarFindBarContainer')!;
  const input = document.querySelector('input[aria-label="Find in document"]')!;
  const counter = document.querySelector('.appsDocsUiWizFindbarFindInputCounter')!;
  rect(findBar);
  rect(input);
  rect(counter);
  expect(docsCommentDOM('blockingModalText')).toBeNull();

  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.textContent = 'Restore this file?';
  document.body.appendChild(modal);
  rect(modal);
  Object.defineProperty(modal, 'innerText', { configurable: true, value: 'Restore this file?' });
  expect(docsCommentDOM('blockingModalText')).toBe('Restore this file?');
});

it('returns composer state and button centers', () => {
  document.body.innerHTML = `
    <div class="docos-input">
      <div class="docos-input-contenteditable" role="textbox" contenteditable="true">hello</div>
      <button>Comment</button>
      <button class="docos-input-cancel">Cancel</button>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const buttons = document.querySelectorAll('button');
  rect(field, 20, 30, 200, 60);
  rect(buttons[0], 250, 40, 80, 20);
  rect(buttons[1], 340, 40, 80, 20);
  Object.defineProperty(field, 'innerText', { configurable: true, value: 'hello' });
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });

  expect(docsCommentDOM('composerState')).toEqual({ visible: true, focused: true, text: 'hello' });
  expect(docsCommentDOM('composerCommentButtonPoint')).toEqual({ x: 290, y: 50 });
  expect(docsCommentDOM('composerCancelButtonPoint')).toEqual({ x: 380, y: 50 });
});

it('treats active element inside composer field as focused', () => {
  document.body.innerHTML = `
    <div class="docos-input">
      <div class="docos-input-contenteditable" role="textbox" contenteditable="true">
        hello <span class="caret-child">child</span>
      </div>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const child = document.querySelector('.caret-child') as HTMLElement;
  rect(field, 20, 30, 200, 60);
  rect(child, 25, 35, 20, 10);
  Object.defineProperty(field, 'innerText', { configurable: true, value: 'hello child' });
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => child });

  expect(docsCommentDOM('composerState')).toEqual({ visible: true, focused: true, text: 'hello child' });
});

it('pins the focused composer when the second visible draft has focus', () => {
  const token = 'run-token-2nd';
  document.body.innerHTML = `
    <div class="docos-input first">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">first draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
    <div class="docos-input second">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">second draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action" aria-label="Post Comment">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
  `;
  const fields = document.querySelectorAll('.docos-input-contenteditable');
  const firstButtons = document.querySelectorAll('.docos-input.first .jfk-button');
  const secondButtons = document.querySelectorAll('.docos-input.second .jfk-button');
  rect(fields[0], 20, 30, 200, 60);
  rect(fields[1], 420, 30, 200, 60);
  rect(firstButtons[0], 250, 40, 80, 20);
  rect(firstButtons[1], 340, 40, 80, 20);
  rect(secondButtons[0], 650, 40, 80, 20);
  rect(secondButtons[1], 740, 40, 80, 20);
  Object.defineProperty(fields[0], 'innerText', { configurable: true, value: 'first draft' });
  Object.defineProperty(fields[1], 'innerText', { configurable: true, value: 'second draft' });
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => fields[1] });

  expect(docsCommentDOM('composerState', '', token)).toEqual({ visible: true, focused: true, text: 'second draft' });
  expect(fields[0].getAttribute('data-yeshie-anchor-composer')).toBeNull();
  expect(fields[1].getAttribute('data-yeshie-anchor-composer')).toBe(token);
  expect(docsCommentDOM('composerCommentButtonPoint', '', token)).toEqual({ x: 690, y: 50 });
  expect(docsCommentDOM('composerCancelButtonPoint', '', token)).toEqual({ x: 780, y: 50 });
});

it('reports composer_not_focused state and pins nothing when multiple composers are visible but none is focused', () => {
  const token = 'run-token-none-focused';
  document.body.innerHTML = `
    <div class="docos-input first">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">first draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
    <div class="docos-input second">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">second draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
    <textarea class="outside-focus"></textarea>
  `;
  const fields = document.querySelectorAll('.docos-input-contenteditable');
  const outside = document.querySelector('.outside-focus') as HTMLElement;
  fields.forEach(field => rect(field, 20, 30, 200, 60));
  rect(outside, 10, 10, 20, 10);
  Object.defineProperty(fields[0], 'innerText', { configurable: true, value: 'first draft' });
  Object.defineProperty(fields[1], 'innerText', { configurable: true, value: 'second draft' });
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => outside });

  expect(docsCommentDOM('composerState', '', token)).toEqual({ visible: true, focused: false, text: 'first draft' });
  expect(fields[0].getAttribute('data-yeshie-anchor-composer')).toBeNull();
  expect(fields[1].getAttribute('data-yeshie-anchor-composer')).toBeNull();
  expect(docsCommentDOM('composerCommentButtonPoint', '', token)).toBeNull();
  expect(docsCommentDOM('composerCancelButtonPoint', '', token)).toBeNull();
});

it('reports pinned composer as closed when it disappears and does not fall back to other visible drafts', () => {
  const token = 'run-token-remount';
  document.body.innerHTML = `
    <div class="docos-input first">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">first draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
    <div class="docos-input second">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">second draft</div>
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
  `;
  const firstRoot = document.querySelector('.docos-input.first') as HTMLElement;
  const secondRoot = document.querySelector('.docos-input.second') as HTMLElement;
  const fields = document.querySelectorAll('.docos-input-contenteditable');
  rect(fields[0], 20, 30, 200, 60);
  rect(fields[1], 420, 30, 200, 60);
  Object.defineProperty(fields[0], 'innerText', { configurable: true, value: 'first draft' });
  Object.defineProperty(fields[1], 'innerText', { configurable: true, value: 'second draft' });
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => fields[1] });

  expect(docsCommentDOM('composerState', '', token)).toEqual({ visible: true, focused: true, text: 'second draft' });
  secondRoot.remove();
  const firstField = firstRoot.querySelector('.docos-input-contenteditable') as HTMLElement;
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => firstField });

  expect(docsCommentDOM('composerState', '', token)).toEqual({ visible: false, focused: false, text: '' });
  expect(docsCommentDOM('composerCommentButtonPoint', '', token)).toBeNull();
  expect(docsCommentDOM('composerCancelButtonPoint', '', token)).toBeNull();
});

it('finds the composer Comment button in real Docs structure by text, aria-label, or both', () => {
  const runCase = ({ textContent, ariaLabel }: { textContent: string; ariaLabel?: string }) => {
    const ariaAttribute = ariaLabel ? ` aria-label="${ariaLabel}"` : '';
    document.body.innerHTML = `
      <div class="docos-toolbar">
        <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
      </div>
      <div class="docos-input" role="group">
        <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">note</div>
        <div class="goog-inline-block jfk-button jfk-button-action"${ariaAttribute}>${textContent}</div>
        <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
      </div>
    `;
    const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
    const outsideToolbarButton = document.querySelector('.docos-toolbar .jfk-button') as HTMLElement;
    const insideButtons = document.querySelectorAll('.docos-input .jfk-button');
    rect(field, 20, 30, 200, 60);
    rect(outsideToolbarButton, 10, 10, 90, 20);
    rect(insideButtons[0], 250, 40, 80, 20);
    rect(insideButtons[1], 340, 40, 80, 20);
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });
    return docsCommentDOM('composerCommentButtonPoint');
  };

  expect(runCase({ textContent: 'Comment' })).toEqual({ x: 290, y: 50 });
  expect(runCase({ textContent: 'Post', ariaLabel: 'Post Comment' })).toEqual({ x: 290, y: 50 });
  expect(runCase({ textContent: 'Comment', ariaLabel: 'Post Comment' })).toEqual({ x: 290, y: 50 });
});

it('finds the composer Comment button by docos-input-post class', () => {
  document.body.innerHTML = `
    <div class="docos-input" role="group">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">note</div>
      <div class="goog-inline-block jfk-button jfk-button-action docos-input-post">Post</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const buttons = document.querySelectorAll('.docos-input .jfk-button');
  rect(field, 20, 30, 200, 60);
  rect(buttons[0], 250, 40, 80, 20);
  rect(buttons[1], 340, 40, 80, 20);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });
  expect(docsCommentDOM('composerCommentButtonPoint')).toEqual({ x: 290, y: 50 });
});

it('returns null for disabled Comment buttons in composer', () => {
  document.body.innerHTML = `
    <div class="docos-input" role="group">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">note</div>
      <div class="goog-inline-block jfk-button jfk-button-action docos-input-post jfk-button-disabled" aria-label="Post Comment">Comment</div>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const button = document.querySelector('.docos-input .jfk-button') as HTMLElement;
  rect(field, 20, 30, 200, 60);
  rect(button, 250, 40, 80, 20);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });
  expect(docsCommentDOM('composerCommentButtonPoint')).toBeNull();

  button.classList.remove('jfk-button-disabled');
  button.setAttribute('aria-disabled', 'true');
  expect(docsCommentDOM('composerCommentButtonPoint')).toBeNull();
});

it('never returns the Cancel/Discard button as the composer Comment button', () => {
  document.body.innerHTML = `
    <div class="docos-input" role="group">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">note</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const cancel = document.querySelector('.docos-input .jfk-button') as HTMLElement;
  rect(field, 20, 30, 200, 60);
  rect(cancel, 250, 40, 80, 20);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });
  expect(docsCommentDOM('composerCommentButtonPoint')).toBeNull();
});

it('never returns a Comment button outside the composer root', () => {
  document.body.innerHTML = `
    <div class="docos-toolbar">
      <div class="goog-inline-block jfk-button jfk-button-action">Comment</div>
    </div>
    <div class="docos-input" role="group">
      <div class="docos-input-contenteditable" role="textbox" aria-label="Comment draft" contenteditable="true">note</div>
      <div class="goog-inline-block jfk-button jfk-button-standard" aria-label="Discard comment">Cancel</div>
    </div>
  `;
  const field = document.querySelector('.docos-input-contenteditable') as HTMLElement;
  const outsideComment = document.querySelector('.docos-toolbar .jfk-button') as HTMLElement;
  const cancel = document.querySelector('.docos-input .jfk-button') as HTMLElement;
  rect(field, 20, 30, 200, 60);
  rect(outsideComment, 10, 10, 90, 20);
  rect(cancel, 250, 40, 80, 20);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => field });
  expect(docsCommentDOM('composerCommentButtonPoint')).toBeNull();
});

it('counts exact posted comment text in visible comment bodies', () => {
  document.body.innerHTML = `
    <div class="docos-comment-content">hello world</div>
    <div class="docos-comment-content">hello world</div>
    <div class="docos-comment-content">hello world!</div>
  `;
  const cards = document.querySelectorAll('.docos-comment-content');
  cards.forEach(card => rect(card));
  Object.defineProperty(cards[0], 'innerText', { configurable: true, value: 'hello world' });
  Object.defineProperty(cards[1], 'innerText', { configurable: true, value: 'hello world' });
  Object.defineProperty(cards[2], 'innerText', { configurable: true, value: 'hello world!' });
  expect(docsCommentDOM('cardExactTextCount', 'hello world')).toBe(2);
  expect(docsCommentDOM('cardExactTextCount', 'missing text')).toBe(0);
});

it('does not collapse internal whitespace when matching card text', () => {
  document.body.innerHTML = `
    <div class="docos-comment-content">hello world</div>
    <div class="docos-comment-content">hello   world</div>
  `;
  const cards = document.querySelectorAll('.docos-comment-content');
  cards.forEach(card => rect(card));
  Object.defineProperty(cards[0], 'innerText', { configurable: true, value: 'hello world' });
  Object.defineProperty(cards[1], 'innerText', { configurable: true, value: 'hello   world' });
  expect(docsCommentDOM('cardExactTextCount', 'hello world')).toBe(1);
  expect(docsCommentDOM('cardExactTextCount', 'hello   world')).toBe(1);
});

it('counts exact .docos-replyview-body matches and ignores near misses', () => {
  document.body.innerHTML = `
    <div class="docos-replyview-body">Exact comment</div>
    <div class="docos-replyview-body">Exact comment!</div>
  `;
  const cards = document.querySelectorAll('.docos-replyview-body');
  cards.forEach(card => rect(card));
  Object.defineProperty(cards[0], 'innerText', { configurable: true, value: 'Exact comment' });
  Object.defineProperty(cards[1], 'innerText', { configurable: true, value: 'Exact comment!' });
  expect(docsCommentDOM('cardExactTextCount', 'Exact comment')).toBe(1);
  expect(docsCommentDOM('cardExactTextCount', 'Exact comment!')).toBe(1);
});

it('normalizes trailing whitespace in comment cards to match Docs post-trimming behavior', () => {
  document.body.innerHTML = `
    <div class="docos-replyview-body">Exact comment</div>
    <div class="docos-replyview-body">Exact comment </div>
  `;
  const cards = document.querySelectorAll('.docos-replyview-body');
  cards.forEach(card => rect(card));
  Object.defineProperty(cards[0], 'innerText', { configurable: true, value: 'Exact comment' });
  Object.defineProperty(cards[1], 'innerText', { configurable: true, value: 'Exact comment ' });
  expect(docsCommentDOM('cardExactTextCount', 'Exact comment')).toBe(2);
});
