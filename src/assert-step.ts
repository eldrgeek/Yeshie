/**
 * First-class `assert` — a guard step that must hold or the chain stops.
 *
 * Shared by the live runtime (packages/extension/src/entrypoints/background.ts)
 * and the StepExecutor mirror (src/step-executor.ts), so unit tests cover the
 * same rules the extension runs.
 *
 * An assert checks whichever of these it declares, and every declared check
 * must pass:
 *   - `condition`   — a value (usually an interpolated string). "false", "0",
 *                     "", "null", "undefined", false, 0 and null all fail.
 *                     `condition: "false"` is the recipes' hard-stop guard.
 *   - `url_pattern` — a regex the current page URL must match.
 *   - `selector`    — an element that must exist; with `value` (or `text`),
 *                     its text must also contain that string.
 *
 * An assert that declares none of these fails. A guard nobody wrote a check
 * for must not pass silently: it stops the chain until someone writes one.
 *
 * Note on `condition`: on every other action, a falsy `condition` means "skip
 * this step". On `assert` it is the assertion itself, so the runtime must not
 * apply the skip rule to asserts (it used to, which is why `assert false`
 * guards were skipped and the chain ran on).
 */

export type AssertStep = {
  stepId?: string;
  action?: string;
  condition?: unknown;
  url_pattern?: string;
  selector?: string;
  value?: unknown;
  text?: unknown;
  message?: string;
  [key: string]: unknown;
};

/** What the page looked like when the assert ran. Only the parts the step asks about are needed. */
export type AssertSnapshot = {
  href?: string;
  elementFound?: boolean;
  elementText?: string | null;
};

/** `reason` says why the assert failed; it is empty when `ok` is true. */
export type AssertOutcome = { ok: boolean; reason: string };

const FALSY_CONDITION_STRINGS = new Set(['', 'false', '0', 'null', 'undefined']);

export function isFalsyCondition(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0) return true;
  if (typeof value === 'string') return FALSY_CONDITION_STRINGS.has(value.trim().toLowerCase());
  return false;
}

/** True when the step needs the page (URL or DOM) to be evaluated. */
export function assertNeedsPage(step: AssertStep): boolean {
  return !!(step.url_pattern || step.selector);
}

function expectedText(step: AssertStep, I: (s: string) => string): string | null {
  const raw = step.value ?? step.text;
  if (raw === undefined || raw === null) return null;
  const s = I(String(raw));
  return s.length > 0 ? s : null;
}

export function evaluateAssert(
  step: AssertStep,
  snapshot: AssertSnapshot,
  interpolate: (s: string) => string = (s) => s,
): AssertOutcome {
  const I = interpolate;
  const hasCondition = Object.prototype.hasOwnProperty.call(step, 'condition');
  if (!hasCondition && !step.url_pattern && !step.selector) {
    return { ok: false, reason: 'assert declares nothing to check (needs condition, url_pattern or selector)' };
  }

  if (hasCondition) {
    const value = typeof step.condition === 'string' ? I(step.condition) : step.condition;
    if (isFalsyCondition(value)) return { ok: false, reason: `condition is false (${JSON.stringify(step.condition)})` };
  }

  if (step.url_pattern) {
    const pattern = I(step.url_pattern);
    const href = snapshot.href ?? '';
    if (!new RegExp(pattern).test(href)) return { ok: false, reason: `url "${href}" does not match /${pattern}/` };
  }

  if (step.selector) {
    const selector = I(step.selector);
    if (!snapshot.elementFound) return { ok: false, reason: `element not found: ${selector}` };
    const expected = expectedText(step, I);
    const actual = (snapshot.elementText ?? '').trim();
    if (expected !== null && !actual.includes(expected)) {
      return { ok: false, reason: `expected "${expected}" in "${actual}"` };
    }
  }

  return { ok: true, reason: '' };
}

/** The error a failed assert throws. The recipe's own `message` leads, because it says why the guard exists. */
export function assertFailureMessage(step: AssertStep, reason: string): string {
  const id = step.stepId ? ` [${step.stepId}]` : '';
  return step.message ? `Assert failed${id}: ${step.message} (${reason})` : `Assert failed${id}: ${reason}`;
}

/** Read the parts of the page an assert needs. Pure DOM; safe to run inside the page. */
export function snapshotForAssert(doc: Document, href: string, selector: string | null): AssertSnapshot {
  if (!selector) return { href };
  const el = doc.querySelector(selector);
  if (!el) return { href, elementFound: false, elementText: null };
  const tag = el.tagName.toLowerCase();
  const text = tag === 'input' || tag === 'textarea' ? (el as HTMLInputElement).value : el.textContent;
  return { href, elementFound: true, elementText: text ?? null };
}
