---
type: feedback
project: yeshie
created: 2026-04-15
tags: [relay, debugging, preflight]
---

# Relay Preflight Check

Before running any Yeshie payload or HEAL script that calls the relay, verify `http://localhost:3333/tabs/list` returns 200. If not, the relay is down and scripts will silently fail. Always check relay status first and surface the error to the user rather than letting scripts time out.
