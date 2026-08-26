---
audience: carbon
document: overview
sync_version: 2
last_updated: 2026-08-26
repo: yeshie
---

# What Is Yeshie?

Yeshie lets Claude browse the web the way a person does — clicking buttons, filling forms, navigating between pages — without writing fragile automation scripts that break every time a website updates.

You give Claude a task ("add this user to YeshID"), and Yeshie handles everything: finding the right buttons by reading their labels, navigating across pages while keeping track of where it is, filling in form fields in a way the browser actually registers, and reporting back what happened.

**Yeshie is the only web-automation path.** The live runtime is a Chrome MV3 extension plus a local relay at `http://127.0.0.1:3333`, driven by recipe files at `sites/<domain>/tasks/*.payload.json`. `PLAN.md` describes an earlier CDP/Puppeteer executor and a Claude-in-Chrome revision; both are historical and superseded. Do not add Playwright, Computer Use, or a second browser stack. Claude-in-Chrome (CIC) is for discovering a flow or selector — never for running the task.

If you're new here, start with this document, then read [architecture](./architecture.md) to understand how the pieces fit together.

---

## The Three Moving Parts

**1. The Chrome Extension** is Claude's hands inside the browser. It runs as a background service worker in Chrome — unlike older browser extensions, this means it stays alive across page navigations. When Claude wants to click something or type something, the extension does the actual work in a real browser tab against a real website.

**2. The Relay Server** is the messenger. Claude and the Chrome extension live in different systems and can't talk directly. The relay runs on your local machine (`http://127.0.0.1:3333`) and bridges between them: Claude sends an HTTP request describing what to do, the relay passes it to the extension over a WebSocket, the extension does the work, and the result travels back the same way.

Health check: `GET /status` should return `extensionConnected: true`. Run a recipe with `POST /run` (or the MCP tool `yeshie_run`). Jobs that outlast the ~60s MCP cap use `POST /run/async` and poll `GET /run/result/:id`.

**3. Task Payloads and Site Models** are the playbook and the memory. A payload (recipe) is a structured list of steps: "navigate to this URL, find the button labeled 'Onboard', click it, fill in the first name field..." Site models are accumulated notes about how a website works — which elements to look for, what they're called, how pages connect. These start mostly empty and fill in automatically as tasks run successfully.

Action types include `extract_text` (read text from a selector into a buffer). Prefer `wait_for` over fixed `delay` steps.

---

## Runtime Policy (Yeshie-first)

1. Look for a recipe at `sites/<domain>/tasks/*.payload.json`. If one exists, run it through the relay.
2. If a recipe is stale, fix the recipe and re-verify through the relay. Do not finish the flow by hand in CIC.
3. If no recipe exists, CIC may be used only to figure out the flow and selectors — then capture that as a recipe so the next run is relay-native.

---

## What It's Working On Right Now

There are **35 site directories and ~220 recipes** (`sites/<domain>/tasks/*.payload.json`). `github.com` is the largest set (100 recipes). `google-admin` and `okta` already have payloads; they are not empty starter dirs. This git branch may lag the operator laptop (Rocket Money is live-verified there and is not in this branch yet).

YeshID was the original proof of concept. Four of those tasks still work end-to-end:

| Task | What it does | Time |
|------|-------------|------|
| Add user | Creates a new person in YeshID | ~8 seconds |
| Delete user | Offboards (removes) a person | ~8 seconds |
| Modify user | Changes a person's name or email | ~8 seconds |
| Explore site | Maps all pages, buttons, and forms | ~30 seconds |

A fifth YeshID task (SCIM integration setup) is written but hasn't been run against a real target yet.

The test suite is solid: 176 unit tests passing across 15 test suites.

---

## The North Star

The long-term goal is: point Yeshie at any website, run an exploration task, and Claude can figure out how to automate tasks on it without anyone writing code. The architecture is deliberately designed to support this — the knowledge system is layered so that understanding one Vuetify app immediately gives you a head start on any other Vuetify app, and so on. YeshID was the first working proof of the concept; the recipe corpus is now the multi-site runtime.

---

## How to Navigate This Documentation

- **[architecture.md](./architecture.md)** — how the components connect and why they're built the way they are
- **[quickstart.md](./quickstart.md)** — how to get everything running
- **[reference.md](./reference.md)** — all the APIs, action types, file formats
- **[state.md](./state.md)** — what's working, what's pending, what's blocked
- **[decisions.md](./decisions.md)** — the "why" behind the most non-obvious choices

The LLM-optimized versions of all these documents live in [../silicon/](../silicon/) — same facts, denser format. `CLAUDE.md` at the repo root is the working-memory front door and should agree with `silicon/overview.md` and `silicon/reference.md` on the runtime facts above.
