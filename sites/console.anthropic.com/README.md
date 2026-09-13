# console.anthropic.com Yeshie Recipe Set

Browser-automation design for Anthropic Console API key creation, built 2026-07-09 for the
estate's API-key-rotation capability (`~/Projects/key-rotation/`).

**Status: design-only, not live-verified.** A discovery probe on 2026-07-09 (`open_tab` to
`https://console.anthropic.com/settings/keys`, read-only, no clicks) found the yeshie-connected
`ChromeMain` Chrome profile was **not logged into console.anthropic.com** — it redirected to
`/login`. Per Mike's course correction that session, recipes in this set must never try to force
an interactive login (e.g. clicking "Continue with Google" and waiting for Mike to complete a
flow); if the console session isn't already authenticated when a recipe runs, it should stop and
report, not prompt.

## What's confirmed vs. guessed

**Confirmed (2026-07-09):**
- No public API exists for creating or rotating Anthropic Console API keys — this is strictly a
  dashboard (console.anthropic.com/settings/keys) action. See
  `~/Projects/key-rotation/providers/ANTHROPIC.md` for the research trail.
- The logged-out `/login` page's real DOM (buttons: "Continue with Google", "Continue with email",
  "Continue with SSO"; email input `aria-label="Email"`) — not useful for the actual keys-page
  flow, but confirms the relay + `open_tab` pattern works against this domain.

**Guessed, unverified — every selector in `01-create-api-key.payload.json` needs a live,
human-supervised run to confirm:**
- The "Create Key" button's exact label/selector on `/settings/keys`.
- Whether a Workspace picker appears before or alongside the name field (Anthropic Console
  supports multiple Workspaces; this recipe does not model that).
- The dialog wrapper selector and the name-input selector.
- The exact label of the final create/confirm button (deliberately not clicked, and not even
  observed, in this pass).

## Next step for whoever runs this live

1. Have Mike confirm he's already logged into console.anthropic.com in the `ChromeMain` debug
   Chrome (the standing "only debug Chrome ever runs" rule — relaunch only via
   `chrome-debug-launcher.sh` if a fresh session is needed).
2. Run `01-create-api-key` with a throwaway `key_name` (not a real rotation) and watch it live —
   expect selector failures at s4/s5/s6; heal them against the real DOM per the Yeshie "heal,
   don't abandon" policy, and update this README + the payload's `selectorNotes`.
3. Only after that healed/verified pass should this recipe be considered safe to hand to someone
   who isn't watching the screen.

## Known RSI Gaps

- Per-row menu actions (rename/delete an existing key) are entirely undesigned — this set only
  covers "create a new key," the first half of a rotation. Deleting/revoking the old key after
  propagation is a manual dashboard step until a `02-delete-api-key` recipe is written and
  verified the same way.
- No `list-api-keys` recipe exists yet for this domain (unlike `elevenlabs.io`'s `01-list-api-keys`)
  — couldn't be built without an authenticated session this pass.
