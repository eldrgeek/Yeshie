import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/teach-mode',
  timeout: 60000,
  use: {
    headless: false,
    viewport: null,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
