import { watch } from 'fs';
import { exec } from 'child_process';
import { resolve } from 'path';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const srcDir = resolve(process.argv[2] || '.');
const countFile = resolve(srcDir, '.build-count');
const wxtConfig = resolve(srcDir, 'wxt.config.ts');

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

function bumpVersion(n) {
  // Update version in wxt.config.ts: version: '0.1.X' → '0.1.{n}'
  try {
    let cfg = readFileSync(wxtConfig, 'utf8');
    cfg = cfg.replace(/version:\s*'[\d.]+'/, `version: '0.1.${n}'`);
    writeFileSync(wxtConfig, cfg);
  } catch(e) {
    console.error('[watcher] could not bump version:', e.message);
  }
}

function build() {
  if (building) { pending = true; return; }
  building = true;
  const nextBuild = buildCount + 1;
  bumpVersion(nextBuild);
  const t = Date.now();
  exec('npx wxt build', { cwd: srcDir }, (err, stdout, stderr) => {
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
