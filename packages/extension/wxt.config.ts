import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build number → manifest version 0.1.<n>. The watcher (packages/watch-and-build.mjs,
// launchd com.yeshie.watcher) passes YESHIE_BUILD_NUMBER for the build it is
// running; otherwise the gitignored .build-count holds the last finished build.
// Until 2026-10-21 the watcher rewrote a literal version here on every build,
// so this tracked file was always modified in the main checkout.
function buildNumber(): number {
  const fromEnv = parseInt(process.env.YESHIE_BUILD_NUMBER || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return parseInt(readFileSync(resolve(here, '.build-count'), 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  manifest: {
    name: 'Yeshie',
    version: `0.1.${buildNumber()}`,
    // identity + identity.email: the signed-in account email, so the relay can
    // tell Chrome profiles apart (docs/design/multi-connection-relay.md).
    permissions: ['activeTab', 'scripting', 'debugger', 'tabs', 'storage', 'alarms', 'sidePanel', 'identity', 'identity.email'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Yeshie' },
    side_panel: {
      default_path: 'sidepanel/index.html'
    },
    commands: {
      'toggle-recording': {
        suggested_key: {
          // NOTE: 'Ctrl+Alt+R' as default is rejected by Chrome 149+ on macOS
          // ("Invalid value for commands[N].default: Ctrl+Alt+R").
          // Chrome rejects the extension at load time, causing --load-extension to silently fail.
          // Mac-only key is sufficient since Yeshie is macOS-only in production.
          mac: 'MacCtrl+Shift+R',
        },
        description: 'Toggle Do-It-Once recording (⌃⇧R)',
      },
    },
  }
});
