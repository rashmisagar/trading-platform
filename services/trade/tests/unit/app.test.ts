/**
 * Orchestration tests — mockist style: both clients are fakes, we assert on
 * the coordination behaviour (order of ops, fail-closed semantics, mapping).
 */
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { MarketDataClient } from '../../src/clients/marketDataClient.js';
import type { PortfolioClient } from '../../src/clients/portfolioClient.js';

const goodQuote = {
  ok: true as const,
  quote: {
    symbol: 'AAPL',
    priceMinor: 18950,
    currency: 'USD' as const,
    asOf: '2026-01-01T00:00:00Z',
  },
};
const applied = {
  ok: true as const,
  position: {
    accountId: 'acc-1',
    symbol: 'AAPL',
    quantity: 10,
    avgPriceMinor: 18950,
    duplicate: false,
  },
};

function makeDeps(overrides?: { quote?: unknown; apply?: unknown }) {
  const marketData = { getQuote: vi.fn().mockResolvedValue(overrides?.quote ?? goodQuote) };
  const portfolio = { applyDelta: vi.fn().mockResolvedValue(overrides?.apply ?? applied) };
  return {
    marketData: marketData as unknown as MarketDataClient,
    portfolio: portfolio as unknown as PortfolioClient,
    mocks: { marketData, portfolio },
  };
}

const validTrade = { accountId: 'acc-1', symbol: 'AAPL', quantity: 10, side: 'BUY' };

describe('POST /trades — orchestration', () => {
  it('executes a valid trade: prices it, validates, books the position', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/trades', payload: validTrade });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('EXECUTED');
    expect(deps.mocks.portfolio.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: 10, priceMinor: 18950 }),
    );
  });

  it('SELL side sends a negative quantity delta', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    await app.inject({ method: 'POST', url: '/trades', payload: { ...validTrade, side: 'SELL' } });
    expect(deps.mocks.portfolio.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: -10 }),
    );
  });

  it('FAILS CLOSED: market data unavailable → 503 and portfolio is NEVER called', async () => {
    const deps = makeDeps({ quote: { ok: false, reason: 'MARKET_DATA_UNAVAILABLE' } });
    const app = buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/trades', payload: validTrade });

    expect(res.statusCode).toBe(503);
    expect(deps.mocks.portfolio.applyDelta).not.toHaveBeenCalled();
  });

  it('does not book a position when pre-trade validation rejects', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/trades',
      payload: { ...validTrade, quantity: 10000 }, // breaches notional limit
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('NOTIONAL_LIMIT_EXCEEDED');
    expect(deps.mocks.portfolio.applyDelta).not.toHaveBeenCalled();
  });

  it('unknown symbol maps to 422, not a 500', async () => {
    const deps = makeDeps({ quote: { ok: false, reason: 'SYMBOL_NOT_FOUND' } });
    const app = buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/trades', payload: validTrade });
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /trades — MiFID II transaction reporting hand-off', () => {
  function makeRegReporting(result?: unknown) {
    return {
      reportExecution: vi
        .fn()
        .mockResolvedValue(
          result ?? { ok: true, submission: { transactionReferenceNumber: 't', duplicate: false } },
        ),
    };
  }

  it('reports the execution with the EXECUTED price, quantity, and side', async () => {
    const deps = makeDeps();
    const regReporting = makeRegReporting();
    const app = buildApp({ ...deps, regReporting: regReporting as never });
    await app.inject({ method: 'POST', url: '/trades', payload: validTrade });

    expect(regReporting.reportExecution).toHaveBeenCalledTimes(1);
    expect(regReporting.reportExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantity: 10,
        side: 'BUY',
        executedPriceMinor: 18950,
        currency: 'USD',
        tradeId: expect.stringMatching(/^trd-/),
        executedAt: expect.stringMatching(/Z$/),
      }),
    );
  });

  it('a reporting outage NEVER fails the trade — trading halts are worse than late reports', async () => {
    const deps = makeDeps();
    const regReporting = makeRegReporting({ ok: false, reason: 'REG_REPORTING_UNAVAILABLE' });
    const app = buildApp({ ...deps, regReporting: regReporting as never });
    const res = await app.inject({ method: 'POST', url: '/trades', payload: validTrade });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('EXECUTED');
  });

  it('rejected trades are NEVER reported — only executions are reportable', async () => {
    const deps = makeDeps();
    const regReporting = makeRegReporting();
    const app = buildApp({ ...deps, regReporting: regReporting as never });
    const res = await app.inject({
      method: 'POST',
      url: '/trades',
      payload: { ...validTrade, quantity: 10000 }, // breaches notional limit
    });
    expect(res.statusCode).toBe(422);
    expect(regReporting.reportExecution).not.toHaveBeenCalled();
  });

  it('reporting stays disabled when no client is configured', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/trades', payload: validTrade });
    expect(res.statusCode).toBe(201);
  });
});
