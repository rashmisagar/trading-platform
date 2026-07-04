/**
 * END-TO-END — the ONE curated critical journey, against the fully wired
 * stack (docker-compose.e2e.yml): trade → market-data (real) → portfolio
 * (real, backed by real Postgres). API-mode Playwright: these services have
 * no UI, and Playwright's request context is the right tool for API e2e.
 *
 * Everything else about these services is already covered at cheaper levels —
 * this exists to prove the real wiring works, not to re-test logic.
 */
import { expect, test } from '@playwright/test';

const PORTFOLIO_URL = process.env.PORTFOLIO_URL ?? 'http://localhost:3002';

test.describe('critical journey: place a trade, see the position', () => {
  test('a BUY trade executes at market price and the position is queryable', async ({
    request,
  }) => {
    const accountId = `acc-e2e-${Date.now()}`; // unique account per run → no test pollution

    // 1. Place the trade through trade's public API
    const tradeRes = await request.post('/trades', {
      data: { accountId, symbol: 'AAPL', quantity: 10, side: 'BUY' },
    });
    expect(tradeRes.status()).toBe(201);
    const trade = await tradeRes.json();
    expect(trade.status).toBe('EXECUTED');
    expect(Number.isSafeInteger(trade.executedPriceMinor)).toBe(true);

    // 2. The position must be visible in portfolio — real cross-service proof.
    //    Poll with expect.toPass, never a fixed sleep.
    await expect(async () => {
      const posRes = await request.get(`${PORTFOLIO_URL}/positions/${accountId}`);
      expect(posRes.status()).toBe(200);
      const body = await posRes.json();
      expect(body.positions).toEqual([expect.objectContaining({ symbol: 'AAPL', quantity: 10 })]);
    }).toPass({ timeout: 10_000 });
  });

  test('a SELL after a BUY nets the position to zero', async ({ request }) => {
    const accountId = `acc-e2e-net-${Date.now()}`;

    const buy = await request.post('/trades', {
      data: { accountId, symbol: 'MSFT', quantity: 5, side: 'BUY' },
    });
    expect(buy.status()).toBe(201);

    const sell = await request.post('/trades', {
      data: { accountId, symbol: 'MSFT', quantity: 5, side: 'SELL' },
    });
    expect(sell.status()).toBe(201);

    await expect(async () => {
      const posRes = await request.get(`${PORTFOLIO_URL}/positions/${accountId}`);
      const body = await posRes.json();
      expect(body.positions).toEqual([expect.objectContaining({ symbol: 'MSFT', quantity: 0 })]);
    }).toPass({ timeout: 10_000 });
  });

  test('an oversized trade is rejected end-to-end and books nothing', async ({ request }) => {
    const accountId = `acc-e2e-reject-${Date.now()}`;

    const res = await request.post('/trades', {
      data: { accountId, symbol: 'AAPL', quantity: 10000, side: 'BUY' }, // > $1m notional
    });
    expect(res.status()).toBe(422);

    const posRes = await request.get(`${PORTFOLIO_URL}/positions/${accountId}`);
    expect((await posRes.json()).positions).toHaveLength(0);
  });
});
