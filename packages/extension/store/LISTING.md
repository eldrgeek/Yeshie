# Yeshie: Chrome Web Store listing

_Written 2026-11-17 by Claude Opus 5.5 for Mike Wolf, who owns the SoMA Studios publisher account and submits. Every field below is the exact text to paste, in the order the dashboard shows it. Limits and justifications are checked by `tests/unit/store-readiness.test.ts`._

## Package

- File: `packages/extension/.output/yeshie-extension-1.0.0-chrome.zip`, made by `npm run zip:store` in `packages/extension`.
- Version: 1.0.0 (from `packages/extension/package.json`; see `CHANGELOG.md`).

## Store listing tab

**Description** (the dashboard field; the short summary comes from the manifest):

```text
Yeshie carries out web tasks in your own Chrome for an AI assistant or script running on your computer.

You, or your assistant, hand Yeshie a task written as plain steps: open this page, type this, click that, read the result. Yeshie does the steps in your browser, in tabs where you are already signed in, and shows its progress on the page while it works. Tasks keep going across page loads and sign-in screens.

What you can do with it:
• Let an assistant such as Claude run a task in your browser and get the result back.
• Record a task once (⌃⇧R on a Mac, Ctrl+Shift+Y elsewhere) and turn the recording into a reusable guide.
• Follow a guide yourself: Yeshie highlights each button you need, one step at a time, and notices when you have done it.
• Chat with your assistant from Yeshie's side panel about the page you are on.

What you need:
Yeshie works with the Yeshie relay, a small program that runs on your computer. Setup and source code: https://github.com/eldrgeek/Yeshie

Privacy:
Yeshie talks only to the relay on your own computer. It has no server, sends nothing to us or anyone else, and shows no ads. Password fields are never recorded. Full policy: https://github.com/eldrgeek/Yeshie/blob/master/packages/extension/store/PRIVACY.md
```

- **Category:** Productivity → Tools
- **Language:** English
- **Store icon:** `store/assets/icon-128.png`
- **Screenshots (1280×800):** `store/assets/screenshot-1-guide.png`, `store/assets/screenshot-2-record.png` (real UI from the store build on a made-up demo site)
- **Small promo tile (440×280):** `store/assets/promo-small-440x280.png`
- **Official URL:** none
- **Homepage URL:** `https://github.com/eldrgeek/Yeshie`
- **Support URL:** `https://github.com/eldrgeek/Yeshie/issues`
- **Mature content:** No

## Privacy practices tab

**Single purpose description:**

```text
Yeshie carries out web tasks in the user's own Chrome, step by step, for an AI assistant or script that the user runs on their own computer, and reports each step's result back to it.
```

**Permission justifications:**

| Permission | Paste this |
| --- | --- |
| `scripting` | Runs Yeshie's own bundled functions in the page a task targets, to find a button or field and click it, type into it or read it. No code is downloaded. |
| `debugger` | Some sites (Vue and React apps, Google sign-in) ignore synthetic clicks and typing. Yeshie uses Chrome's debugger only to send real key and mouse input to the tab a task is running in, and detaches when the task ends. |
| `storage` | Keeps a random ID for this Chrome profile and the state of a running task or guide, so a task survives page loads and the worker restarting. |
| `alarms` | Wakes the background worker every 30 seconds so it stays connected to the relay on the user's computer while a task or guide waits. |
| `sidePanel` | Yeshie's side panel shows the chat with the user's assistant, the recording state and the guide for the current page. |
| `identity` | Needed for `identity.email`, below. Yeshie does not sign the user in to anything. |
| `identity.email` | Reads the signed-in Chrome account's email so the relay on the user's computer can tell the user's Chrome profiles apart and run each task in the right one. It is sent only to that local relay. |
| Host permission `<all_urls>` | The user's tasks can be on any website, and the user decides which. Yeshie needs to read and act on the page a task targets, show its progress on that page, and record steps on whatever site the user records. |

**Are you using remote code?** No, I am not using remote code.

(Tasks arrive from the local relay as JSON data, for example `{"action":"click","selector":"#save"}`. The extension interprets them with code bundled in the package and never evaluates a string as code.)

**Data usage: what the extension collects.** Tick these:

- **Personally identifiable information** (the Chrome account email, sent only to the relay on the user's computer)
- **Web history** (addresses and titles of open tabs, sent only to the local relay)
- **User activity** (clicks and keystrokes, only while the user records; password fields excluded)
- **Website content** (text a task reads from a page)

Leave the rest unticked: health, financial and payment, authentication information, personal communications, location.

**Certify all three:** I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to my item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/eldrgeek/Yeshie/blob/master/packages/extension/store/PRIVACY.md`

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** **Unlisted** (recommended). Anyone with the link can install it, and it does not show in search. Yeshie does nothing until the relay is running on the user's computer, and the relay is a Node program installed from GitHub. A public listing would reach people who cannot use it yet. Switch to Public once the relay installs in one step.
- **Regions:** All regions

## Test instructions tab (shown only to the reviewer)

```text
Yeshie needs its companion relay running on the same computer. To test:
1. git clone https://github.com/eldrgeek/Yeshie && cd Yeshie/packages/relay && npm ci && node index.js
2. Install the extension. http://localhost:3333/status shows "extensionConnected": true within a few seconds.
3. Open https://example.com in a tab, then run a task from a terminal:
   curl -s localhost:3333/run -H 'content-type: application/json' -d '{"target":{"url":"example.com"},"payload":{"_meta":{"skipAuthCheck":true},"chain":[{"stepId":"s1","action":"read","selector":"h1","store_as":"heading"}]},"params":{}}'
   The reply contains "success": true and "heading": "Example Domain".
4. Click the Yeshie toolbar button to open the side panel. Press Ctrl+Shift+Y (Mac: Control+Shift+R) to start recording: a red REC badge appears on the page; press it again to stop.
No account or sign-in is needed.
```
