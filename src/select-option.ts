/**
 * First-class `select` — choose an option in a native <select>.
 *
 * Shared by the live runtime (packages/extension/src/entrypoints/background.ts)
 * and the StepExecutor mirror (src/step-executor.ts), so unit tests cover the
 * same matching rule the extension runs.
 *
 * `wanted` matches an option by, in order:
 *   1. exact value            (GoDaddy's record type: "txt")
 *   2. exact visible text     ("TXT", "1/2 Hour")
 *   3. value, ignoring case
 *   4. visible text, ignoring case
 * The first rule that matches anything wins, so an exact hit is never shadowed
 * by a looser one. No match returns -1: the runtime then fails the step and
 * lists the options, so a recipe never runs on with a dropdown it did not set.
 */

export type SelectOption = { value: string; text: string };

export function pickOptionIndex(options: SelectOption[], wanted: string): number {
  const exact = String(wanted);
  const loose = exact.trim().toLowerCase();
  const rules: Array<(o: SelectOption) => boolean> = [
    (o) => o.value === exact,
    (o) => o.text.trim() === exact.trim(),
    (o) => o.value.toLowerCase() === loose,
    (o) => o.text.trim().toLowerCase() === loose,
  ];
  for (const rule of rules) {
    const i = options.findIndex(rule);
    if (i >= 0) return i;
  }
  return -1;
}

/** "a=A, txt=TXT, 1800=1/2 Hour" — for the error a failed match throws. */
export function describeOptions(options: SelectOption[]): string {
  return options.map((o) => (o.value === o.text.trim() ? o.value : `${o.value}=${o.text.trim()}`)).join(', ');
}
