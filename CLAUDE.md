# Yeshie — Working Memory

Chrome extension + local relay server: Claude sends payload JSON → extension executes autonomously across page navigations → returns ChainResult.

## References

| Resource | Path |
|----------|------|
| Action items | `~/Projects/yeshie/ACTION_ITEMS.md` |
| Auto-memory | `~/Projects/yeshie/memory/` (mike.md, patterns.md, projects.md) |
| Project skills | `~/Projects/yeshie/.claude/skills/` |
| Global skills | `~/.claude/skills/` |
| Docs (silicon) | `~/Projects/yeshie/docs/silicon/` — start here for orientation |
| Docs (carbon) | `~/Projects/yeshie/docs/carbon/` — narrative context |
| Site payloads | `~/Projects/yeshie/sites/` |
| Full spec | `~/Projects/yeshie/SPECIFICATION.md` |

## Key Patterns

| Pattern | Rule |
|---------|------|
| MCP timeout | ~60s hard cap — use `nohup bash runner.sh &` fire-and-forget for long tasks |
| Claude CLI flags | `--output-format stream-json` requires `--verbose` with `-p`; omit `--input-format` for plain prompt strings |
| Outer loop | Edits to `background.ts` / `target-resolver.ts`. Inner loop = model JSON only. |
| Health check | `curl -s http://localhost:3333/status` — expect `{"ok":true,"extensionConnected":true}` |
| Chrome debug | `chrome-debug-restart` — **preferred for surveys**: kills Chrome, relaunches with main Default profile + port 9222. No login needed — YeshID session carries over. `chrome-debug` — separate ChromeDebug profile alongside existing Chrome (needs one-time login). |

## Chrome DevTools (for site surveys)

The `chrome-devtools-mcp` connects to Chrome on **port 9222**. Normal Chrome does not expose this port.

**Preferred workflow (no login prompt):**
```bash
chrome-debug-restart  # kills Chrome, relaunches with ~/Library/.../Google/Chrome Default profile
                      # your mw@mike-wolf.com YeshID session is already active
                      # Chrome will offer to restore previous tabs on next normal launch
```

**Alternative (keep normal Chrome open, needs one-time login):**
```bash
chrome-debug          # starts separate ChromeDebug profile on port 9222
                      # ~/Library/.../Google/ChromeDebug/Default — requires manual sign-in once
```

**Profile for both aliases:** `~/Library/Application Support/Google/ChromeDebug` / `Default`
— `ChromeDebug/Default` is a **symlink** to the main Chrome `Default` profile, so all sessions
(`mw@mike-wolf.com`, YeshID, etc.) are already active. The main Chrome user data dir does NOT
expose the debug port; only ChromeDebug does. Do not change the user-data-dir to the main Chrome dir.

**Session check:** `curl -s http://localhost:9222/json/version | python3 -m json.tool`

**Auth state check (app.yeshid.com):** Navigate to `https://app.yeshid.com/` — if redirected to `/login`, session expired. Use `chrome-debug-restart` to get a fresh session.
