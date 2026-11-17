# Yeshie extension versions

_Started 2026-11-17 by Claude Opus 5.5 for Mike Wolf, who owns the SoMA Studios store account and submits each build._

Two flavors come from this one source tree (see `wxt.config.ts` and `store/README.md`):

- **Personal** (`npm run build`, run by `com.yeshie.watcher`): version `0.1.<build>`, counted by the watcher. Not listed here.
- **Store** (`npm run zip:store`): version is `version` in `package.json`. Bump it in the same change as any edit under `src/`, `public/` or the manifest in `wxt.config.ts`, before making the zip. The store refuses an upload whose number is not higher than the published one. Add a line below for every zip sent to the store.

| Version | Date | Store | What changed |
| --- | --- | --- | --- |
| 1.0.0 | 2026-11-17 | Chrome Web Store: prepared, not yet submitted | First store build. Web pages can no longer start Yeshie runs or read their results (the page `postMessage` bridge is gone, and run, chat, recording and guide messages are accepted only from Yeshie's own side panel). The SOMA admin token is left out of the store build, and the personal build hands it only to SOMA sites instead of every page. Drops the `tabs` and `activeTab` permissions. Adds icons, a 132-character description, a privacy policy and a Windows/Linux recording shortcut (Ctrl+Shift+Y). Store build talks only to the relay on this computer, has no hot reload, and refuses to build if a personal secret would ship. Removes 3,100 lines of dead legacy files. |
