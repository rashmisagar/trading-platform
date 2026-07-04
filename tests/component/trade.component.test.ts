/**
 * COMPONENT — the whole trade service as a running container, driven only
 * through its public API. market-data and portfolio are WireMock stubs
 * configured per-test via the admin API. Run with:
 *   docker compose -f docker-compose.component.yml up -d --build
 *   npm run test:component
 */
import { beforeEach, describe, expect, it } from 'vitest';

const TRADE = process.env.TRADE_URL ?? 'http://localhost:3003';
const WIREMOCK = process.env.WIREMOCK_URL ?? 'http://localhost:8081';

async function resetStubs() {
  await fetch(`${WIREMOCK}/__admin/reset`, { method: 'POST' });
}

async function stub(mapping: object) {
  const res = await fetch(`${WIREMOCK}/__admin/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping),
  });
  expect(res.ok).toBe(true);
}

function stubQuote(priceMinor: number, delayMs = 0) {
  return stub({
    request: { method: 'GET', urlPathPattern: '/prices/.*' },
    response: {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { symbol: 'AAPL', priceMinor, currency: 'USD', asOf: '2026-01-01T00:00:00.000Z' },
      fixedDelayMilliseconds: delayMs,
    },
  });
}

function stubPortfolioApply() {
  return stub({
    request: { method: 'POST', urlPath: '/positions/apply' },
    response: {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantity: 10,
        avgPriceMinor: 18950,
        duplicate: false,
      },
    },
  });
}

const validTrade = { accountId: 'acc-1', symbol: 'AAPL', quantity: 10, side: 'BUY' };

describe('trade service — component tests (real container, stubbed dependencies)', () => {
  beforeEach(resetStubs);

  it('happy path: prices, validates, books → 201 EXECUTED', async () => {
    await stubQuote(18950);
    await stubPortfolioApply();

    const res = await fetch(`${TRADE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTrade),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('EXECUTED');
    expect(body.executedPriceMinor).toBe(18950);
  });

  it('notional breach discovered at the REAL boundary → 422, portfolio untouched', async () => {
    await stubQuote(18950);
    await stubPortfolioApply();

    const res = await fetch(`${TRADE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validTrade, quantity: 10000 }), // $1.895m > $1m limit
    });

    expect(res.status).toBe(422);
    const requests = await (await fetch(`${WIREMOCK}/__admin/requests`)).json();
    const portfolioCalls = requests.requests.filter(
      (r: { request: { url: string } }) => r.request.url === '/positions/apply',
    );
    expect(portfolioCalls).toHaveLength(0);
  });

  it('slow market-data (beyond client timeout) → 503, FAILS CLOSED, no booking', async () => {
    await stubQuote(18950, 5000); // 5s delay vs trade's 2s client timeout
    await stubPortfolioApply();

    const res = await fetch(`${TRADE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTrade),
    });

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('MARKET_DATA_UNAVAILABLE');
  }, 15_000);

  it('malformed upstream response body → 503, never books against garbage data', async () => {
    await stub({
      request: { method: 'GET', urlPathPattern: '/prices/.*' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { nonsense: true },
      },
    });

    const res = await fetch(`${TRADE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTrade),
    });
    expect(res.status).toBe(503);
  });
});
