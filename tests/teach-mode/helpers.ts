import { chromium, Browser, BrowserContext, Page } from '@playwright/test';

const CDP_URL = process.env.CHROME_CDP_URL || 'http://localhost:9222';
const RELAY = 'http://localhost:3333';

export async function connectToChrome(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  return { browser, context };
}

export async function findYeshIDPage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('app.yeshid.com'));
  if (!page) throw new Error('No YeshID tab found — open app.yeshid.com in Chrome first');
  return page;
}

export async function getTabId(page: Page): Promise<number> {
  // Use /tabs/list which asks the extension for real Chrome numeric tab IDs.
  // The CDP /json endpoint returns UUID target IDs, not Chrome tab IDs.
  const response = await fetch(`${RELAY}/tabs/list`);
  if (!response.ok) throw new Error(`/tabs/list failed: ${response.status}`);
  const tabs: Array<{ tabId: number; url: string; title: string }> = await response.json();
  const pageHost = new URL(page.url()).hostname;
  const tab = tabs.find(t => {
    try { return new URL(t.url).hostname === pageHost; } catch { return false; }
  });
  if (!tab) throw new Error(`Could not find relay tab for ${page.url()} — open tabs: ${JSON.stringify(tabs.map(t => t.url))}`);
  return tab.tabId;
}

/**
 * Inject a message via relay and wait for a yeshie_response logged after the inject time.
 *
 * NOTE: /chat/inject returns { ok: true } — no chatId is issued by the relay.
 * We record a timestamp before injecting, then poll /chat/logs?limit=100 (which returns
 * entries sorted newest-first) and filter client-side by ts > since.
 *
 * If teach mode starts without generating a text response (it may just show the tooltip),
 * this returns '' after 15s rather than throwing, so the caller can still wait for the
 * #yeshie-teach-tooltip element directly.
 */
export async function triggerTeachMode(message: string, tabId: number): Promise<string> {
  const since = Date.now();
  const injectRes = await fetch(`${RELAY}/chat/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tabId, message }),
  });
  if (!injectRes.ok) throw new Error(`inject failed: ${injectRes.status} ${await injectRes.text()}`);

  // Poll for a yeshie_response logged after the inject time.
  // /chat/logs does not support a `since` query param — filter client-side.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    let logsRes: Response;
    try {
      logsRes = await fetch(`${RELAY}/chat/logs?limit=100`);
    } catch {
      continue;
    }
    if (!logsRes.ok) continue;
    const body = await logsRes.json();
    const logs: any[] = body.logs ?? [];
    const resp = logs.find(e => e.event === 'yeshie_response' && (e.ts ?? 0) > since);
    if (resp) {
      const raw = resp.response;
      if (typeof raw === 'string') return raw;
      if (raw?.text) return raw.text;
      if (raw?.content) return raw.content;
      return JSON.stringify(raw);
    }
  }
  // Teach mode may start without a text response — return empty string so callers can
  // fall through to waiting for the tooltip element directly.
  return '';
}

/** Assert #yeshie-teach-tooltip is present and fully within the viewport */
export async function assertTooltipInViewport(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const el = document.getElementById('yeshie-teach-tooltip') as HTMLElement;
    if (!el) return { found: false } as any;
    const r = el.getBoundingClientRect();
    return {
      found: true,
      top: r.top, left: r.left, bottom: r.bottom, right: r.right,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  if (!result.found) throw new Error('Tooltip (#yeshie-teach-tooltip) not found in DOM');
  if (result.top < 0) throw new Error(`Tooltip top (${result.top}) is above viewport`);
  if (result.left < 0) throw new Error(`Tooltip left (${result.left}) is off left edge`);
  if (result.bottom > result.vh) throw new Error(`Tooltip bottom (${result.bottom}) exceeds viewport height (${result.vh})`);
  if (result.right > result.vw) throw new Error(`Tooltip right (${result.right}) exceeds viewport width (${result.vw})`);
}

/** Assert #yeshie-teach-tooltip instruction text contains the expected substring (case-insensitive) */
export async function assertTooltipText(page: Page, expected: string): Promise<void> {
  const text = await page.evaluate(() =>
    document.getElementById('yeshie-teach-tooltip')?.querySelector('.instruction')?.textContent || ''
  );
  if (!text.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`Tooltip text "${text}" does not contain "${expected}"`);
  }
}

/** Poll until tooltip instruction text includes the given fragment */
export async function waitForTooltipStep(page: Page, textFragment: string, timeout = 8000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() =>
      document.getElementById('yeshie-teach-tooltip')?.textContent || ''
    );
    if (text.toLowerCase().includes(textFragment.toLowerCase())) return;
    await new Promise(r => setTimeout(r, 300));
  }
  const current = await page.evaluate(() =>
    document.getElementById('yeshie-teach-tooltip')?.textContent || '(not found)'
  );
  throw new Error(`Tooltip never showed "${textFragment}". Current: "${current}"`);
}

export async function deleteTestUser(page: Page, email: string): Promise<void> {
  await page.goto('https://app.yeshid.com/people');
  await page.waitForSelector(
    '[data-testid="people-search"], input[placeholder*="Search" i], input[type="search"]',
    { timeout: 5000 }
  );
  const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
  await searchInput.fill(email);
  await page.waitForTimeout(1000);
  // Click on the user row
  const userRow = page.locator(`tr:has-text("${email}"), [data-email="${email}"]`).first();
  await userRow.click();
  // Find delete/remove button
  await page.waitForSelector('button:has-text("Delete"), button:has-text("Remove")', { timeout: 5000 });
  await page.click('button:has-text("Delete"), button:has-text("Remove")');
  // Confirm dialog if present
  await page.waitForSelector(
    'button:has-text("Confirm"), button:has-text("Yes")',
    { timeout: 3000 }
  ).catch(() => {});
  await page.click('button:has-text("Confirm"), button:has-text("Yes")').catch(() => {});
}
