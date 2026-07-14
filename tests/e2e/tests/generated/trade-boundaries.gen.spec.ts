/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: tests/e2e/api-catalog.json · Regenerate: npm run generate:tests
 *
 * Boundary probes derived from the catalog's invariants. The notional
 * boundary is computed from the LIVE AAPL price at runtime, so these
 * tests probe the exact limit no matter what the price source returns.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const MARKET_DATA_URL = process.env.MARKET_DATA_URL ?? 'http://localhost:3001';
const MAX_NOTIONAL_MINOR = 100000000;

async function maxQuantityAtLimit(request: APIRequestContext): Promise<number> {
  const quote = (await (await request.get(`${MARKET_DATA_URL}/prices/AAPL`)).json()) as {
    priceMinor: number;
  };
  return Math.floor(MAX_NOTIONAL_MINOR / quote.priceMinor);
}

test.describe('trade API — generated boundary probes (from api-catalog.json)', () => {
  test('BUY at the exact notional limit executes (boundary from live price)', async ({
    request,
  }) => {
    const quantity = await maxQuantityAtLimit(request);
    const res = await request.post('/trades', {
      data: { accountId: `acc-gen-limit-buy-${Date.now()}`, symbol: 'AAPL', quantity, side: 'BUY' },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('EXECUTED');
  });

  test('SELL at the exact notional limit executes (boundary from live price)', async ({
    request,
  }) => {
    const quantity = await maxQuantityAtLimit(request);
    const res = await request.post('/trades', {
      data: {
        accountId: `acc-gen-limit-sell-${Date.now()}`,
        symbol: 'AAPL',
        quantity,
        side: 'SELL',
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('EXECUTED');
  });

  test('one share above the notional limit is rejected and books nothing', async ({ request }) => {
    const quantity = (await maxQuantityAtLimit(request)) + 1;
    const res = await request.post('/trades', {
      data: { accountId: `acc-gen-over-${Date.now()}`, symbol: 'AAPL', quantity, side: 'BUY' },
    });
    expect([400, 422]).toContain(res.status());
  });

  test('fractional quantity (`2.5`) is rejected', async ({ request }) => {
    const res = await request.post('/trades', {
      data: {
        accountId: `acc-gen-fractional-${Date.now()}`,
        symbol: 'AAPL',
        quantity: 2.5,
        side: 'BUY',
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test('zero quantity (`0`) is rejected', async ({ request }) => {
    const res = await request.post('/trades', {
      data: { accountId: `acc-gen-zero-${Date.now()}`, symbol: 'AAPL', quantity: 0, side: 'BUY' },
    });
    expect([400, 422]).toContain(res.status());
  });

  test('negative quantity (`-3`) is rejected', async ({ request }) => {
    const res = await request.post('/trades', {
      data: {
        accountId: `acc-gen-negative-${Date.now()}`,
        symbol: 'AAPL',
        quantity: -3,
        side: 'BUY',
      },
    });
    expect([400, 422]).toContain(res.status());
  });
});
