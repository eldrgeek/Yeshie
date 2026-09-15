# dcc.godaddy.com Yeshie Recipe Set

DNS record changes for zones hosted at GoDaddy, made through the DNS Records
page in the logged-in Chrome. Built for `mike-wolf.com`, whose DNS has been
served by GoDaddy (`ns57`/`ns58.domaincontrol.com`) since 2026-09-07. There are
no GoDaddy API credentials on the Mac, so the web page is the only write path.

Authored 2026-09-14 by Claude Opus 5 (CCc) for Mike Wolf, from the
hand-driven session that added the `sala*` A records the same day. Updated
2026-09-15 by Claude Opus 5 (CCc): the delete recipe picks the row by exact
cells, and both recipes check the runtime's features before they act.

## One call

```bash
node scripts/godaddy-dns.mjs add    --type A   --name newsite      --value 217.77.6.197
node scripts/godaddy-dns.mjs delete --type TXT --name _yeshie-test --value ok-2026-09-14
```

`scripts/godaddy-dns.mjs` wraps the recipes and is the entry point to use. It:

1. asks each of the zone's nameservers directly (`dig +norec`, `aa` flag
   required) whether the change is already in place, and stops early if so;
2. checks that the Yeshie extension is connected at build 0.1.540 or later
   (see [Build guard](#build-guard));
3. reuses a `dcc.godaddy.com` tab, or opens one through the relay, and brings
   that tab to the front for the run. It never runs on whatever tab happens to
   be active. In a hidden, unfocused tab Chrome throttles the page; GoDaddy's
   DNS page then took 27 s to load, and a Filters click made during the load
   was lost;
4. runs the recipe on that tab with `scripts/run-async.mjs`;
5. polls every nameserver until each one answers authoritatively the way the
   change says, then prints that `dig` output as evidence.

Exit 0 means the recipe ran green and every nameserver agrees. Exit 1 means the
recipe or the nameserver check failed. Exit 2 means a usage, relay or DNS
transport problem.

The wrapper only queries the zone's own nameservers. A public resolver that is
asked about a name before the name exists caches the NXDOMAIN for the SOA
minimum (600 s at GoDaddy), and anyone using that resolver would then miss the
new record for that long.

Supported types are A, AAAA, CNAME and TXT, because their GoDaddy form is only
Name, Value and TTL. MX, SRV and CAA add fields these recipes do not fill. TTL
must be one of GoDaddy's presets: 1800 (the default), 3600, 43200, 86400 or
604800.

## Recipes

| # | Task | Params | Risk | Verified |
|---|------|--------|------|----------|
| 01 | add-dns-record | `domain`, `type`, `name`, `value`, `ttl` | adds a live DNS record | 1.1.0 live 2026-09-15 on build 0.1.552: 31/31 steps ok, twice; the record on ns57 + ns58 (`aa`). |
| 02 | delete-dns-record | `domain`, `type`, `name`, `value` | **deletes a live DNS record** | 1.1.0 live 2026-09-15 on build 0.1.552: 18/18 steps ok, twice. It deleted a record whose name is a prefix of another's and left the other in place; NXDOMAIN on ns57 + ns58 (`aa`). |

`type` is GoDaddy's lowercase option value (`a`, `aaaa`, `cname`, `txt`). The
wrapper lowercases whatever you pass. For a delete, `name` and `value` must be
exactly what the table's Name and Data cells show.

Both recipes also assert, at s01, that the run's tab is on `dcc.godaddy.com`.
The relay picks a tab on `base_url`'s host when one is open, but it falls back
to the active tab when none is, and that assert stops the run before it can
navigate an unrelated tab.

## Build guard

The delete recipe is dangerous on the wrong build. A build without
`within_row` ignores the field, so s11 would click the first Delete button in
the filtered table. The confirmation dialog never names the record, so s13
would pass and s14 would delete the wrong record.

Each recipe therefore starts with s00, an assert that requires the runtime
features it uses: `select` for add, `within_row.cells` for delete. The runtime
lists its features in `src/runtime-features.ts`, and the assert fails unless
every named feature is on the list. Builds react to s00 in three ways:

| Build | At s00 |
|-------|--------|
| Has `requires` (Yeshie [#75](https://github.com/eldrgeek/Yeshie/pull/75); on this Mac, build 0.1.552 onward) | passes when the build lists the features |
| Has the 2026-09-13 assert rule, but not `requires` | fails and stops: `requires` is the step's only check, and such a build finds nothing it can check |
| From before 2026-09-13, with no `assert` action | returns `unsupported`, which does not stop the chain |

The last row is why the wrapper still refuses a relay build below 0.1.540;
Yeshie [#66](https://github.com/eldrgeek/Yeshie/pull/66) (`select` and
`within_row`) loaded as build 0.1.540. Builds from 0.1.540 until #75 are safe
twice over. They stop at s00, and their `within_row` reads the
`{ "cells": [...] }` object as the text "[object Object]", which no row
contains.

The guard names features rather than a build number. The build number is a
counter that `com.yeshie.watcher` bumps on every build of the main checkout,
whatever code that checkout holds, so nobody can know in advance which number
first carries a feature.

## Limits

- The delete recipe picks the row by exact cells: the Name cell must read
  exactly `name`, and the Data cell, later in the row, exactly `value`. If the
  table shows the value differently from what you pass, no row matches and
  the step fails without deleting anything. The error lists the cells of the
  rows whose text holds both strings, so the difference is visible.
- The table shows 10 rows per page, and the type filter is the only way to
  narrow it. A record that is not on the first page of its type is not found,
  and the delete recipe stops at s10 or s11 without deleting anything.
- The recipes change one record per run. "Add More Records" (several rows, one
  "Save All Records") is not used.

## Page model (surveyed live 2026-09-14, table cells 2026-09-15)

- **DNS page:** `https://dcc.godaddy.com/control/portfolio/<domain>/settings?tab=dns`.
  `#dnsAddNewRecord` on the page means it loaded and the session is logged in.
- **Add New Record** (`#dnsAddNewRecord`) opens a "New Records" row above the table.
- **Type:** `select#dnsRecordIdDropdown`, a native React `<select>`. Option values
  are lowercase (`a`, `aaaa`, `cname`, `mx`, `txt`, `srv`, `caa`, `ns`, `https`,
  `svcb`, `tlsa`); labels are uppercase. Choosing a type re-renders the whole
  row, the `<select>` included, so anything located before the change is stale.
- **Name:** `#nameDnsFieldInput`. Placeholder "@ or www" for A, "@ or email" for TXT.
- **Value:** `input[data-testid='dataDnsFieldInput']`. Its `id` is regenerated on
  every render (`undefined-data-<uuid>`), so never select it by id.
- **TTL:** `select#ttl`: `1800` (1/2 Hour, the default), `3600`, `43200`, `86400`,
  `604800`, `custom`.
- **Save:** `#bulk-dns-records-save-btn`. It stays disabled until Type, Name and
  Value are filled, and a synthetic click on a disabled button does nothing.
- **After Save:** the New Records row closes, a "Success … Your DNS record has
  been updated" toast appears top right, and a "Domain configuration changes
  underway" notice appears. Opening Filters straight after Save did not open the
  panel, so the add recipe reloads the page before it verifies.
- **Cancel:** `#bulk-dns-records-cancel-btn`. With unsaved changes it opens a
  "You have unsaved changes" dialog (Yes, Cancel / No, Go Back).
- **Add More Records:** `#dnsAddMoreRecord` adds another row; the save button
  then reads "Save All Records".
- **Table:** `table.ux-table`, rows `tr.ux-tr`. Each row has a checkbox cell,
  then Type | Name | Data | TTL | Propagation | Copy | Delete | Edit. In the A
  rows read on 2026-09-15, the Name cell's visible text is exactly the host
  label (`sala`) and the Data cell's is exactly the address (`217.77.6.197`).
  A TXT row's Data cell shows the value without quotes: the cells form matched
  `ok-2026-09-15` in run 5 below. A cell's `textContent` holds more than its
  visible text, so the runtime reads `innerText`. Each row's buttons carry
  `aria-label` Copy / Delete / Edit and
  `data-testid="template-record-<Action>-<uuid>"`. No cell carries the record's
  name as an attribute; only the cell text does, which is why the delete
  recipe uses `within_row`. The table shows 10 rows per page, and TTL shows as
  a label ("1/2 Hour", "600 seconds").
- **Filters:** `#dnsTableFilterBtn` is disabled while a New Records row is open.
  It opens one checkbox per record type (`input[name="<type>"]`) and an Apply
  button. There is no name search. `#dnsAddNewRecord` appears well before the
  table's data, and a Filters click made while the table is still loading is
  lost, so both recipes wait for the table to stop changing and for Filters to
  be enabled before clicking it.
- **Delete:** a row's Delete button opens a modal (`role="dialog"`, "Confirm
  removal of your DNS records") with Yes, Confirm (`#dnsDeleteRecordModalDelete`)
  and Cancel (`#dnsDeleteRecordModalCancel`). The dialog does not name the
  record, which is why the row must be chosen exactly before Delete is clicked.

## Verification (2026-09-15): exact cells and the feature guard

Every run used build 0.1.552, the first build on this Mac with `requires` and
the cells form. Every result was checked on both nameservers with
`dig +norec` and the `aa` flag. The runs used two throwaway TXT records,
`_yeshie-test` and `_yeshie-test2`, which both held `ok-2026-09-15`. The first
name is a prefix of the second, as `sala` is of `sala65`. Both records were
deleted again, so the zone ended as it started.

| # | Run | Result |
|---|-----|--------|
| 1 | guard, negative control | An assert that required `no.such.feature` stopped the chain: "this build lacks no.such.feature (it has select, within_row, within_row.cells)". The step after it never ran. |
| 2 | add `_yeshie-test` | 31/31 steps ok, s00 included; the record on ns57 and ns58. |
| 3 | add `_yeshie-test2` | 31/31 steps ok; the record on ns57 and ns58. |
| 4 | delete `_yeshie-test`, text form (control) | Failed closed at s11: `2 rows contain ["_yeshie-test","ok-2026-09-15"]`. Nothing was clicked, and both records stayed on both nameservers. This is the gap the cells form closes. |
| 5 | delete `_yeshie-test`, cells form | 18/18 steps ok; NXDOMAIN on ns57 and ns58. `_yeshie-test2` still answered on both. |
| 6 | delete `_yeshie-test2`, cells form | 18/18 steps ok; NXDOMAIN on ns57 and ns58. |

Runs 1 and 4 used scratch payloads through `scripts/run-async.mjs`. Run 4 was
the delete recipe with s11 put back to the text form. Runs 2, 3, 5 and 6 went
through `scripts/godaddy-dns.mjs`.

## Verification (2026-09-14)

Every run used the TXT record `_yeshie-test` with value `ok-2026-09-14`, which
exists only for testing and has been deleted again. All runs went through
`scripts/godaddy-dns.mjs` on extension build 0.1.540, and every result below was
checked on both nameservers with `dig +norec` and the `aa` flag.

| # | Run | Result |
|---|-----|--------|
| 1 | add | The record was saved and both nameservers served it, but the run failed at s21: Filters, clicked straight after Save, never opened. Fix: reload the page before verifying (s19a, s19b). |
| 2 | delete | 15/15 steps ok; NXDOMAIN on ns57 and ns58. |
| 3 | add | 28/28 steps ok; the record on ns57 and ns58. |
| 4 | delete | 15/15 steps ok; NXDOMAIN. |
| 5 | add | 28/28 steps ok; the record on both nameservers. |
| 6 | delete | Stopped at s06 before deleting anything. The tab was hidden and unfocused, the page took 27 s to load, and the Filters click was lost. Fix: wait for the table to settle and for Filters to be enabled (s04a/s04b, s19c/s19d), and bring the tab to the front for the run. |
| 7 | delete | 17/17 steps ok; NXDOMAIN. With the tab in front the page was ready in about 3 s. |
| 8 | add (final code) | 30/30 steps ok; `_yeshie-test.mike-wolf.com. 1800 IN TXT "ok-2026-09-14"` on ns57 and ns58. |
| 9 | delete (final code) | 17/17 steps ok; NXDOMAIN on ns57 and ns58. |

Two tooling bugs showed up along the way and are fixed in the same change:

- Runs 1 and 3 printed no step list. `scripts/run-async.mjs` called
  `process.exit()` straight after printing, and on a pipe Node writes stdout
  asynchronously, so its `--json` output was cut off at the 64 KB pipe buffer.
  It now exits only after stdout drains.
- One further attempt stopped before any recipe ran: the wrapper's tab lookup
  found no GoDaddy tab, and the fallback `open_tab` hit the relay's 20 s limit
  even though the tab did open. The lookup now retries the listing and checks
  again after a failed open.
