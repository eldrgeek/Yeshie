# MarkinPC Substack Pipeline

Transfers stories from Mark Wolf's emails (epichero@aol.com) to the MarkinPC Substack
as DRAFTS. Mike reviews and publishes from the Substack UI.

**NEVER publish automatically. Drafts only.**

---

## Identity

- **Mark's email**: `epichero@aol.com` (Mike's brother — NOT Mark Lesser, NOT Mark James)
- **Mark's other address**: `wolfinpc@gmail.com` (he forwards from here to epichero, then to Mike)
- **Substack publication**: MarkinPC at `https://markinpc.substack.com`
- **Mike's writer email**: `mw@mike-wolf.com`
- **Stories format**: `.docx` attachments in Gmail emails

---

## CRITICAL: Substack Publication Not Yet Created

As of 2026-05-19, `markinpc.substack.com` returns 404. Mike's account (`@rsilt`) has no
publications. **Mike must create the MarkinPC publication at substack.com before any drafts
can be created.**

Steps for Mike:
1. Go to https://substack.com → Dashboard → "Start a publication"
2. Name: MarkinPC, subdomain: markinpc (or whatever's available)
3. Once created, re-run this skill

---

## Substack Auth Notes (verified 2026-05-19)

- Mike is authenticated at substack.com (account: `@rsilt`, email: `mw@mike-wolf.com`)
- Regular Yeshie actions (navigate, perceive, assess_state, click) work on Substack
- **Do NOT use `/*cdp*/` (JS debugger) on substack.com** — it causes a chrome-extension:// redirect that breaks the chain
- The writer dashboard (`/publish/home`) redirects to public Discover page because no publication exists yet

---

## Story Content Status

### Ready to Draft (content retrieved from Google Drive)

Staged at: `~/Projects/yeshie/sites/substack.com/markinpc-stories/`

| File | Title | Drive Source |
|------|-------|-------------|
| 01-april-fool.txt | April Fool | April Fool - Mark Wolf (Google Doc) |
| 02-great-christmas-gift.txt | Great Christmas Gift | Great Christmas Gift - Mark Wolf.docx |
| 03-creature-of-habit.txt | Creature of Habit | Dad Stories - Mark Wolf.docx |
| 04-infertility.txt | Infertility | Infertility - Mark Wolf (Google Doc) |
| 05-you-dont-remember-me.txt | You Don't Remember Me? | You Don't Remember Me - Mark Wolf |
| 06-drugs-and-me.txt | Drugs and Me | Drugs and Me - Mark Wolf |

### Needs Manual Download (Gmail .docx only — iframe-sandboxed)

See: `~/Projects/yeshie/sites/substack.com/markinpc-stories/NEEDS-MANUAL-DOWNLOAD.md`

Gmail attachment downloads are in sandboxed iframes — Yeshie cannot click the download button.
Mike must manually save these to Google Drive or ~/Downloads/.

| Subject | Gmail Thread | Attachment |
|---------|-------------|------------|
| My first attempt | 19d13b8702593fac | Cattle_Baron_Final.docx |
| Fw: Keeping Honeybees | 19da29a292296bc4 | Keeping Bees.docx |
| Fw: TWINS | 19da29b4a663fcc2 | Twins.docx |
| Fw: koochie | 19da29aadf3309e2 | Koochie.docx |
| Auto mechanic | 19e0d2f8165c97c4 | Im Just Like an Auto Mechanic.docx |

---

## Gmail Thread Registry (all stories)

| Subject | Thread ID | Attachment | Status |
|---------|-----------|------------|--------|
| My first attempt | 19d13b8702593fac | Cattle_Baron_Final.docx | needs_manual_download |
| Fwd: April Fool | 19d82e4f5dd677ba | April_Fool.docx | ready_to_draft |
| Fwd: Xmas gift | 19d82e46ff460bb2 | Great Christmas Gift.docx | ready_to_draft |
| Fw: Keeping Honeybees | 19da29a292296bc4 | Keeping Bees.docx | needs_manual_download |
| Fw: TWINS | 19da29b4a663fcc2 | Twins.docx | needs_manual_download |
| Fw: koochie | 19da29aadf3309e2 | Koochie.docx | needs_manual_download |
| Auto mechanic | 19e0d2f8165c97c4 | Im Just Like an Auto Mechanic.docx | needs_manual_download |

Update Status to "drafted" after creating a Substack draft. Add the draft URL.

---

## Payloads

| Payload | Path |
|---------|------|
| Substack login | `~/Projects/yeshie/sites/substack.com/tasks/01-login.payload.json` |
| Create draft | `~/Projects/yeshie/sites/substack.com/tasks/02-create-draft.payload.json` |
| Gmail download | `~/Projects/yeshie/sites/mail.google.com/tasks/01-download-attachment.payload.json` |
| DOCX extractor | `~/Projects/yeshie/scripts/extract-docx.py` |

---

## Full Workflow

### Step 1 — Check Substack auth

```python
yeshie_run(
    payload_path="~/Projects/yeshie/sites/substack.com/tasks/01-login.payload.json",
    params={
        "email": "mw@mike-wolf.com",
        "publication_url": "https://substack.com/publish/home"
    }
)
```

**Expected outcome A — already authenticated**: payload exits with `exit_success`, URL is
`https://substack.com/publish/home`. Proceed to Step 2.

**Expected outcome B — magic link required**: payload exits after sending magic link email.
**STOP and tell Mike**: "Check mw@mike-wolf.com for a Substack sign-in email and click the link,
then confirm with me when done." Wait for Mike's confirmation before proceeding.

---

### Step 2 — For each story: Download the DOCX

```python
yeshie_run(
    payload_path="~/Projects/yeshie/sites/mail.google.com/tasks/01-download-attachment.payload.json",
    params={
        "message_id": "19d13b8702593fac",   # change per story
        "attachment_filename": "Cattle_Baron_Final.docx"   # change per story
    }
)
```

After download, verify the file landed in `~/Downloads/`:
```bash
ls -lt ~/Downloads/*.docx | head -5
```

---

### Step 3 — Extract text from DOCX

```bash
python3 ~/Projects/yeshie/scripts/extract-docx.py ~/Downloads/Cattle_Baron_Final.docx
```

Capture the output as `story_text`. If the file is not found, check `~/Downloads/` for the
actual filename (Chrome may have renamed it with a counter suffix like `(1)`).

---

### Step 4 — Create Substack draft

```python
yeshie_run(
    payload_path="~/Projects/yeshie/sites/substack.com/tasks/02-create-draft.payload.json",
    params={
        "publication_subdomain": "markinpc",
        "title": "Cattle Baron",           # use the docx title stem, cleaned up
        "body": story_text,               # extracted text from Step 3
        "subtitle": ""
    }
)
```

Capture the draft URL from the ChainResult's `draft_url` field (or from the browser URL bar
after the run). Log it in the table above.

---

### Step 5 — Repeat for remaining stories

Process each story in the registry table. Log draft URLs as you go.

---

## Title Mapping

When constructing the draft title from the attachment filename:
- Strip `.docx` extension
- Replace underscores with spaces  
- Capitalize words
- Example: `Cattle_Baron_Final.docx` → `"Cattle Baron"` (drop "Final")
- Example: `Im Just Like an Auto Mechanic.docx` → `"I'm Just Like an Auto Mechanic"`

---

## Auth Notes

**Substack auth type**: Magic link (email-based). No password option by default.
**Session persistence**: If Chrome has a valid Substack session cookie, the login payload
exits immediately (`exit_success`) without sending a magic link. Sessions typically last
weeks. If expired, Mike must click a magic link that arrives at mw@mike-wolf.com.

**Pre-auth option**: Mike can log into Substack manually in Chrome once, and subsequent
Yeshie runs will reuse the session until it expires.

---

## Substack Editor Notes

The Substack editor uses ProseMirror (`div.ProseMirror[contenteditable='true']`).
Long `type` actions with large bodies may be slow — the extension types character by character.
If body text is very long (>5000 chars), consider using the `/*cdp*/` JavaScript injection
approach instead:

```json
{
  "action": "/*cdp*/",
  "script": "document.querySelector('div.ProseMirror[contenteditable=\"true\"]').focus(); document.execCommand('insertText', false, `{{body}}`);",
  "note": "Faster text insertion for long bodies"
}
```

---

## Finding New Stories

To search for new emails from Mark:
```python
mcp__claude_ai_Gmail__search_threads(
    query="from:epichero@aol.com newer_than:30d",
    pageSize=20
)
```

Add new stories to the registry table above.

---

## Do Not

- Do not publish any draft — drafts only
- Do not modify Mark's original Gmail messages
- Do not mistake Mark Lesser (mark@markmanson.net) or Mark James for this Mark
