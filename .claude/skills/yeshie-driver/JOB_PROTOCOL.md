# Subprocess Job Reporting Protocol

When spawning any subprocess (Code task, Cowork task, or background job), include
this block in the task prompt, replacing JOB_ID and JOB_TITLE:

---

## Status Reporting

Throughout this task, report your progress to the job tracker. This lets the
orchestrator know what you're doing without polling.

**Report command:**
```bash
curl -s -X POST http://localhost:3333/jobs/update \
  -H 'Content-Type: application/json' \
  -d '{"id": "JOB_ID", "title": "JOB_TITLE", "status": "STATUS", "step": "WHAT_YOURE_DOING"}'
```

**When to report:**
- When you start work: `"status": "running", "step": "starting"`
- During long operations: `"status": "running", "step": "editing background.ts"`
- When you finish successfully: `"status": "completed", "result": "brief outcome"`
- When you fail: `"status": "failed", "error": "what went wrong"`
- When you're blocked and need input: `"status": "blocked", "error": "need permission for X"`

**Status values:** `pending`, `running`, `completed`, `failed`, `blocked`

Report at minimum: when you start and when you finish. For tasks over 30 seconds,
report progress at least every 30 seconds.

---

## Generating the prompt snippet

When Dispatch spawns a job, it should:

1. Generate a job ID: `job-{short-description}-{timestamp}`
   e.g., `job-fix-preset-1775943000`

2. Register it: `curl -s -X POST http://localhost:3333/jobs/create -H 'Content-Type: application/json' -d '{"id": "job-fix-preset-1775943000", "title": "Fix click_preset timing"}'`

3. Include the reporting block above in the task prompt (with JOB_ID/JOB_TITLE replaced)

4. On each wake-up, check: `curl -s http://localhost:3333/jobs/status`

## Checking job status

Dispatch should call `GET http://localhost:3333/jobs/status` to see all active jobs.
Response format:
```json
{
  "jobs": [
    {"id": "job-fix-preset-1775943000", "title": "Fix click_preset timing", "status": "running", "step": "editing background.ts", "updatedAt": 1775943100000},
    {"id": "job-test-onboard-1775943200", "title": "Test onboard flow", "status": "completed", "result": "All tests passed", "updatedAt": 1775943250000}
  ],
  "ts": 1775943300000
}
```

- `status: "blocked"` → Surface to user immediately
- `status: "completed"` → Report result if user-originated
- `status: "failed"` → Decide whether to retry or report
- Recently completed jobs (< 60s) are included in the default response
- Jobs auto-expire after 30 minutes of no updates
