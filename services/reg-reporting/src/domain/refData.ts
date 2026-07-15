/**
 * Static reference data for enrichment. All LEIs are FICTIONAL but
 * checksum-valid (ISO 17442 MOD 97-10); ISINs are the instruments' real
 * public identifiers. In production this is a golden-source service —
 * enrichment failures here are the #1 root cause of NACKed reports,
 * which is why unknown symbols/accounts must fail validation, never default.
 */

/** The executing investment firm (fictional). */
export const EXECUTING_ENTITY_LEI = 'FINCOGLOBALMARKETS76';

const ISIN_BY_SYMBOL: Record<string, string> = {
  AAPL: 'US0378331005',
  MSFT: 'US5949181045',
};

const LEI_BY_ACCOUNT: Record<string, string> = {
  'acc-alpha': 'CLIENTALPHACAPITAL58',
  'acc-beta': 'CLIENTBETAPENSIONS11',
  'acc-gamma': 'CLIENTGAMMAHEDGEFD35',
};

export function isinForSymbol(symbol: string): string | undefined {
  return ISIN_BY_SYMBOL[symbol];
}

/**
 * Client LEI lookup. Test/e2e accounts (acc-e2e-*, acc-gen-*, acc-load-* …)
 * map deterministically onto the known client LEIs so high-volume synthetic
 * flows still enrich — mirroring how UAT ref data is seeded in real estates.
 */
export function leiForAccount(accountId: string): string | undefined {
  const direct = LEI_BY_ACCOUNT[accountId];
  if (direct) return direct;
  if (!accountId.startsWith('acc-')) return undefined;
  const keys = Object.keys(LEI_BY_ACCOUNT);
  let hash = 0;
  for (const c of accountId) hash = (hash * 31 + c.charCodeAt(0)) % 997;
  const key = keys[hash % keys.length];
  return key === undefined ? undefined : LEI_BY_ACCOUNT[key];
}
