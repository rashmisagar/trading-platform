import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0, // absorbs rare timing noise; never masks real failures
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['allure-playwright']]
    : [['list'], ['allure-playwright']],
  use: {
    baseURL: process.env.TRADE_URL ?? 'http://localhost:3003',
    trace: 'retain-on-failure',
  },
});
