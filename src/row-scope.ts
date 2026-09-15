/**
 * Row-scoped clicks — `click` with `within_row`.
 *
 * Table UIs repeat the same control on every row. GoDaddy's DNS table has one
 * Delete button per record, and only the row's text says which record it
 * belongs to, so no selector alone can name "the Delete button for
 * _yeshie-test". A click step may add `within_row`, which names the row that
 * the clicked element sits in (its closest <tr> or [role="row"]). It has two
 * forms:
 *
 *   - Text form: a string, or a list of strings. Every string must appear
 *     somewhere in the row's text.
 *   - Cells form: `{ "cells": [...] }`. Every string must be the whole text of
 *     one of the row's cells, and those cells must come in the order the
 *     strings are listed; other cells may sit between them. A <tr>'s cells are
 *     its <td> and <th>; a [role="row"]'s cells are its role=cell, gridcell
 *     and rowheader elements. Texts are compared after trimming and collapsing
 *     each run of whitespace to one space. Case matters.
 *
 * The text form cannot tell a name from a longer name that starts with it.
 * GoDaddy's A records `sala` and `sala65` both hold 217.77.6.197, so the text
 * of both rows contains "sala" and "217.77.6.197", and the step matches two
 * rows. `{ "cells": ["sala", "217.77.6.197"] }` matches only the row whose
 * Name cell is exactly `sala`. The order rule stops a record from matching
 * when its name and value are swapped.
 *
 * Both forms fail closed. Exactly one element matching the selector may sit in
 * a matching row. Zero or several is an error and nothing is clicked, because
 * the controls this exists for are usually destructive. A malformed
 * `within_row` is an error too, and so is a string that is empty once params
 * are filled in, because an empty string would match every row.
 *
 * Shared by the live runtime (packages/extension/src/entrypoints/background.ts)
 * and the unit tests. The runtime's page function PRE_CLICK_NTH repeats the
 * rowMatches rule inline, because a function injected into the page cannot
 * import this module.
 */

export type RowScope = { mode: 'text' | 'cells'; needles: string[] };

/** One match of the selector as the page reports it: its row's text and its cells' texts. */
export type RowCells = { text: string; cells: string[] };

/** Null when the match does not sit inside a row. */
export type RowSnapshot = RowCells | null;

export type RowPick = { ok: true; index: number } | { ok: false; reason: string };

/** Trim, and collapse each run of whitespace to one space. Cell texts are compared this way. */
export function normalizeCell(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Parse `within_row` into a scope, filling in params with `interpolate`.
 * Throws when the value is malformed or a string is empty once filled in.
 */
export function rowScope(withinRow: unknown, interpolate: (s: string) => string = (s) => s): RowScope {
  let mode: RowScope['mode'] = 'text';
  let raw: unknown = withinRow;
  if (withinRow !== null && typeof withinRow === 'object' && !Array.isArray(withinRow)) {
    const keys = Object.keys(withinRow);
    if (keys.length !== 1 || keys[0] !== 'cells') {
      throw new Error(`within_row: the object form takes exactly one key, "cells" (got ${JSON.stringify(keys)})`);
    }
    mode = 'cells';
    raw = (withinRow as { cells: unknown }).cells;
  }
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new Error('within_row has no text to match');
  const needles = list.map((n, i) => {
    if (typeof n !== 'string' && typeof n !== 'number') {
      throw new Error(`within_row entry ${i} is ${n === null ? 'null' : typeof n}; it must be a string`);
    }
    const filled = interpolate(String(n));
    const needle = mode === 'cells' ? normalizeCell(filled) : filled;
    if (needle.length === 0) {
      throw new Error(`within_row entry ${i} (${JSON.stringify(n)}) is empty once params are filled in; an empty string would match every row`);
    }
    return needle;
  });
  return { mode, needles };
}

/** True when the row satisfies the scope. */
export function rowMatches(row: RowSnapshot, scope: RowScope): boolean {
  if (!row) return false;
  if (scope.mode === 'text') return scope.needles.every((n) => row.text.includes(n));
  const cells = row.cells.map(normalizeCell);
  let from = 0;
  for (const needle of scope.needles) {
    const at = cells.indexOf(needle, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

/** For a cells-form miss: the cells of up to three rows whose text holds every string, so a cell that reads differently shows in the error. */
function nearMisses(rows: RowSnapshot[], scope: RowScope): string {
  if (scope.mode !== 'cells') return '';
  const near = rows
    .filter((r): r is RowCells => r !== null && scope.needles.every((n) => normalizeCell(r.text).includes(n)))
    .slice(0, 3)
    .map((r) => JSON.stringify(r.cells.map(normalizeCell)));
  return near.length > 0 ? `; rows whose text holds them have cells ${near.join(' ')}` : '';
}

/**
 * `rows[i]` is the row around the i-th element the selector matched. Returns
 * the one index whose row matches the scope.
 */
export function pickRowIndex(rows: RowSnapshot[], scope: RowScope): RowPick {
  const hits: number[] = [];
  rows.forEach((row, i) => {
    if (rowMatches(row, scope)) hits.push(i);
  });
  if (hits.length === 1) return { ok: true, index: hits[0] };
  const wanted = JSON.stringify(scope.needles);
  if (hits.length === 0) {
    const what = scope.mode === 'cells' ? `has cells ${wanted} in that order` : `contains ${wanted}`;
    return { ok: false, reason: `no row ${what} (${rows.length} candidates)${nearMisses(rows, scope)}` };
  }
  const what = scope.mode === 'cells' ? `have cells ${wanted} in that order` : `contain ${wanted}`;
  return { ok: false, reason: `${hits.length} rows ${what}; within_row must match exactly one` };
}
