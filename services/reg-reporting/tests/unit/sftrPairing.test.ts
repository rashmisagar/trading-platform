/**
 * SFTR pairing & matching — dual-sided like EMIR, with SFTR's matched-field
 * set spanning BOTH legs (loan and collateral) plus the master agreement.
 * Break names are pinned exactly, same rationale as the EMIR pack: each
 * break category has a different remediation owner.
 */
import { describe, expect, it } from 'vitest';
import { buildSftrReportPair, generateSftUti } from '../../src/domain/sftrReport.js';
import { generateUti } from '../../src/domain/emirReport.js';
import { matchSftrPair } from '../../src/domain/sftrPairing.js';
import type { ExecutionEvent } from '../../src/domain/mifidReport.js';
import { EXECUTING_ENTITY_LEI } from '../../src/domain/refData.js';

const execution: ExecutionEvent = {
  tradeId: 'trd-44444444-4444-4444-8444-444444444444',
  accountId: 'acc-alpha',
  symbol: 'AAPL',
  quantity: 100,
  side: 'BUY',
  executedPriceMinor: 18950,
  currency: 'USD',
  executedAt: '2026-01-15T10:30:00.000Z',
};

function builtPair() {
  const result = buildSftrReportPair(execution);
  if (!result.ok) throw new Error('baseline execution must build');
  return result.pair;
}

describe('SFT UTI generation', () => {
  it('is deterministic, LEI-prefixed, and ≤52 uppercase alphanumerics', () => {
    const uti = generateSftUti(execution.tradeId);
    expect(uti).toBe(generateSftUti(execution.tradeId));
    expect(uti.startsWith(EXECUTING_ENTITY_LEI)).toBe(true);
    expect(uti).toMatch(/^[A-Z0-9]{1,52}$/);
  });

  it('is DISTINCT from the EMIR UTI for the same execution — one identifier per regime', () => {
    expect(generateSftUti(execution.tradeId)).not.toBe(generateUti(execution.tradeId));
  });
});

describe('dual-sided SFT building — loan and collateral legs', () => {
  it('firm GIVEs the securities, client TAKEs, under one UTI with mirrored counterparties', () => {
    const pair = builtPair();
    expect(pair.firmReport.uti).toBe(pair.clientReport.uti);
    expect(pair.firmReport.counterpartySide).toBe('GIVE');
    expect(pair.clientReport.counterpartySide).toBe('TAKE');
    expect(pair.firmReport.otherCounterpartyLei).toBe(pair.clientReport.reportingCounterpartyLei);
  });

  it('loan value is price × quantity and collateral covers it with the 2% haircut, all integer minor units', () => {
    const pair = builtPair();
    for (const report of [pair.firmReport, pair.clientReport]) {
      expect(report.loanValueMinor).toBe(18950 * 100);
      expect(report.collateralMarketValueMinor).toBe(Math.ceil((18950 * 100 * 102) / 100));
      expect(report.collateralMarketValueMinor).toBeGreaterThanOrEqual(report.loanValueMinor);
      expect(Number.isSafeInteger(report.collateralMarketValueMinor)).toBe(true);
    }
  });

  it('the synthetic SFT is a stock loan under its consistent master agreement (SLEB/GMSLA)', () => {
    const pair = builtPair();
    expect(pair.firmReport.sftType).toBe('SLEB');
    expect(pair.firmReport.masterAgreementType).toBe('GMSLA');
  });
});

describe('pairing & matching outcomes', () => {
  it('a correctly built pair MATCHES', () => {
    const pair = builtPair();
    expect(matchSftrPair(pair.firmReport, pair.clientReport)).toEqual({ status: 'MATCHED' });
  });

  it('a missing other side is UNPAIRED', () => {
    const pair = builtPair();
    expect(matchSftrPair(pair.firmReport, undefined)).toEqual({ status: 'UNPAIRED' });
  });

  it('a collateral-leg mismatch is UNMATCHED with the exact field named — collateral is matched, not just the loan', () => {
    const pair = builtPair();
    const drifted = { ...pair.clientReport, collateralMarketValueMinor: 1900000 };
    expect(matchSftrPair(pair.firmReport, drifted)).toEqual({
      status: 'UNMATCHED',
      breaks: ['collateralMarketValueMinor'],
    });
  });

  it('a master-agreement mismatch between the sides is a named break', () => {
    const pair = builtPair();
    const drifted = { ...pair.clientReport, masterAgreementType: 'OTHR' as const };
    expect(matchSftrPair(pair.firmReport, drifted)).toEqual({
      status: 'UNMATCHED',
      breaks: ['masterAgreementType'],
    });
  });

  it('same-side reports are UNMATCHED with the sides-not-opposite break', () => {
    const pair = builtPair();
    const sameSide = { ...pair.clientReport, counterpartySide: 'GIVE' as const };
    const result = matchSftrPair(pair.firmReport, sameSide);
    expect(result).toEqual({ status: 'UNMATCHED', breaks: ['sides-not-opposite'] });
  });
});
