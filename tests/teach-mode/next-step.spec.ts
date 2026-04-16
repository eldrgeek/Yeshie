import { test, expect } from '@playwright/test';
import {
  connectToChrome,
  findYeshIDPage,
  triggerTeachMode,
  assertTooltipInViewport,
  waitForTooltipStep,
  getTabId,
  deleteTestUser,
} from './helpers';

const timestamp = Date.now();
const TEST_EMAIL = `test-${timestamp}@yeshid-test.com`;

test.describe('Teach mode — Next Step flow', () => {
  test('full onboard walkthrough via Next Step button', async () => {
    const { context } = await connectToChrome();
    const page = await findYeshIDPage(context);
    const tabId = await getTabId(page);

    // Navigate to people list to ensure we're in the right place
    if (!page.url().includes('/people')) {
      await page.goto('https://app.yeshid.com/people');
    }

    // Trigger teach mode via relay
    const response = await triggerTeachMode('teach me how to onboard a new user', tabId);
    expect(response.toLowerCase()).toMatch(/here|walk|guide|step/);

    // Step 1: tooltip should appear and mention people
    await page.waitForSelector('#yeshie-teach-tooltip', { timeout: 8000 });
    await assertTooltipInViewport(page);
    await waitForTooltipStep(page, 'people');

    // Click "Next Step" → navigate to People list
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(2000);
    await assertTooltipInViewport(page);

    // Step 2: Onboard person button
    await waitForTooltipStep(page, 'onboard');
    await assertTooltipInViewport(page);
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(2000);

    // Step 3: First name
    await waitForTooltipStep(page, 'first name');
    await assertTooltipInViewport(page);
    await page.fill('input[name="firstName"], input[placeholder*="First" i]', 'Test');
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(1500);

    // Step 4: Last name
    await waitForTooltipStep(page, 'last name');
    await assertTooltipInViewport(page);
    await page.fill('input[name="lastName"], input[placeholder*="Last" i]', `User${timestamp}`);
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(1500);

    // Step 5: Recovery email
    await waitForTooltipStep(page, 'email');
    await assertTooltipInViewport(page);
    await page.fill(
      'input[name="recoveryEmail"], input[type="email"], input[placeholder*="email" i]',
      TEST_EMAIL
    );
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(1500);

    // Step 6: Start date
    await waitForTooltipStep(page, 'start date');
    await assertTooltipInViewport(page);
    const today = new Date().toISOString().split('T')[0];
    await page.fill('input[type="date"], input[name="startDate"]', today);
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(1500);

    // Step 7: Create/Submit
    await waitForTooltipStep(page, 'create');
    await assertTooltipInViewport(page);
    await page.click('#yeshie-teach-tooltip button.next-btn');
    await page.waitForTimeout(3000);

    // Assert success — tooltip should be gone and page confirms creation
    const tooltipStillPresent = await page.$('#yeshie-teach-tooltip button.next-btn');
    expect(tooltipStillPresent).toBeNull();

    const pageText = await page.evaluate(() => document.body.textContent || '');
    expect(pageText.toLowerCase()).toMatch(/added|success|created/);

    // Cleanup: delete the test user we just created
    await deleteTestUser(page, TEST_EMAIL);
    await page.waitForTimeout(1000);
    const finalText = await page.evaluate(() => document.body.textContent || '');
    expect(finalText).not.toContain(TEST_EMAIL);
  });
});
