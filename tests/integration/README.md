# GitHub recipe integration tests

`github-recipes.mjs` verifies that Yeshie actually executes its GitHub recipes,
using **instruct-then-verify**: each test POSTs a DSL chain to the relay
(`localhost:3333`) → the relay dispatches to the loaded extension → the
extension runs it against a live GitHub tab → we assert on the returned DOM
snapshot.

## Why not Playwright

Playwright would drive the browser over its own automation path, **bypassing**
Yeshie's relay protocol, step executor, target resolver, site model, and content
script. A green Playwright run proves Playwright works — not that Yeshie works.
To verify "Yeshie did what it was told," you have to drive Yeshie. So these tests
intentionally go through the relay, not a parallel automation engine.

What we added over the old `scripts/run-github-recipes.sh`:

1. **Content assertions, not just the `success` flag.** A `navigate`+`read` can
   "succeed" while sitting on a login wall, a 404, or a redirect. Each recipe
   declares a `verify(page)` predicate over the real DOM snapshot. (This already
   caught a real bug: `microsoft/vscode#1` is an *issue*, so `/pull/1` redirects
   to `/issues/1` — the old success-only check would have falsely passed.)
2. **Non-zero exit on failure**, so it is CI/gate-able.
3. **Incremental JSON report** at `/tmp/github-recipe-results.json`.
4. **Hard preflight**: relay up AND extension connected, else fail fast with the
   remediation pointer (see the extension-loading note below).

## Scope

Only **public, read-only** recipes run here (21 of them). Mutating recipes
(star, fork, create, merge, delete, label, settings, notifications) change real
GitHub state and need auth — they are listed in `MUTATING_RECIPES` and are NOT
executed. Run those by hand or add a `mode: "plan"` dry-run check.

This is the integration tier. The fixture-based `tests/unit/*.test.ts` jest
suite remains the fast, deterministic, network-free tier — keep both.

## Running

```bash
npm run test:github                 # all read-only recipes
node tests/integration/github-recipes.mjs repo-view   # one by slug
OFFSET=0 LIMIT=7 node tests/integration/github-recipes.mjs   # batch slice
```

`OFFSET`/`LIMIT` exist because each live recipe is ~8s through the full stack;
batches of ~7 keep a run under a 3-minute automation/bridge time cap.

## Prerequisite: the extension must be loaded

These tests require `extensionConnected: true`
(`curl -s localhost:3333/status`). On **Chrome stable 137+**, `--load-extension`
is silently ignored, so the extension never loads. Launch the test surface with
**Chrome for Testing** via `SOMA/tools/chrome-test-launcher.sh` (it auto-detects
the Chrome-for-Testing bundle and uses `--disable-extensions-except` +
`--load-extension`, launched through `open -na` so it persists).
