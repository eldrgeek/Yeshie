import { defineConfig } from 'wxt';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Two flavors come out of this one source tree (store/README.md):
//
//   personal  `wxt build` (what com.yeshie.watcher runs). Version 0.1.<build>,
//             reads packages/extension/.env (relay URL, SOMA admin token),
//             polls the watcher on :27182 and reloads itself on a new build.
//   store     `npm run zip:store` (`wxt zip --mode store`). Version from
//             package.json, written to .output/chrome-mv3-store. Ignores .env,
//             talks only to the relay on this computer, has no admin token and
//             no hot reload. This is the zip that goes to the Chrome Web Store.
//
// Build number → manifest version 0.1.<n> for the personal flavor. The watcher
// (packages/watch-and-build.mjs, launchd com.yeshie.watcher) passes
// YESHIE_BUILD_NUMBER for the build it is running; otherwise the gitignored
// .build-count holds the last finished build. Until 2026-10-21 the watcher
// rewrote a literal version here on every build, so this tracked file was
// always modified in the main checkout.
function buildNumber(): number {
  const fromEnv = parseInt(process.env.YESHIE_BUILD_NUMBER || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  try {
    return parseInt(readFileSync(resolve(here, '.build-count'), 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function packageVersion(): string {
  return JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')).version;
}

// Sites where the personal build hands Mike's SOMA admin token to the
// soma-feedback widget (window.__somaAdminToken). Until 2026-11-17 the token
// went into every page Mike opened, where any site's scripts could read it.
// Override with a comma-separated WXT_SOMA_ADMIN_MATCHES in .env.
const DEFAULT_SOMA_ADMIN_MATCHES = [
  'https://mike-wolf.com/*',
  'https://*.mike-wolf.com/*',
  'https://vpsmikewolf.duckdns.org/*',
  'https://ai-wtf.org/*',
  'https://*.ai-wtf.org/*',
  'https://embeddedsystemsresearch.org/*',
  'https://siliconchildren.com/*',
  'https://siliconchildren.org/*',
  'https://somastudios.ai/*',
  'https://*.somastudios.ai/*',
  'https://joke-technology-systems.netlify.app/*',
  'https://llms4elders.netlify.app/*',
  'https://llms4leaders.netlify.app/*',
  'https://minds-aligned.netlify.app/*',
  'https://shit-claude-says.netlify.app/*',
];

// .env values as the personal build sees them (Vite loads .env, .env.local,
// .env.<mode> and .env.<mode>.local; process.env wins).
function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  let found: string | undefined;
  for (const name of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(resolve(here, name), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && m[1] === key) found = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* file absent */ }
  }
  return found;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  manifest: ({ mode }) => {
    const store = mode === 'store';
    return {
      name: 'Yeshie',
      // The store refuses a description over 132 characters.
      description: 'Lets the AI assistant on your own computer work web pages in Chrome for you, step by step, while you watch.',
      version: store ? packageVersion() : `0.1.${buildNumber()}`,
      homepage_url: 'https://github.com/eldrgeek/Yeshie',
      // identity + identity.email: the signed-in account email, so the relay can
      // tell Chrome profiles apart (docs/design/multi-connection-relay.md).
      // `tabs` and `activeTab` were dropped 2026-11-17: <all_urls> already gives
      // tab URLs and titles, and the store asks for the fewest permissions.
      permissions: ['scripting', 'debugger', 'storage', 'alarms', 'sidePanel', 'identity', 'identity.email'],
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
            mac: 'MacCtrl+Shift+R',
            default: 'Ctrl+Shift+Y',
          },
          description: 'Start or stop recording what you do (Do-It-Once)',
        },
      },
    };
  },
  hooks: {
    // The store flavor drops the SOMA admin bridge entirely; the personal one
    // runs it only on the SOMA sites above.
    'entrypoints:resolved': (wxt, entrypoints) => {
      const i = entrypoints.findIndex((e) => e.name === 'soma-admin');
      if (i < 0) return;
      if (wxt.config.mode === 'store') {
        entrypoints.splice(i, 1);
        return;
      }
      const fromEnv = (envValue('WXT_SOMA_ADMIN_MATCHES') || '').split(',').map((s) => s.trim()).filter(Boolean);
      (entrypoints[i] as any).options.matches = fromEnv.length ? fromEnv : DEFAULT_SOMA_ADMIN_MATCHES;
    },
    // Refuse to finish a store build that carries anything personal.
    'build:done': (wxt) => {
      if (wxt.config.mode !== 'store') return;
      const token = envValue('WXT_SOMA_ADMIN_TOKEN');
      const secrets = token && token.length >= 16 ? [token] : [];
      const banned = ['__somaAdminToken', 'soma-admin', ':27182', ...secrets];
      for (const file of listFiles(wxt.config.outDir)) {
        const text = readFileSync(file, 'latin1');
        for (const needle of banned) {
          if (text.includes(needle)) {
            throw new Error(`Store build refused: ${file} contains ${needle === secrets[0] ? 'the SOMA admin token' : JSON.stringify(needle)}`);
          }
        }
      }
    },
  },
});
