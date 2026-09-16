/**
 * First-class `respond` — build a query recipe's answer from the run's buffer.
 *
 * Used by the live runtime (packages/extension/src/entrypoints/background.ts),
 * so unit tests cover the same rule the extension runs. The runtime stores the
 * answer as buffer.response, and the ChainResult returns the buffer.
 *
 * `data` (or the older name `extract_from`) maps each answer field to a rule:
 *   "text {{param}}"                 the string, with {{params}} filled in
 *   { source }                       buffer[source] as it is
 *   { source, extract: "count" }     the number of items in buffer[source] (a list)
 *   { source, pattern, capture? }    the first match of `pattern` in buffer[source]'s
 *                                    text; `capture` picks a group (default: the whole
 *                                    match). A result made only of digits becomes a
 *                                    number, so "1-10 of 28" with "of (\d+)" gives 28.
 * Any other value (a number, true/false, null) is copied as it is.
 *
 * A rule whose source is not in the buffer, whose pattern does not match, or
 * whose count source is not a list is an error. The step then fails and the
 * chain halts, so a query never answers with a silent null. Add
 * `optional: true` to a rule to get null instead.
 *
 * `empty_message`: when no number in the answer is above 0 and no list in it
 * has items, the answer also gets `message: empty_message`.
 */

export type RespondRule =
  | string
  | number
  | boolean
  | null
  | { source: string; pattern?: string; capture?: number; extract?: 'count'; optional?: boolean };

export type RespondStep = {
  stepId?: string;
  data?: Record<string, RespondRule>;
  extract_from?: Record<string, RespondRule>;
  empty_message?: string;
};

export type RespondOutcome = { ok: true; response: Record<string, unknown> } | { ok: false; error: string };

export function buildResponse(step: RespondStep, buffer: Record<string, unknown>, interpolate: (s: string) => string): RespondOutcome {
  const id = step.stepId ? ` [${step.stepId}]` : '';
  const spec = step.data ?? step.extract_from;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, error: `respond${id}: needs a "data" map` };

  const response: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(spec)) {
    if (typeof rule === 'string') { response[key] = interpolate(rule); continue; }
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) { response[key] = rule; continue; }

    const fail = (why: string): RespondOutcome | null => (rule.optional ? null : { ok: false, error: `respond${id}: "${key}" ${why}` });
    const value = buffer[rule.source];
    if (value === undefined || value === null) {
      const f = fail(`reads "${rule.source}", which is not in the buffer`);
      if (f) return f;
      response[key] = null;
      continue;
    }
    if (rule.extract === 'count') {
      if (!Array.isArray(value)) {
        const f = fail(`counts "${rule.source}", which is not a list`);
        if (f) return f;
        response[key] = null;
        continue;
      }
      response[key] = value.length;
      continue;
    }
    if (rule.pattern) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const match = text.match(new RegExp(rule.pattern));
      const got = match ? match[rule.capture ?? 0] : undefined;
      if (got === undefined) {
        const f = fail(`/${rule.pattern}/ does not match "${rule.source}" (${JSON.stringify(text.slice(0, 80))})`);
        if (f) return f;
        response[key] = null;
        continue;
      }
      response[key] = /^\d+$/.test(got) ? Number(got) : got;
      continue;
    }
    response[key] = value;
  }

  if (step.empty_message && isEmptyAnswer(response)) response.message = step.empty_message;
  return { ok: true, response };
}

/** True when no number in the answer is above 0 and no list in it has items. */
function isEmptyAnswer(response: Record<string, unknown>): boolean {
  return !Object.values(response).some((v) => (typeof v === 'number' && v > 0) || (Array.isArray(v) && v.length > 0));
}
