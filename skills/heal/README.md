# HEAL Skill — Self-Healing Payload System

Utilities and prompts for the Yeshie HEAL (self-healing payload) flow.

## Quick Start

1. Start the relay: `cd packages/relay && npm start`
2. Start the HEAL monitor: `node skills/heal/heal-monitor.js`
3. Run payloads normally via Yeshie — failures will auto-trigger HEAL triage

## Files (complete list)
- `backup-payload.sh` — backup before patching
- `detect-loop.sh` — detect infinite heal cycles
- `dry-run.js` — selector verification (no writes)
- `SKILL.md` — HEAL agent triage prompt
- `hermes-schemas.json` — Hermes event channel schemas
- `auth-patterns.json` — auth redirect URL patterns
- `diff-maps.js` — structural diff between two site maps
- `regenerate-step.js` — score-based step regeneration from new map
- `trigger-remap.js` — publish site-map/request and await completion
- `heal-queue.js` — concurrent heal queue (max 10 per payload, 30min TTL)
- `heal-monitor.js` — relay sidecar that watches for failures and triggers HEAL
- `relay-hook.md` — relay modification guide for direct integration

## Flow
See `~/Projects/yeshie/SPECIFICATION-HEAL.md` for the full architecture.
