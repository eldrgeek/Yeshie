You are working on the Yeshie project at ~/Projects/yeshie. Implement Bead 6a: Relay Chat Endpoints.

Read ~/Projects/yeshie/BEADS-SIDEPANEL.md for the FULL bead specification — find "## Bead 6a" and follow it exactly.

Quick summary:
1. Read packages/relay/index.js to understand existing code
2. Add endpoints: GET /chat/listen, POST /chat, POST /chat/respond, POST /chat/suggest, GET /chat/status
3. These implement a long-poll "Claude Listener" pattern (see spec for full details)
4. Create tests (8 tests) — spin up test relay on random port
5. Run tests — all must pass
6. Verify existing tests: npm test (85+)
7. git add and commit: "Bead 6a PASS: relay chat endpoints — listener pattern + {N} tests"

The project uses "type": "module". Relay is Express + Socket.IO. Read index.js carefully first.
