# recall.ai Yeshie Recipe Set

Browser-automation design for Recall.ai API key management, built 2026-07-09 for the estate's
API-key-rotation capability (`~/Projects/key-rotation/`).

**Status: design-only, not live-verified — and one live probe caused a real incident. Read this
before touching this site again.**

## The region gotcha (read this first)

Recall.ai dashboards are **region-specific subdomains**: `us-east-1.recall.ai`,
`us-west-2.recall.ai`, `eu-central-1.recall.ai`, `ap-northeast-1.recall.ai`. **This account's
region is `us-west-2`** — confirmed in two places already in the estate:
- `~/Projects/soma-zoom-presence/spike-recall/launch-bot.js`: `RECALL_REGION = process.env.RECALL_REGION || 'us-west-2'`
- `~/Projects/soma-zoom-presence/spike-recall/RUNBOOK.md` §7: "Region is `us-west-2` for this
  account. `us-east-1` and `ap-northeast-1` return 401 (wrong region, not auth failure — same
  key); `eu-west-1` didn't even resolve (network timeout)."

**Always use `https://us-west-2.recall.ai/dashboard/developers/api-keys`.**

## Incident (2026-07-09)

A discovery probe (read-only `open_tab` + `wait_for` + `read`, no clicks) navigated to the
**wrong** region, `us-east-1.recall.ai/dashboard/developers/api-keys`, guessing it was the
default. That domain isn't authenticated for this account at all (different region = different
session), so it landed on a plain Django login form. Mike had to manually complete a login to
unblock the session. This should not have happened — the region should have been looked up first
(it's documented in-repo, see above) rather than guessed, and a live provider-dashboard probe
should not be attempted at all without first confirming a session is expected to already be
authenticated there.

**Standing rule going forward:** treat "a pre-authenticated dashboard session exists" as a
precondition of any recipe here, not something to discover by trial navigation. If a session
genuinely isn't authenticated, stop and report — do not force an interactive login, especially
while a live OLLI class is running on `RECALL_API_KEY`.

## What's confirmed vs. guessed

**Confirmed:**
- Region = `us-west-2` (see above).
- No REST API for key management exists (`~/Projects/key-rotation/providers/RECALL.md`,
  `docs.recall.ai/reference/authentication`): "API keys don't expire and must be explicitly
  disabled if you want to rotate an API key" — dashboard-only, disable-old + create-new, no
  in-place regenerate.
- The (wrong-region) login form's real DOM: `input#id_username` (placeholder "Email"),
  `input#id_password` (placeholder "Password"), a submit `<input>`, and a "Choose a different
  region" link to `https://recall.ai/login`.

**Guessed, unverified** — the entire `01-create-api-key.payload.json` chain past the `open_tab`
step. No authenticated keys-page DOM for this account has ever been observed by a recipe.

## Next step for whoever runs this live

1. Confirm with Mike that `us-west-2.recall.ai` is already an authenticated session in the
   `ChromeMain` debug Chrome (it should be, post-incident — he just logged in there).
2. Run `01-create-api-key` watched live; expect every selector past s3 to need healing.
3. Update this README and the payload's `selectorNotes` with what's actually there before trusting
   it unattended.

## Known RSI Gaps

- No `list-api-keys` recipe exists for this domain yet.
- Delete/disable-old-key flow (the second half of a Recall rotation) is undesigned.
- Whether the create form supports naming a key at all is unconfirmed — Recall's public docs don't
  show this field; `key_name` in the payload is speculative.
