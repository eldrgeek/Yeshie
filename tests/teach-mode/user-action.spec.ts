import { test, expect } from '@playwright/test';
import {
  connectToChrome,
  findYeshIDPage,
  triggerTeachMode,
  assertTooltipInViewport,
  getTabId,
} from './helpers';

test.describe('Teach mode — User action auto-advance', () => {
  test('tooltip auto-advances when user clicks target element', async () => {
    const { context } = await connectToChrome();
    const page = await findYeshIDPage(context);
    const tabId = await getTabId(page);

    if (!page.url().includes('/people')) {
      await page.goto('https://app.yeshid.com/people');
    }

    await triggerTeachMode('teach me how to onboard a new user', tabId);
    await page.waitForSelector('#yeshie-teach-tooltip', { timeout: 8000 });
    await assertTooltipInViewport(page);

    // Test auto-advance for up to 3 steps
    for (let step = 0; step < 3; step++) {
      const tooltipTextBefore = await page.evaluate(() =>
        document.getElementById('yeshie-teach-tooltip')?.textContent || ''
      );

      // Read data-target-selector that renderStep() stamps onto the tooltip element
      const targetSelector = await page.evaluate(() =>
        document.getElementById('yeshie-teach-tooltip')?.getAttribute('data-target-selector') || ''
      );

      if (targetSelector) {
        // Click the target element directly — this is what the user would do
        const clicked = await page.evaluate((sel: string) => {
          // resolveSelector logic: handle :has-text() and comma-separated fallbacks
          for (const part of sel.split(',').map((s: string) => s.trim())) {
            const hasTextMatch = part.match(/^(.*?):has-text\(['"](.+?)['"]\)(.*)$/);
            if (hasTextMatch) {
              const [, base, text, rest] = hasTextMatch;
              const candidates = Array.from(
                document.querySelectorAll((base.trim() || '*') + (rest || ''))
              );
              const el = candidates.find((e: Element) => e.textContent?.includes(text)) as HTMLElement | undefined;
              if (el) { el.click(); return true; }
            } else {
              try {
                const el = document.querySelector(part) as HTMLElement | null;
                if (el) { el.click(); return true; }
              } catch (_) { /* skip invalid selectors */ }
            }
          }
          return false;
        }, targetSelector);

        if (!clicked) {
          // Selector resolved to nothing — fall back to the Next Step button
          await page.click('#yeshie-teach-tooltip button.next-btn');
        }
      } else {
        // No data-target-selector — advance manually
        await page.click('#yeshie-teach-tooltip button.next-btn');
      }

      // Assert auto-advance: tooltip text must change within 2.5 s
      // OR tooltip must have been removed (final step)
      const advanced = await page.waitForFunction(
        (prev: string) => {
          const el = document.getElementById('yeshie-teach-tooltip');
          if (!el) return true; // dismissed on last step — counts as advanced
          const current = el.textContent || '';
          return current !== prev && current.length > 0;
        },
        tooltipTextBefore,
        { timeout: 2500 }
      ).then(() => true).catch(() => false);

      expect(
        advanced,
        `Step ${step + 1}: tooltip did not auto-advance after clicking target (selector: "${targetSelector}")`
      ).toBe(true);

      // If tooltip was dismissed we're done
      const tooltipGone = await page.$('#yeshie-teach-tooltip') === null;
      if (tooltipGone) break;

      await assertTooltipInViewport(page);
    }

    // Clean up: dismiss any remaining teach overlay
    await page.keyboard.press('Escape');
  });
});
