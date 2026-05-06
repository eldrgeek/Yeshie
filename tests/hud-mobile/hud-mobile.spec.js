// HUD mobile-rendering test.
// Boots the relay on a free port, loads /hud at iPhone 13 viewport, asserts
// no horizontal scroll + iOS PWA meta tags + manifest/icon endpoints, screenshots.
//
// Run: npx playwright test tests/hud-mobile

import { test, expect, request as pwRequest } from '@playwright/test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const PORT = 3398;
const BASE = `http://127.0.0.1:${PORT}`;
const RELAY_PATH = join(__dirname, '..', '..', 'packages', 'relay', 'index.js');

let proc;

test.beforeAll(async () => {
  proc = spawn(process.execPath, ['-e', `
    process.env.RELAY_TEST_MODE = '1';
    import('${RELAY_PATH}').then(async m => {
      const relay = m.createRelay(${PORT});
      await relay.listen();
      console.log('READY');
    }).catch(e => { console.error(e); process.exit(1); });
  `], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay startup timeout')), 8000);
    proc.stdout.on('data', d => { if (d.toString().includes('READY')) { clearTimeout(timer); resolve(); } });
    proc.stderr.on('data', d => process.stderr.write(d));
  });
});

test.afterAll(async () => {
  if (proc) proc.kill('SIGTERM');
});

// iPhone 13 viewport (390x844) — webkit not installed locally, so emulate via chromium
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

test('HUD renders without horizontal scroll at iPhone viewport', async ({ page }) => {
  await page.goto(`${BASE}/hud`, { waitUntil: 'domcontentloaded' });
  // give the inline JS a tick to apply (or not apply) scale logic
  await page.waitForTimeout(400);

  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const winWidth = await page.evaluate(() => window.innerWidth);
  expect(docWidth).toBeLessThanOrEqual(winWidth + 1);

  // Body should NOT have a transform applied on mobile (the desktop scale trick)
  const transform = await page.evaluate(() => getComputedStyle(document.body).transform);
  expect(transform === 'none' || transform === '').toBeTruthy();

  await page.screenshot({ path: join(SHOTS, 'hud-iphone-viewport.png'), fullPage: true });
});

test('iOS PWA meta tags are present', async ({ page }) => {
  await page.goto(`${BASE}/hud`, { waitUntil: 'domcontentloaded' });
  const meta = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.content,
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
    manifest: document.querySelector('link[rel="manifest"]')?.href,
    appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
  }));
  expect(meta.viewport).toContain('width=device-width');
  expect(meta.capable).toBe('yes');
  expect(meta.statusBar).toBeTruthy();
  expect(meta.title).toBe('Pulse');
  expect(meta.manifest).toContain('/manifest.webmanifest');
  expect(meta.appleIcon).toContain('/apple-touch-icon.png');
});

test('manifest + icon endpoints serve valid bytes', async () => {
  const ctx = await pwRequest.newContext();
  const m = await ctx.get(`${BASE}/manifest.webmanifest`);
  expect(m.status()).toBe(200);
  expect(m.headers()['content-type']).toContain('manifest+json');
  const json = await m.json();
  expect(json.short_name).toBe('Pulse');
  expect(json.display).toBe('standalone');

  const i = await ctx.get(`${BASE}/apple-touch-icon.png`);
  expect(i.status()).toBe(200);
  expect(i.headers()['content-type']).toBe('image/png');
  const buf = await i.body();
  // PNG magic
  expect(buf[0]).toBe(0x89);
  expect(buf.slice(1, 4).toString()).toBe('PNG');
  expect(buf.length).toBeGreaterThan(100);

  const i192 = await ctx.get(`${BASE}/icon-192.png`);
  expect(i192.status()).toBe(200);
  await ctx.dispose();
});
