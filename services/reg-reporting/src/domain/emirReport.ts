/**
 * EMIR (REFIT) trade report — a demonstrative subset of the Table 1
 * (counterparty data) / Table 2 (common data) fields.
 *
 * EMIR's defining property vs MiFID II: reporting is DUAL-SIDED. Both
 * counterparties submit a report, both reports must carry the SAME UTI,
 * and the trade repository pairs them on UTI then matches their fields.
 * This firm reports its own side and (delegated reporting — the common
 * arrangement) the client's side too, generating the UTI for both.
 *
 * Demo note: cash equities are MiFIR-reportable, not EMIR — a real estate
 * routes by instrument taxonomy. This repo dual-reports the same execution
 * flow through both engines to demonstrate the regime architecture; the
 * eligibility router is where that decision would live.
 */
import type { ExecutionEvent } from './mifidReport.js';
import { EXECUTING_ENTITY_LEI, isinForSymbol, leiForAccount } from './refData.js';

export type EmirSide = 'BUYR' | 'SLLR';

export interface EmirTradeReport {
  uti: string; // T2 — Unique Transaction Identifier, shared by both sides
  reportingCounterpartyLei: string; // T1F4 — whose view this report is
  otherCounterpartyLei: string; // T1F9
  counterpartySide: EmirSide; // T1F17 — from the reporting counterparty's view
  actionType: 'NEWT'; // MODI/EROR/TERM = lifecycle, future scope
  executionTimestamp: string; // T2F42 — UTC ISO-8601
  isin: string; // T2F7
  quantity: number; // T2F5
  priceMinor: number; // T2F4 — integer minor units
  priceCurrency: string;
  notionalMinor: number; // T2F10 — must equal priceMinor × quantity
  notionalCurrency: string;
  venue: 'XOFF';
  cleared: false; // clearing lifecycle = future scope
}

export interface EmirReportPair {
  uti: string;
  /** The firm's own side. */
  firmReport: EmirTradeReport;
  /** The client's side, submitted under delegated reporting. */
  clientReport: EmirTradeReport;
}

export type EmirBuildResult =
  | { ok: true; pair: EmirReportPair }
  | { ok: false; reason: 'UNKNOWN_INSTRUMENT' | 'UNKNOWN_COUNTERPARTY' };

/**
 * UTI per the REFIT structure: the generating entity's LEI followed by a
 * unique value, uppercase alphanumeric, max 52 chars. Deterministic from
 * the trade id so a resubmission can never mint a second UTI.
 */
export function generateUti(tradeId: string): string {
  const unique = tradeId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${EXECUTING_ENTITY_LEI}${unique}`.slice(0, 52);
}

/** Build BOTH sides' reports — mirrored counterparties, opposite sides, shared UTI. */
export function buildEmirReportPair(execution: ExecutionEvent): EmirBuildResult {
  const isin = isinForSymbol(execution.symbol);
  if (isin === undefined) return { ok: false, reason: 'UNKNOWN_INSTRUMENT' };
  const clientLei = leiForAccount(execution.accountId);
  if (clientLei === undefined) return { ok: false, reason: 'UNKNOWN_COUNTERPARTY' };

  const uti = generateUti(execution.tradeId);
  // Client BUY ⇒ firm sold: firm side SLLR, client side BUYR.
  const firmSide: EmirSide = execution.side === 'BUY' ? 'SLLR' : 'BUYR';
  const common = {
    uti,
    actionType: 'NEWT' as const,
    executionTimestamp: execution.executedAt,
    isin,
    quantity: execution.quantity,
    priceMinor: execution.executedPriceMinor,
    priceCurrency: execution.currency,
    notionalMinor: execution.executedPriceMinor * execution.quantity,
    notionalCurrency: execution.currency,
    venue: 'XOFF' as const,
    cleared: false as const,
  };
  return {
    ok: true,
    pair: {
      uti,
      firmReport: {
        ...common,
        reportingCounterpartyLei: EXECUTING_ENTITY_LEI,
        otherCounterpartyLei: clientLei,
        counterpartySide: firmSide,
      },
      clientReport: {
        ...common,
        reportingCounterpartyLei: clientLei,
        otherCounterpartyLei: EXECUTING_ENTITY_LEI,
        counterpartySide: firmSide === 'SLLR' ? 'BUYR' : 'SLLR',
      },
    },
  };
}
