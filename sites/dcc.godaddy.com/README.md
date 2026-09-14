# dcc.godaddy.com Yeshie Recipe Set

DNS record changes for zones hosted at GoDaddy, made through the DNS Records
page in the logged-in Chrome. Built for `mike-wolf.com`, whose DNS has been
served by GoDaddy (`ns57`/`ns58.domaincontrol.com`) since 2026-09-07. There are
no GoDaddy API credentials on the Mac, so the web page is the only write path.

Authored 2026-09-14 by Claude Opus 5 (CCc) for Mike Wolf, from the
hand-driven session that added the `sala*` A records the same day.

## One call

```bash
node scripts/godaddy-dns.mjs add    --type A   --name newsite      --value 217.77.6.197
node scripts/godaddy-dns.mjs delete --type TXT --name _yeshie-test --value ok-2026-09-14
```

`scripts/godaddy-dns.mjs` wraps the recipes and is the entry point to use. It:

1. asks each of the zone's nameservers directly (`dig +norec`, `aa` flag
   required) whether the change is already in place, and stops early if so;
2. checks that the Yeshie extension is connected at build 0.1.540 or later;
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
| 01 | add-dns-record | `domain`, `type`, `name`, `value`, `ttl` | adds a live DNS record | live 2026-09-14: 30/30 steps ok, record on ns57 + ns58 (`aa`) |
| 02 | delete-dns-record | `domain`, `type`, `name`, `value` | **deletes a live DNS record** | live 2026-09-14: 17/17 steps ok twice, NXDOMAIN on ns57 + ns58 (`aa`) |

`type` is GoDaddy's lowercase option value (`a`, `aaaa`, `cname`, `txt`). The
wrapper lowercases whatever you pass.

Both recipes need extension build 0.1.540 or later, which has the `select`
action and `click` + `within_row`
([Yeshie #66](https://github.com/eldrgeek/Yeshie/pull/66)). Run them through the
wrapper, which checks the build. On an older build the delete recipe would
ignore `within_row` and click the first Delete button in the table.

Both recipes start with an assert that the run's tab is on `dcc.godaddy.com`.
The relay picks a tab on `base_url`'s host when one is open, but it falls back
to the active tab when none is, and that first assert stops the run before it
can navigate an unrelated tab.

## Limits

- `within_row` matches substrings of the row text. A name that is a prefix of
  another with the same value (`sala` and `sala65`, both `217.77.6.197`)
  matches several rows, so the delete step fails without deleting anything.
  Deleting such a record needs an exact-cell match, which the runtime does not
  have yet.
- The recipes change one record per run. "Add More Records" (several rows, one
  "Save All Records") is not used.

## Page model (surveyed live 2026-09-14)

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
- **Table:** `table.ux-table`, rows `tr.ux-tr`, columns Type | Name | Data | TTL |
  Propagation | Copy | Delete | Edit. Each row's buttons carry `aria-label`
  Copy / Delete / Edit and `data-testid="template-record-<Action>-<uuid>"`. No
  cell carries the record's name as an attribute; only the row text does, which
  is why the delete recipe uses `within_row`. The table shows 10 rows per page,
  and TTL shows as a label ("1/2 Hour").
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
