# Yeshie — What It Is and How It Works
*A plain-English explanation for non-engineers*

---

## The Problem It Solves

Imagine you manage a team and every time someone joins or leaves, you have to log into your company's HR system (called YeshID), click through several menus, fill in a form, and confirm the change. It takes five minutes each time, it's repetitive, and it's exactly the kind of thing that should just happen automatically.

Traditional "automation" tools can do this, but they're fragile. They work like a robot that memorizes exactly which pixel to click. The moment the website changes its layout — which happens all the time — the robot fails completely.

Yeshie takes a different approach. Instead of memorizing pixel positions, it understands websites the way a person does: by reading the labels, recognizing the structure, and figuring out what to do even when things have moved around slightly.

---

## The Three Moving Parts

### 1. The Chrome Extension — Claude's Hands

The Chrome extension sits invisibly inside Google Chrome. When Claude (the AI) wants to do something on a website, the extension is what actually does the clicking and typing. Think of it as a pair of robotic hands that live inside the browser.

The extension is more sophisticated than a simple clicker. It can:
- Navigate between pages without losing its place
- Read what's currently on the screen to decide what to do next
- Handle websites that use modern JavaScript frameworks (which traditional automation tools struggle with)
- Wait for content to load before acting on it

### 2. The Relay Server — The Messenger

Claude and the Chrome extension can't talk to each other directly — they live in different systems. The relay server is a tiny program that runs locally on your computer (on port 3333) and acts as a translator and message-passer between them.

When Claude says "add a user named John Smith," the relay receives that message and passes it through a WebSocket connection to the extension. When the extension finishes, it sends the result back through the relay to Claude.

### 3. Task Files and Site Knowledge — The Playbook

The third part is a collection of files that describe how to do things:

**Task files (called "payloads")** are like structured to-do lists. For example, the "add user" task says:
1. Go to the People list page
2. Find the "Onboard" button and click it
3. Fill in the First Name field with the provided name
4. Fill in the Last Name field
5. Fill in the Email field
6. Click Confirm
7. Watch for the "Workflow created" confirmation message

**Site knowledge files (called "models")** are accumulated notes about how a website works — which elements to look for, what they're called, how the pages connect. These start mostly empty and fill in automatically over time as tasks are completed.

---

## A Concrete Example

**The task:** "Change John Smith's email address in YeshID."

Here's what happens, step by step:

1. Claude receives the request and looks up the task file for "modify user."

2. Claude calls the `yeshie_run` tool, passing in the task and the specific details (user name, new email).

3. The relay server receives this and forwards it to the Chrome extension.

4. The extension takes over:
   - It navigates to `app.yeshid.com/organization/people`
   - It finds the search box (it knows to look for a text input with the placeholder "Search")
   - It types "John Smith"
   - It clicks on John's name in the list that appears
   - It clicks the "Edit" button on his profile
   - It finds the email field (it knows this from previous runs, or searches by label "personal email" if it doesn't)
   - It clears the old email and types the new one
   - It clicks "Confirm"
   - It watches for the success notification

5. The extension reports back: "Done. 14 steps completed in 8.4 seconds."

6. Yeshie records which exact approach worked for finding each element, so the next run is faster.

---

## The Learning System

This is where Yeshie gets interesting. It has three levels of knowledge, each more specific than the last:

**Level 1 — General web knowledge**
Things that are true on any website: buttons say things like "Submit" or "Save," navigation usually lives in a sidebar or top bar, search boxes accept text, tables have rows you can click. This knowledge never changes.

**Level 2 — Framework knowledge**
Many websites are built using the same underlying technology. YeshID is built with a toolkit called "Vuetify." Yeshie knows Vuetify's patterns: how it labels form fields (differently from most websites), how its dialogs open and close, how its dropdowns work. This knowledge applies to any Vuetify website, not just YeshID.

**Level 3 — Site-specific knowledge**
The stuff unique to this particular website. In YeshID, "deleting a user" is called "offboarding" and it's hidden inside a "Manage" dropdown — not where you'd naturally look. The people list is under "Organization" in the sidebar. The save button says "Confirm," not "Save." Yeshie learns all of this by running tasks and recording what works.

The diagram below shows these three levels:

```
┌────────────────────────────────────────────────────────┐
│  Level 1: General Web Knowledge                        │
│  (any website: buttons, forms, links, tables...)       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Level 2: Vuetify Framework Knowledge            │  │
│  │  (any Vuetify app: labels, dialogs, dropdowns)   │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  Level 3: YeshID Site Knowledge            │  │  │
│  │  │  (this specific app: offboard = delete,    │  │  │
│  │  │   People list under Organization, etc.)    │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## How It Gets Smarter Over Time

The first time Yeshie runs the "add user" task, it has to figure out where the name field is, where the email field is, and so on. This might take 8 seconds. It records what it found.

The second time, it tries the approach that worked before. If that still works (it usually does), it gains confidence. After five successful runs, it's confident enough to skip the search phase entirely and go straight to the known approach — taking about 2 seconds instead of 8.

If a website changes (say, the button label changes from "Save" to "Confirm"), Yeshie notices that the old approach no longer works, falls back to a broader search, finds the new label, and updates its records. Next run, it knows.

This is the opposite of traditional automation: instead of breaking silently when something changes, Yeshie recovers and learns.

---

## Current Status (as of April 2026)

Yeshie currently works with one website: **YeshID** (an identity management/HR system). Four tasks are fully working:

| Task | What it does | Time |
|------|-------------|------|
| Add user | Creates a new person in YeshID | ~8 sec |
| Delete user | Offboards (removes) a person | ~8 sec |
| Modify user | Changes a person's name or email | ~8 sec |
| Explore site | Maps all pages, buttons, and forms | ~30 sec |

A fifth task (connecting third-party services via SCIM integration) is written but not yet tested.

**The goal:** eventually, point Yeshie at any website, run an exploration task, and Claude can figure out how to automate tasks on it — without anyone writing code.

---

## What Makes This Different

Most automation tools require a technical person to write scripts: "click the button with ID `submit-btn-v2`" or "find the element at position (412, 308) on the screen." These scripts break when the website updates.

Yeshie reasons about websites the way a person does: "find the button labeled 'Confirm' near the bottom of the form." This is much more durable. Labels change less often than button IDs or screen positions.

And when something does change, Yeshie doesn't just fail — it tries alternate approaches, finds what works, and remembers it for next time.

The long-term vision is an AI that can look at any website it's never seen before, figure out what it can do there, and automate those tasks without any human writing instructions. Yeshie is the early working prototype of that vision.
