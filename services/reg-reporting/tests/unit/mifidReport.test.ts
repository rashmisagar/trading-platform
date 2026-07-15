/**
 * Report building & enrichment — sociable unit tests over the pure domain.
 * The buyer/seller swap is the classic real-world mis-reporting defect,
 * so both directions are pinned explicitly.
 */
import { describe, expect, it } from 'vitest';
import { buildMifidReport, type ExecutionEvent } from '../../src/domain/mifidReport.js';
import { EXECUTING_ENTITY_LEI } from '../../src/domain/refData.js';

const execution: ExecutionEvent = {
  tradeId: 'trd-11111111-1111-4111-8111-111111111111',
  accountId: 'acc-alpha',
  symbol: 'AAPL',
  quantity: 100,
  side: 'BUY',
  executedPriceMinor: 18950,
  currency: 'USD',
  executedAt: '2026-01-15T10:30:00.000Z',
};

describe('buildMifidReport — enrichment and field mapping', () => {
  it('maps an executed client BUY: client is buyer, firm is seller', () => {
    const result = buildMifidReport(execution);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).toMatchObject({
      reportStatus: 'NEWT',
      transactionReferenceNumber: execution.tradeId,
      buyerLei: 'CLIENTALPHACAPITAL58',
      sellerLei: EXECUTING_ENTITY_LEI,
      instrumentIsin: 'US0378331005',
      quantity: 100,
      priceMinor: 18950,
      priceCurrency: 'USD',
      tradingDateTime: execution.executedAt,
    });
  });

  it('maps a client SELL symmetrically: firm is buyer, client is seller', () => {
    const result = buildMifidReport({ ...execution, side: 'SELL' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.buyerLei).toBe(EXECUTING_ENTITY_LEI);
    expect(result.report.sellerLei).toBe('CLIENTALPHACAPITAL58');
  });

  it('fails the build on an unknown instrument — no guessed ISINs, ever', () => {
    const result = buildMifidReport({ ...execution, symbol: 'ZZZZ' });
    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_INSTRUMENT' });
  });

  it('fails the build on an unmappable counterparty', () => {
    const result = buildMifidReport({ ...execution, accountId: 'unknown-party' });
    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_COUNTERPARTY' });
  });

  it('maps synthetic test accounts (acc-*) deterministically to seeded client LEIs', () => {
    const first = buildMifidReport({ ...execution, accountId: 'acc-e2e-12345' });
    const second = buildMifidReport({ ...execution, accountId: 'acc-e2e-12345' });
    expect(first.ok && second.ok && first.report.buyerLei === second.report.buyerLei).toBe(true);
  });
});
