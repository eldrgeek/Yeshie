# sites/substack.com

These recipes drive Mike's Substack account, `@rsilt`. On 2026-09-15 that account owned
`aiwtf.substack.com` ("AI What the F*ck") and ten other publications. Every change goes
through his signed-in Chrome, because Substack has no public write API and Mike signs in by
emailed link, never by password.

Run the recipes through `scripts/substack.mjs`, not one by one:

```bash
node scripts/substack.mjs login | drafts | about | welcome | invite | draft | byline | publish [flags]
```

The wrapper uses its own Substack tab (remembered in `~/.yeshie/substack-tab.json`) and never
drives one of Mike's tabs. It converts Markdown to HTML, fills the params, and checks each
result in Substack's own JSON. `--dry-run` sends a recipe only up to its `dryRunUntil` step,
the last step before anything is typed, saved, sent or published. The command list and flags
are in the wrapper's header. The skills `substack-publish` and `aiwtf-daily-checkin` in
`~/.claude/skills` call it.

## Recipes

| Recipe | What it does | Its proof | Status (2026-09-15) |
|---|---|---|---|
| `01-login` | Signed in as `@rsilt`? If not, asks for a sign-in link and follows it from Gmail | `"handle":"rsilt"` in `/api/v1/user/profile/self` | Signed-in path green. Sign-in branch written, not yet exercised |
| `02-create-draft` | Title, subtitle, HTML body into a new or existing draft | Title in the drafts list; the wrapper checks the saved body | See the run log |
| `03-edit-about-page` | Replaces the About page | `subscribe_content` in `/api/v1/publication`, then the public `/about` | Dry run green |
| `04-edit-welcome-email` | Replaces the free or paid welcome email | Subject and body in `/api/v1/publication` | Dry run green |
| `05-invite-team-member` | Invites one address to the team | The address listed in Team settings after a reload | Dry run green |
| `06-add-byline` | Adds a person Substack knows to a draft's byline | The name in the draft's `postBylines` | Dry run green |
| `07-publish-no-email` | Publishes a draft to the chosen audience with no email | `is_published` true, `should_send_email` false, `email_sent_at` null, `audience` | Dry run green |

## What Substack does that is easy to get wrong

- **An `assess_state` step with no `expect` always matches.** v1 of `01-login` therefore went
  green whether or not Chrome was signed in, and it accepted any account.
- **`substack.com/publish/post/new` names no publication,** and this account has eleven. Open
  `<subdomain>.substack.com/publish/post/new`.
- **Opening `/post/new` creates an empty draft at once,** and the address stays `/post/new`.
  The new draft's id comes from the drafts list.
- **A draft does not keep an audience chosen in its Settings drawer.** The radio shows the
  choice, but the draft JSON keeps `only_paid`, even after Done and the next autosave. Choose
  the audience in the Publish panel (`07`). New posts on aiwtf default to paid-only.
- **`type` delivers plain text into the editor.** Use `paste_html`. Its replace mode selects
  with Cmd-A and marks the HTML as a closed slice. A plain DOM selection let the first pasted
  paragraph merge into the old first block, so a credit line became a heading.
- **Publishing emails every subscriber by default.** The Publish panel's final button reads
  "Publish now" only when "Send via email and the Substack app" is off.
- **Substack's JSON escapes non-ASCII as `\uXXXX`.** A proof phrase must be plain ASCII and
  sit inside one unformatted run, because bold, italics and links split the text.
- **The About page is not a post.** It is the publication field `subscribe_content`, edited at
  `/publish/settings/edit?title=About%20page&bodyField=subscribe_content`.
- **Welcome emails are publication fields too.** Free subscribers get
  `unfinished_subscription_email_subject` and `unfinished_subscription_email_content`. Paid
  subscribers get `welcome_email_subject` and `welcome_email_content`.
- **The byline "+" has no label.** It is `div:has(> textarea.subtitle) ~ div button:has(svg.lucide-plus)`.
  A first guess, `textarea.subtitle ~ div`, found nothing.
- **Some clicks email a third party.** "Invite" in the byline dialog and "Send invite" on the
  Team page both do. Accepting an invite creates a Substack account, which is a human's step.
- **v1 of `01-login` was `selfImproving`.** After a green run, `improve.js` rewrote it in the
  main checkout (run count, last success). That blocked the next `git pull`. v2 is not
  self-improving.
- **Backdating:** after publishing, the post's Settings offer "Displayed Publication Date",
  which accepts any date back to 1980. There is no recipe for it yet.

## Run log

**2026-09-15** (Claude Opus 5, CCc, for Mike)

- Build 0.1.543: `login` green on the signed-in path.
- Dry runs, all green:
  - `about`, s01–s05;
  - `welcome --kind free`, s01–s06;
  - `invite`, s01–s07 (the dialog opened, nothing typed);
  - `byline`, s01–s08, after s04's selector was fixed.
- Build 0.1.545 (PR #69): `draft` v2.0 on draft 215832370 went 18 of 18 steps green. The wrapper's
  check then found two faults, and PR #70 fixed both:
  - the audience was still `only_paid`;
  - the credit line had been saved as a heading.
- `publish` v1.1 dry run: green through s10, with Everyone chosen in the Publish panel. The first
  attempt was lost to an extension service-worker restart.
- Build 0.1.547 (PR #70): `draft` v2.1 on draft 215832370 went 13 of 13 steps green. The
  saved body was still the old content, though: after only 2.5 s of quiet, the run left the
  editor before Substack's autosave fired. Waiting for 6 s of quiet fixed it. The same run
  exposed a wrapper crash (a leftover `audience` reference). The wrapper now also checks that
  the first saved block keeps its kind.
- Rerun: "Silicon Siblings" saved and checked (title, subtitle, body, first block a paragraph).
