/**
 * EMIR pairing & matching — the trade repository's job, and the regime's
 * hard part: two independently submitted reports must first PAIR (same UTI)
 * and then MATCH. An unpaired or unmatched report is a reconciliation break
 * both counterparties must chase — in production these breaks are the
 * dominant EMIR operating cost, which is why they get first-class tests.
 *
 * The matched-field set below is EMIR's own and evolves with the regime;
 * the mechanical matcher is shared (pairing.ts).
 */
import type { EmirTradeReport } from './emirReport.js';
import { matchDualSidedPair, type PairingResult } from './pairing.js';

export type { PairingResult };

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
  return matchDualSidedPair(a, b, MATCHED_ECONOMICS);
}
