# HUD Findings — Gemini

**Status: UNAVAILABLE.**

The `GEMINI_API_KEY` in `~/Projects/CIE/secrets.yaml` is rejected by `generativelanguage.googleapis.com`:

```
HTTP 400 INVALID_ARGUMENT — API_KEY_INVALID — "API key not valid. Please pass a valid API key."
```

Confirmed against both `models/gemini-2.0-flash-exp:generateContent` and `GET /v1beta/models`. The key needs to be rotated/replaced before Gemini can participate in this investigation.

Aggregation in `HUD-INVESTIGATION-RESULTS.md` proceeds with Claude + GPT-4o only.
