# Auto-Memory Index

| File | Type | Summary |
|------|------|---------|
| relay_preflight_check.md | feedback | Check `localhost:3333/tabs/list` returns 200 before running any Yeshie/HEAL payload; relay down = silent failure |
| worktree_merge_required.md | feedback | `start_code_task` uses a worktree; changes never reach master until merged — verify branch and merge after code tasks |
| yeshid_selector_stability.md | reference | YeshID has no data-testid; use aria-label > name > stable class > id > :has-text(); never rely on Vuetify class names |
| esm_module_type.md | feedback | Yeshie has `"type":"module"` — use ESM import/export everywhere; require() causes ERR_REQUIRE_ESM |
| heal_loop_guard.md | project | HEAL detect-loop.sh exits 1 if healed within 15 min; escalate to L3 instead of retrying L1/L2 to prevent heal loops |
