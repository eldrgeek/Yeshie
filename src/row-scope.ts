/**
 * Row-scoped clicks — `click` with `within_row`.
 *
 * Table UIs repeat the same control on every row. GoDaddy's DNS table has one
 * Delete button per record, and only the row's text says which record it
 * belongs to, so no selector alone can name "the Delete button for
 * _yeshie-test". A click step may add `within_row`: one string or a list of
 * strings, and every one must appear in the text of the clicked element's row
 * (its closest <tr> or [role="row"]).
 *
 * The rule fails closed. Exactly one element matching the selector may sit in
 * a matching row. Zero or several is an error and nothing is clicked, because
 * the controls this exists for are usually destructive.
 *
 * Shared by the live runtime (packages/extension/src/entrypoints/background.ts)
 * and the unit tests.
 */

/** Normalize `within_row` to its non-empty strings, each interpolated. */
export function rowNeedles(withinRow: unknown, interpolate: (s: string) => string = (s) => s): string[] {
  const raw = Array.isArray(withinRow) ? withinRow : [withinRow];
  return raw
    .filter((n) => n !== undefined && n !== null)
    .map((n) => interpolate(String(n)))
    .filter((n) => n.length > 0);
}

export type RowPick = { ok: true; index: number } | { ok: false; reason: string };

/**
 * `rowTexts[i]` is the row text around the i-th element the selector matched
 * (null when that element is not inside a row). Returns the one index whose
 * row contains every needle.
 */
export function pickRowIndex(rowTexts: Array<string | null>, needles: string[]): RowPick {
  if (needles.length === 0) return { ok: false, reason: 'within_row has no text to match' };
  const hits: number[] = [];
  rowTexts.forEach((text, i) => {
    if (text !== null && needles.every((n) => text.includes(n))) hits.push(i);
  });
  if (hits.length === 1) return { ok: true, index: hits[0] };
  const wanted = JSON.stringify(needles);
  if (hits.length === 0) return { ok: false, reason: `no row contains ${wanted} (${rowTexts.length} candidates)` };
  return { ok: false, reason: `${hits.length} rows contain ${wanted}; within_row must match exactly one` };
}
