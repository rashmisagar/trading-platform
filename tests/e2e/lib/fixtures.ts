/**
 * Shared Playwright fixtures. `healing` is the self-healing API client:
 * use it instead of the raw `request` fixture wherever schema/endpoint
 * drift should degrade gracefully instead of hard-failing the suite.
 * The healing report is attached automatically on teardown.
 */
import { test as base } from '@playwright/test';
import { SelfHealingApiClient } from './selfHealing.js';

export const test = base.extend<{ healing: SelfHealingApiClient }>({
  healing: async ({ request }, use, testInfo) => {
    const client = new SelfHealingApiClient(request, testInfo);
    await use(client);
    await client.attachReport();
  },
});

export { expect } from '@playwright/test';
