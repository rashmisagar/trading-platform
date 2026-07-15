/**
 * EMIR pairing & matching — the regime's hard part. Both counterparties
 * report independently; the TR pairs on UTI then matches fields. These
 * tests pin the break taxonomy (what mismatch produces which named break),
 * because in production every break category has a different remediation
 * owner and chasing them is the dominant EMIR operating cost.
 */
import { describe, expect, it } from 'vitest';
import { buildEmirReportPair, generateUti } from '../../src/domain/emirReport.js';
import { matchPair } from '../../src/domain/emirPairing.js';
import type { ExecutionEvent } from '../../src/domain/mifidReport.js';
import { EXECUTING_ENTITY_LEI } from '../../src/domain/refData.js';

const execution: ExecutionEvent = {
  tradeId: 'trd-33333333-3333-4333-8333-333333333333',
  accountId: 'acc-alpha',
  symbol: 'AAPL',
  quantity: 100,
  side: 'BUY',
  executedPriceMinor: 18950,
  currency: 'USD',
  executedAt: '2026-01-15T10:30:00.000Z',
};

function builtPair() {
  const result = buildEmirReportPair(execution);
  if (!result.ok) throw new Error('baseline execution must build');
  return result.pair;
}

describe('UTI generation (REFIT structure)', () => {
  it('is deterministic — a resubmission can never mint a second UTI', () => {
    expect(generateUti(execution.tradeId)).toBe(generateUti(execution.tradeId));
  });

  it('starts with the generating entity LEI, is uppercase alphanumeric, ≤52 chars', () => {
    const uti = generateUti(execution.tradeId);
    expect(uti.startsWith(EXECUTING_ENTITY_LEI)).toBe(true);
    expect(uti).toMatch(/^[A-Z0-9]{1,52}$/);
  });
});

describe('dual-sided report building', () => {
  it('both sides share the UTI, with mirrored counterparties and opposite sides', () => {
    const pair = builtPair();
    expect(pair.firmReport.uti).toBe(pair.clientReport.uti);
    expect(pair.firmReport.reportingCounterpartyLei).toBe(pair.clientReport.otherCounterpartyLei);
    expect(pair.firmReport.otherCounterpartyLei).toBe(pair.clientReport.reportingCounterpartyLei);
    // client BUY ⇒ firm sold
    expect(pair.firmReport.counterpartySide).toBe('SLLR');
    expect(pair.clientReport.counterpartySide).toBe('BUYR');
  });

  it('notional is derived as price × quantity in integer minor units on both sides', () => {
    const pair = builtPair();
    for (const report of [pair.firmReport, pair.clientReport]) {
      expect(report.notionalMinor).toBe(18950 * 100);
      expect(Number.isSafeInteger(report.notionalMinor)).toBe(true);
    }
  });
});

describe('pairing & matching outcomes', () => {
  it('a correctly built pair MATCHES', () => {
    const pair = builtPair();
    expect(matchPair(pair.firmReport, pair.clientReport)).toEqual({ status: 'MATCHED' });
  });

  it('a missing other side is UNPAIRED — the completeness break', () => {
    const pair = builtPair();
    expect(matchPair(pair.firmReport, undefined)).toEqual({ status: 'UNPAIRED' });
  });

  it('different UTIs never pair, even with identical economics', () => {
    const pair = builtPair();
    const otherUti = { ...pair.clientReport, uti: `${pair.uti}X` };
    expect(matchPair(pair.firmReport, otherUti)).toEqual({ status: 'UNPAIRED' });
  });

  it('an economics mismatch is UNMATCHED with the exact field named as the break', () => {
    const pair = builtPair();
    const drifted = { ...pair.clientReport, priceMinor: 18951, notionalMinor: 18951 * 100 };
    const result = matchPair(pair.firmReport, drifted);
    expect(result).toEqual({
      status: 'UNMATCHED',
      breaks: ['priceMinor', 'notionalMinor'],
    });
  });

  it('same-side reports are UNMATCHED with the sides-not-opposite break', () => {
    const pair = builtPair();
    const sameSide = { ...pair.clientReport, counterpartySide: pair.firmReport.counterpartySide };
    const result = matchPair(pair.firmReport, sameSide);
    expect(result.status).toBe('UNMATCHED');
    if (result.status === 'UNMATCHED') expect(result.breaks).toEqual(['sides-not-opposite']);
  });

  it('non-mirrored counterparties are UNMATCHED with the counterparties-not-mirrored break', () => {
    const pair = builtPair();
    const wrongParty = { ...pair.clientReport, otherCounterpartyLei: 'CLIENTBETAPENSIONS11' };
    const result = matchPair(pair.firmReport, wrongParty);
    expect(result.status).toBe('UNMATCHED');
    if (result.status === 'UNMATCHED')
      expect(result.breaks).toEqual(['counterparties-not-mirrored']);
  });
});
