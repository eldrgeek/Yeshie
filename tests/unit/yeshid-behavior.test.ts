import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dryRunResolve } from '../../src/dry-run.js';
import { StepExecutor } from '../../src/step-executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const loginHtml = readFileSync(resolve(__dirname, '../fixtures/yeshid-login.html'), 'utf-8');
const peopleListHtml = readFileSync(resolve(__dirname, '../fixtures/yeshid-people-list.html'), 'utf-8');
const personEditHtml = readFileSync(resolve(__dirname, '../fixtures/yeshid-person-edit.html'), 'utf-8');
const offboardHtml = readFileSync(resolve(__dirname, '../fixtures/yeshid-offboard.html'), 'utf-8');

function loadPayload(name: string) {
  return JSON.parse(readFileSync(resolve(root, `sites/yeshid/tasks/${name}.payload.json`), 'utf-8'));
}

function setDom(html: string, path: string) {
  document.body.innerHTML = html;
  window.history.replaceState({}, '', path);
}

describe('YeshID login behavior', () => {
  beforeEach(() => {
    setDom(loginHtml, '/login');
  });

  it('exposes the Google SSO entrypoint used by the current auth flow', () => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(el => el.textContent?.toLowerCase().includes('google')) as HTMLButtonElement | undefined;
    expect(button).toBeDefined();

    let clicked = false;
    button?.addEventListener('click', () => { clicked = true; });
    button?.click();
    expect(clicked).toBe(true);
  });

  it('looks unauthenticated until the authenticated nav shell is present', () => {
    expect(document.querySelector('.v-navigation-drawer a[href="/overview"]')).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });
});

describe('YeshID modify-user behavior', () => {
  const payload = loadPayload('03-user-modify');

  it('finds the user from the people list with the real search and row steps', () => {
    setDom(peopleListHtml, '/organization/people');
    const ex = new StepExecutor(document, payload.abstractTargets, {
      user_identifier: 'John Doe',
    }, {});

    const report = dryRunResolve(document, '03-user-modify', {
      'search-input': payload.abstractTargets['search-input'],
    });
    expect(report.allResolved).toBe(true);

    const search = ex.execute(payload.chain[2]);
    const findRow = ex.execute(payload.chain[3]);
    expect(search.status).toBe('ok');
    expect((document.querySelector('#people-search') as HTMLInputElement).value).toBe('John Doe');
    expect(findRow.status).toBe('ok');
  });

  it('resolves edit fields, applies updates, and reads the success message', () => {
    setDom(personEditHtml, '/organization/people/abc-123');
    const ex = new StepExecutor(document, payload.abstractTargets, {
      new_first_name: 'Jane',
      new_last_name: 'Roe',
      new_personal_email: 'jane.roe@example.com',
    }, {});

    const report = dryRunResolve(document, '03-user-modify', {
      'save-button': payload.abstractTargets['save-button'],
      'edit-first-name': payload.abstractTargets['edit-first-name'],
      'edit-last-name': payload.abstractTargets['edit-last-name'],
      'edit-personal-email': payload.abstractTargets['edit-personal-email'],
    });
    expect(report.allResolved).toBe(true);

    let editClicked = false;
    let saveClicked = false;
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.find(btn => btn.textContent?.includes('Edit'))?.addEventListener('click', () => { editClicked = true; });
    buttons.find(btn => btn.textContent?.includes('Save'))?.addEventListener('click', () => { saveClicked = true; });

    expect(ex.execute(payload.chain[5]).status).toBe('ok');
    expect(editClicked).toBe(true);

    expect(ex.execute(payload.chain[6]).status).toBe('ok');
    expect(ex.execute(payload.chain[7]).status).toBe('ok');
    expect(ex.getBuffer()['edit_form_snapshot']).toBeTruthy();

    expect(ex.execute(payload.chain[8]).status).toBe('ok');
    expect(ex.execute(payload.chain[9]).status).toBe('ok');
    expect(ex.execute(payload.chain[10]).status).toBe('ok');

    expect((document.querySelector('#edit-first-name') as HTMLInputElement).value).toBe('Jane');
    expect((document.querySelector('#edit-last-name') as HTMLInputElement).value).toBe('Roe');
    expect((document.querySelector('#edit-personal-email') as HTMLInputElement).value).toBe('jane.roe@example.com');

    expect(ex.execute(payload.chain[11]).status).toBe('ok');
    expect(saveClicked).toBe(true);

    const confirmation = ex.execute(payload.chain[13]);
    expect(confirmation.status).toBe('ok');
    expect(confirmation.text).toBe('Profile updated successfully');
  });
});

describe('YeshID offboard behavior', () => {
  const payload = loadPayload('02-user-delete');

  it('finds the target user from the people list and opens the row', () => {
    setDom(peopleListHtml, '/organization/people');
    const ex = new StepExecutor(document, payload.abstractTargets, {
      user_identifier: 'John Doe',
    }, {});

    const report = dryRunResolve(document, '02-user-delete:list', {
      'search-input': payload.abstractTargets['search-input'],
    });
    expect(report.allResolved).toBe(true);

    expect(ex.execute(payload.chain[2]).status).toBe('ok');
    expect(ex.execute(payload.chain[4]).status).toBe('ok');
    expect(ex.getBuffer()['find_result']).toEqual(expect.objectContaining({ found: true }));
  });

  it('runs the manage to offboard path and captures the final deactivated state', () => {
    setDom(offboardHtml, '/organization/people/abc-123/offboard/');
    const ex = new StepExecutor(document, payload.abstractTargets, {
      user_identifier: 'John Doe',
    }, {});

    const report = dryRunResolve(document, '02-user-delete:detail', payload.abstractTargets);
    expect(['cached', 'text_match']).toContain(report.targets['manage-button'].resolvedVia);
    expect(['text_match', 'css_cascade']).toContain(report.targets['offboard-menu-item'].resolvedVia);
    expect(report.targets['confirm-offboard-button'].confidence).toBeGreaterThan(0);

    let manageClicked = false;
    let offboardClicked = false;
    let immediateClicked = false;
    let confirmClicked = false;

    document.querySelector('button[aria-haspopup="menu"]')?.addEventListener('click', () => { manageClicked = true; });
    Array.from(document.querySelectorAll('.v-list-item')).find(el => el.textContent?.includes('Offboard User'))?.addEventListener('click', () => { offboardClicked = true; });
    Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent?.includes('Immediately'))?.addEventListener('click', () => { immediateClicked = true; });
    Array.from(document.querySelectorAll('button')).find(el => el.textContent?.includes('Offboard person'))?.addEventListener('click', () => { confirmClicked = true; });

    expect(ex.execute(payload.chain[6]).status).toBe('ok');
    expect(executeStatusOk(ex, payload.chain[7])).toBe(true);
    expect(executeStatusOk(ex, payload.chain[8])).toBe(true);
    expect(executeStatusOk(ex, payload.chain[9])).toBe(true);
    expect(executeStatusOk(ex, payload.chain[10])).toBe(true);
    expect(executeStatusOk(ex, payload.chain[11])).toBe(true);

    expect(manageClicked).toBe(true);
    expect(offboardClicked).toBe(true);
    expect(immediateClicked).toBe(true);
    expect(confirmClicked).toBe(true);

    // chain[17]=delay, chain[18]=find_row verification (asserts Deactivated status)
    expect(ex.execute(payload.chain[17]).status).toBe('ok');
    const verifyStep = ex.execute(payload.chain[18]);
    expect(verifyStep.status).toBe('ok');
    const verifyResult = ex.getBuffer()['verify_offboarded'];
    expect(verifyResult).toBeDefined();
    expect((verifyResult as any)?.found).toBe(true);
  });
});

function executeStatusOk(executor: StepExecutor, step: any) {
  return executor.execute(step).status === 'ok';
}
