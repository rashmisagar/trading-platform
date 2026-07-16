/**
 * EMIR pairing & matching — the trade repository's job, and the regime's
 * hard part: two independently submitted reports must first PAIR (same UTI)
 * and then MATCH (mirrored counterparties, opposite sides, identical
 * economics). An unpaired or unmatched report is a reconciliation break
 * both counterparties must chase — in production these breaks are the
 * dominant EMIR operating cost, which is why they get first-class tests.
 */
import type { EmirTradeReport } from './emirReport.js';

export type PairingResult =
  { status: 'MATCHED' } | { status: 'UNMATCHED'; breaks: string[] } | { status: 'UNPAIRED' };

const MATCHED_ECONOMICS: readonly (keyof EmirTradeReport)[] = [
  'isin',
  'quantity',
  'priceMinor',
  'priceCurrency',
  'notionalMinor',
  'notionalCurrency',
  'executionTimestamp',
  'venue',
];

export function matchPair(a: EmirTradeReport, b: EmirTradeReport | undefined): PairingResult {
  if (b === undefined || a.uti !== b.uti) return { status: 'UNPAIRED' };

  const breaks: string[] = [];
  for (const field of MATCHED_ECONOMICS) {
    if (a[field] !== b[field]) breaks.push(String(field));
  }
  if (a.counterpartySide === b.counterpartySide) breaks.push('sides-not-opposite');
  if (
    a.reportingCounterpartyLei !== b.otherCounterpartyLei ||
    a.otherCounterpartyLei !== b.reportingCounterpartyLei
  )
    breaks.push('counterparties-not-mirrored');

  return breaks.length === 0 ? { status: 'MATCHED' } : { status: 'UNMATCHED', breaks };
}
