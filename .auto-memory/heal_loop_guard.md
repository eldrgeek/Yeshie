---
type: project
project: yeshie
created: 2026-04-15
tags: [heal, loop-detection, triage, escalation]
---

# HEAL Loop Guard

The HEAL system has a loop detection guard in `skills/heal/detect-loop.sh`. If a payload was healed within the last 15 minutes, the script exits 1 (loop detected) and the triage should escalate to L3 rather than re-attempting L1/L2. The threshold is intentionally conservative. This guard exists because without it, a broken payload can cycle heal→break→heal→break indefinitely.
