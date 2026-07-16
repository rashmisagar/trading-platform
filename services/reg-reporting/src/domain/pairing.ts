/**
 * Shared dual-sided pair matcher — the mechanical core of TR reconciliation:
 * pair on UTI, compare the declared field set, require opposite sides and
 * mirrored counterparties. What stays REGIME-LOCAL (in emirPairing /
 * sftrPairing) is everything that evolves per regulation: the matched-field
 * set and the side vocabulary. Only the loop is shared.
 */
export type PairingResult =
  { status: 'MATCHED' } | { status: 'UNMATCHED'; breaks: string[] } | { status: 'UNPAIRED' };

export interface DualSidedReport {
  uti: string;
  reportingCounterpartyLei: string;
  otherCounterpartyLei: string;
  counterpartySide: string;
}

export function matchDualSidedPair<T extends DualSidedReport>(
  a: T,
  b: T | undefined,
  matchedFields: readonly (keyof T)[],
): PairingResult {
  if (b === undefined || a.uti !== b.uti) return { status: 'UNPAIRED' };

  const breaks: string[] = [];
  for (const field of matchedFields) {
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
