/**
 * SFTR pairing & matching — dual-sided like EMIR, with SFTR's matched-field
 * set spanning BOTH legs (loan AND collateral) plus the master agreement.
 * The field set below is SFTR's own and evolves with the regime; the
 * mechanical matcher is shared (pairing.ts).
 */
import type { SftrTradeReport } from './sftrReport.js';
import { matchDualSidedPair, type PairingResult } from './pairing.js';

export type SftrPairingResult = PairingResult;

const MATCHED_FIELDS: readonly (keyof SftrTradeReport)[] = [
  'sftType',
  'masterAgreementType',
  'securityIsin',
  'quantity',
  'priceMinor',
  'loanValueMinor',
  'loanCurrency',
  'collateralMarketValueMinor',
  'collateralCurrency',
  'executionTimestamp',
];

export function matchSftrPair(
  a: SftrTradeReport,
  b: SftrTradeReport | undefined,
): SftrPairingResult {
  return matchDualSidedPair(a, b, MATCHED_FIELDS);
}
