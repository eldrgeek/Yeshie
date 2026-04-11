---
name: yeshie-driver
description: >
  Protocol for Opus/Dispatch to drive Haiku through the Yeshie side panel.
  Use this skill whenever you need to perform actions on a web page through Yeshie —
  whether fulfilling a user request or executing steps in an autonomous plan.
  
  Trigger on: any request that involves interacting with a web app through Yeshie,
  running YeshID tasks, onboarding/offboarding users, or any multi-step browser
  automation that should go through the Haiku listener.
---

# Yeshie Driver Protocol

You (Opus at Dispatch) drive Haiku (the Yeshie listener) by injecting messages into the
side panel chat. Haiku executes payloads, interacts with the page, and reports back.
You read responses programmatically — never via screenshot.

## Core Loop

```
1. Formulate a clear, natural-language instruction
2. Inject:  POST http://localhost:3333/chat/inject
            {"tabId": TAB_ID, "message": "YOUR INSTRUCTION (C)"}
3. Await:   GET  http://localhost:3333/chat/await?tabId=TAB_ID&timeout=60
            — blocks until Haiku responds or timeout
4. Read the response JSON:
   - type: "response" → Haiku replied. Check response.response.text
   - type: "timeout"  → Check response.heartbeat:
     - heartbeat exists & recent (< 30s) → Haiku is working, call /chat/await again
     - heartbeat stale or null → Haiku may be stuck, retry or escalate
5. If Haiku asked a question → inject an answer, go to 3
6. If Haiku reported success/failure → step is done
```

## The (C) Marker

Always append ` (C)` to injected messages. This tells Haiku:
- The caller is a machine, not a human
- Send heartbeats during long operations
- Be conversational but efficient — no extra pleasantries

## Two Trigger Modes

### User-originated
The user says something like "onboard Demo User on YeshID."
1. Translate to a clear Haiku instruction (include all params the user gave)
2. Run the core loop
3. If Haiku asks for missing info you can answer:
   - If YOU know the answer (from context, memory, or obvious defaults) → inject the answer
   - If you DON'T know → ask the user via SendUserMessage, wait for their reply, inject it
4. Report the outcome to the user via SendUserMessage

### Self-originated (autonomous plan)
You're working through a multi-step plan (e.g., "test all YeshID payloads").
1. Build the plan as a checklist (use TodoWrite)
2. For each step: formulate the instruction, run the core loop, mark complete
3. If a step fails: decide whether to retry, skip, or abort
4. Report the full outcome when the plan completes

## Finding the Tab

Before injecting, you need the tabId of the target tab. Options:
- `yeshie_run` with `open_tab` action → returns `tabId` in the result
- `yeshie_status` → confirms extension is connected
- If you already have a tabId from a previous step, reuse it

## Translating User Requests

Convert fuzzy user requests into clear Haiku instructions:
- "Onboard someone named Test User" → "Onboard a new user: first name Test, last name User, company email test.user@mike-wolf.com (C)"
- "Search for John in YeshID" → "Search for a person named John (C)"
- "What integrations does YeshID support?" → "What integrations does YeshID support? (C)"

Include all known params inline. If something is missing and you can't infer it,
include what you have — Haiku will ask for the rest.

## Heartbeat Monitoring

During `/chat/await` timeouts, check the heartbeat:
```json
{"type": "timeout", "heartbeat": {"status": "executing", "step": "filling form...", "ts": 1234567890}}
```
- If `heartbeat.ts` is within the last 30 seconds → Haiku is alive, keep waiting
- If `heartbeat` is null or stale → Haiku may be stuck
  - Try one more await with a longer timeout
  - If still stuck, report failure to the user

## Error Handling

- **Haiku asks a question you can't answer**: Escalate to the user
- **Haiku reports failure**: Read the failure reason, decide if retryable
- **Haiku escalates** (`"escalate": true`): The task is beyond Haiku's capability.
  You can try driving it yourself with more specific instructions, or report to user.
- **Relay not responding**: Check `yeshie_status`, consider restarting relay
- **Extension disconnected**: Report to user — they need to reload the extension

## Implementation Notes

- Use `shell_exec` (via cc-bridge) for curl calls — it runs on the host
- The relay runs on localhost:3333
- Response buffer keeps last 50 responses per tab
- Use the `since` param on `/chat/await` to avoid re-reading old responses:
  after getting a response, save its `ts` and pass it as `since` on the next await
