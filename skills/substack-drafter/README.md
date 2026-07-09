# substack-drafter

Yeshie skill that creates draft posts on Substack from staged markdown story files.

**DRAFTS ONLY — never publishes.** Mike reviews drafts on wolfinpc.substack.com before publishing.

## Quick start

```bash
# 1. Authenticate (one-time setup)
node auth.js login --email YOUR_EMAIL --password YOUR_PASSWORD

# 2. Draft a single story
node index.js --story cattle-baron

# 3. Draft all staged stories at once
node index.js --all
```

## Auth setup

The skill needs Substack credentials for wolfinpc.substack.com. Two options:

**Option A — env vars (temporary):**
```bash
SUBSTACK_EMAIL=you@email.com SUBSTACK_PASSWORD=yourpass node auth.js login
```

**Option B — saved creds file (persistent):**
```bash
mkdir -p ~/.config/substack-drafter
cat > ~/.config/substack-drafter/creds.json << 'EOF'
{"email": "you@email.com", "password": "yourpass"}
EOF
node auth.js login
```

Session is cached to `~/.config/substack-drafter/session.json` and is valid for 7 days.

## Story files

Stories are staged at `~/Projects/SOMA/state/wolfinpc-pending/*.md` with YAML frontmatter:

```yaml
---
gmail_subject: "Fw: TWINS"
suggested_title: "Twins"
substack_status: NOT_PUBLISHED  # → DRAFTED after successful draft creation
substack_draft_url: <filled in after draft>
---
```

After drafting, `substack_status` is updated to `DRAFTED` and `substack_draft_url` is added.
A log entry is also appended to `draft-log.jsonl` in the same directory.

## Files

| File | Purpose |
|------|---------|
| `index.js` | Entry point — orchestrates auth check + draft creation |
| `auth.js` | Login and session management |
| `draft.js` | Calls Substack draft API |
| `schema.json` | Input/output JSON schema |
| `SKILL.md` | Agent instructions (for Claude) |

## Substack API notes

Substack's public API is undocumented. This skill uses:
- `POST /api/v1/login` — password auth
- `POST /api/v1/drafts` — create draft (publication-subdomain hostname)

The API requires session cookie auth (`substack.sid`). No OAuth, no API key.
If the API breaks, check [Substack's unofficial API docs](https://github.com/vaaski/substack) for current endpoints.
