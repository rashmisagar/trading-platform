/**
 * SFTR trade report — a demonstrative subset of the Table 1 (counterparty)
 * / Table 2 (loan and collateral data) fields.
 *
 * SFTR's distinctive elements vs EMIR:
 *   - the reportable is a securities financing transaction (here: a stock
 *     loan, sftType SLEB) with LOAN and COLLATERAL legs, not just a trade
 *   - master-agreement linkage: the SFT type must be consistent with the
 *     agreement it is documented under (SLEB → GMSLA, repo → GMRA)
 *   - collateral coverage: collateral market value ≥ loan value (haircut)
 * Like EMIR it is dual-sided: both counterparties report under one UTI and
 * the TR pairs and matches. Collateral REUSE chains are future scope.
 *
 * Demo note: the SFT here is synthetic — the executed position is financed
 * via a stock loan under GMSLA (firm lends the security, client borrows,
 * cash collateral at a 2% haircut). A real estate routes by transaction
 * type; the eligibility router is where that decision lives.
 */
import type { ExecutionEvent } from './mifidReport.js';
import { EXECUTING_ENTITY_LEI, isinForSymbol, leiForAccount } from './refData.js';

/** ESMA counterparty side: the securities GIVEr (lender) or TAKEr (borrower). */
export type SftrSide = 'GIVE' | 'TAKE';
export type SftType = 'SLEB' | 'REPO' | 'BSB' | 'MGLD';
export type MasterAgreementType = 'GMSLA' | 'GMRA' | 'OTHR';

export interface SftrTradeReport {
  uti: string; // T2 — shared by both sides, distinct from the EMIR UTI
  reportingCounterpartyLei: string; // T1F3
  otherCounterpartyLei: string; // T1F11
  counterpartySide: SftrSide; // T1F9
  actionType: 'NEWT';
  sftType: SftType; // T2F5
  masterAgreementType: MasterAgreementType; // T2F9
  executionTimestamp: string; // T2F12 — UTC ISO-8601
  securityIsin: string; // T2F41
  quantity: number; // T2F83
  priceMinor: number; // integer minor units
  loanValueMinor: number; // T2F86 — price × quantity
  loanCurrency: string;
  collateralMarketValueMinor: number; // T2F88 — ≥ loan value (haircut)
  collateralCurrency: string;
}

export interface SftrReportPair {
  uti: string;
  firmReport: SftrTradeReport; // firm lends: GIVE
  clientReport: SftrTradeReport; // client borrows: TAKE
}

export type SftrBuildResult =
  | { ok: true; pair: SftrReportPair }
  | { ok: false; reason: 'UNKNOWN_INSTRUMENT' | 'UNKNOWN_COUNTERPARTY' };

/** Cash collateral at a 2% haircut, kept in integer minor units. */
export const COLLATERAL_HAIRCUT_NUMERATOR = 102n;

function collateralFor(loanValueMinor: number): number {
  return Number((BigInt(loanValueMinor) * COLLATERAL_HAIRCUT_NUMERATOR + 99n) / 100n);
}

/**
 * SFT UTI: generating-entity LEI + 'SFT' + trade id — deliberately distinct
 * from the EMIR UTI for the same execution (one reportable per regime, each
 * with its own identifier), deterministic so resubmission can't mint a second.
 */
export function generateSftUti(tradeId: string): string {
  const unique = tradeId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${EXECUTING_ENTITY_LEI}SFT${unique}`.slice(0, 52);
}

export function buildSftrReportPair(execution: ExecutionEvent): SftrBuildResult {
  const isin = isinForSymbol(execution.symbol);
  if (isin === undefined) return { ok: false, reason: 'UNKNOWN_INSTRUMENT' };
  const clientLei = leiForAccount(execution.accountId);
  if (clientLei === undefined) return { ok: false, reason: 'UNKNOWN_COUNTERPARTY' };

  const uti = generateSftUti(execution.tradeId);
  const loanValueMinor = execution.executedPriceMinor * execution.quantity;
  const common = {
    uti,
    actionType: 'NEWT' as const,
    sftType: 'SLEB' as const,
    masterAgreementType: 'GMSLA' as const,
    executionTimestamp: execution.executedAt,
    securityIsin: isin,
    quantity: execution.quantity,
    priceMinor: execution.executedPriceMinor,
    loanValueMinor,
    loanCurrency: execution.currency,
    collateralMarketValueMinor: collateralFor(loanValueMinor),
    collateralCurrency: execution.currency,
  };
  return {
    ok: true,
    pair: {
      uti,
      firmReport: {
        ...common,
        reportingCounterpartyLei: EXECUTING_ENTITY_LEI,
        otherCounterpartyLei: clientLei,
        counterpartySide: 'GIVE',
      },
      clientReport: {
        ...common,
        reportingCounterpartyLei: clientLei,
        otherCounterpartyLei: EXECUTING_ENTITY_LEI,
        counterpartySide: 'TAKE',
      },
    },
  };
}
