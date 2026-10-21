import { watch } from 'fs';
import { exec } from 'child_process';
import { resolve } from 'path';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const srcDir = resolve(process.argv[2] || '.');
const countFile = resolve(srcDir, '.build-count');

const manifestPath = resolve(srcDir, '.output/chrome-mv3/manifest.json');

// Persist build count across restarts
let buildCount = existsSync(countFile) ? parseInt(readFileSync(countFile, 'utf8')) || 0 : 0;
let building = false;
let pending = false;

// Tiny HTTP server — background worker polls this to detect new builds
// The 'ready' flag is only true when the build is complete AND manifest exists
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ready = !building && existsSync(manifestPath);
  res.end(JSON.stringify({ build: buildCount, ts: Date.now(), ready }));
});
server.listen(27182, () => console.log('[watcher] version server on :27182'));

// The manifest version comes from YESHIE_BUILD_NUMBER (read by wxt.config.ts),
// so the tracked wxt.config.ts is never rewritten. (Until 2026-10-21 a
// bumpVersion() here edited the literal version in place on every build.)
function build() {
  if (building) { pending = true; return; }
  building = true;
  const nextBuild = buildCount + 1;
  const t = Date.now();
  exec('npx wxt build', { cwd: srcDir, env: { ...process.env, YESHIE_BUILD_NUMBER: String(nextBuild) } }, (err, stdout, stderr) => {
    building = false;
    if (err) {
      console.error('[watcher] build failed:', stderr.slice(-300));
    } else {
      buildCount = nextBuild;
      writeFileSync(countFile, String(buildCount));
      console.log(`[watcher] build #${buildCount} (v0.1.${buildCount}) in ${Date.now()-t}ms`);
    }
    if (pending) { pending = false; build(); }
  });
}

watch(srcDir + '/src', { recursive: true }, (event, filename) => {
  if (!filename?.endsWith('.ts')) return;
  console.log('[watcher] change:', filename);
  build();
});

build();
