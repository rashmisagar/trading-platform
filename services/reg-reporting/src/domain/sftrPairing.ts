/**
 * SFTR pairing & matching — dual-sided like EMIR, with SFTR's matched-field
 * set (loan AND collateral legs, master agreement). Deliberately
 * regime-local rather than shared with emirPairing: matched-field sets,
 * side vocabularies, and tolerance regimes evolve independently per
 * regulation, and coupling them would make one regime's change ripple
 * into another's pack.
 */
import type { SftrTradeReport } from './sftrReport.js';

export type SftrPairingResult =
  { status: 'MATCHED' } | { status: 'UNMATCHED'; breaks: string[] } | { status: 'UNPAIRED' };

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
  if (b === undefined || a.uti !== b.uti) return { status: 'UNPAIRED' };

  const breaks: string[] = [];
  for (const field of MATCHED_FIELDS) {
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
