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
 *   - `requires`    — a feature name, or a list of them, that the runtime must
 *                     list (src/runtime-features.ts). A recipe puts this guard
 *                     before the first step that needs a feature which older
 *                     builds lack.
 *
 * An assert that declares none of these fails. A guard nobody wrote a check
 * for must not pass silently: it stops the chain until someone writes one.
 *
 * `requires` must be the only check in its assert. A build that predates
 * `requires` ignores the field. When the field stands alone, that build finds
 * nothing it can check, so it fails the step and stops; every build since
 * 2026-09-13 does this. If a `url_pattern` sat beside it, that build would
 * check the URL, pass, and run on into the step the guard exists to block.
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
  requires?: unknown;
  message?: string;
  [key: string]: unknown;
};

/** What the page looked like when the assert ran. Only the parts the step asks about are needed. */
export type AssertSnapshot = {
  href?: string;
  elementFound?: boolean;
  elementText?: string | null;
};

/**
 * What the runtime says about itself. The live runtime passes RUNTIME_FEATURES.
 * The StepExecutor mirror passes nothing, so a `requires` guard always stops it;
 * the mirror has no within_row either.
 */
export type AssertRuntime = { features?: readonly string[] };

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

function checkRequires(raw: unknown, features: readonly string[] | undefined): AssertOutcome {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0 || !list.every((f) => typeof f === 'string' && f.trim().length > 0)) {
    return { ok: false, reason: `requires must name one or more features (got ${JSON.stringify(raw)})` };
  }
  const wanted = (list as string[]).map((f) => f.trim());
  if (!features) {
    return { ok: false, reason: `this runtime does not list its features, so it cannot show that it has ${wanted.join(', ')}` };
  }
  const missing = wanted.filter((f) => !features.includes(f));
  if (missing.length > 0) {
    return { ok: false, reason: `this build lacks ${missing.join(', ')} (it has ${features.join(', ') || 'no listed features'})` };
  }
  return { ok: true, reason: '' };
}

export function evaluateAssert(
  step: AssertStep,
  snapshot: AssertSnapshot,
  interpolate: (s: string) => string = (s) => s,
  runtime: AssertRuntime = {},
): AssertOutcome {
  const I = interpolate;
  const hasCondition = Object.prototype.hasOwnProperty.call(step, 'condition');
  const hasRequires = Object.prototype.hasOwnProperty.call(step, 'requires');
  if (!hasCondition && !step.url_pattern && !step.selector && !hasRequires) {
    return { ok: false, reason: 'assert declares nothing to check (needs condition, url_pattern, selector or requires)' };
  }

  if (hasRequires) {
    if (hasCondition || step.url_pattern || step.selector) {
      return { ok: false, reason: 'requires must be the only check in its assert, because a build that predates requires would skip it and pass on the other checks' };
    }
    return checkRequires(step.requires, runtime.features);
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
