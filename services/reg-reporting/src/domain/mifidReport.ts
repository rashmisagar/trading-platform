/**
 * MiFID II RTS 22 transaction report — a demonstrative subset of the 65
 * Annex I Table 2 fields, keeping this repo's invariants: money in integer
 * minor units, UTC ISO-8601 timestamps, no floats anywhere near price.
 *
 * Buyer/seller derivation: the executing firm deals on own account (DEAL),
 * so a client BUY makes the client the buyer and the firm the seller —
 * getting this swap wrong is a classic real-world mis-reporting defect,
 * which is why the regression pack pins both directions.
 */
import { EXECUTING_ENTITY_LEI, isinForSymbol, leiForAccount } from './refData.js';

export interface ExecutionEvent {
  tradeId: string;
  accountId: string;
  symbol: string;
  quantity: number;
  side: 'BUY' | 'SELL';
  executedPriceMinor: number;
  currency: string;
  executedAt: string; // UTC ISO-8601
}

export interface MifidTransactionReport {
  reportStatus: 'NEWT'; // new transaction (CANC = lifecycle, future scope)
  transactionReferenceNumber: string; // F2 — TRN, unique per transaction
  executingEntityLei: string; // F4
  buyerLei: string; // F7
  sellerLei: string; // F16
  tradingDateTime: string; // F28
  tradingCapacity: 'DEAL'; // F29 — dealing on own account
  quantity: number; // F30
  priceMinor: number; // F33 — integer minor units
  priceCurrency: string; // F34
  venue: 'XOFF'; // F36 — executed off-venue
  instrumentIsin: string; // F41
}

export type BuildResult =
  | { ok: true; report: MifidTransactionReport }
  | { ok: false; reason: 'UNKNOWN_INSTRUMENT' | 'UNKNOWN_COUNTERPARTY' };

/** Enrich an execution into an RTS 22 report. Enrichment gaps fail the build — never guess. */
export function buildMifidReport(execution: ExecutionEvent): BuildResult {
  const isin = isinForSymbol(execution.symbol);
  if (isin === undefined) return { ok: false, reason: 'UNKNOWN_INSTRUMENT' };
  const clientLei = leiForAccount(execution.accountId);
  if (clientLei === undefined) return { ok: false, reason: 'UNKNOWN_COUNTERPARTY' };

  const clientBuys = execution.side === 'BUY';
  return {
    ok: true,
    report: {
      reportStatus: 'NEWT',
      transactionReferenceNumber: execution.tradeId,
      executingEntityLei: EXECUTING_ENTITY_LEI,
      buyerLei: clientBuys ? clientLei : EXECUTING_ENTITY_LEI,
      sellerLei: clientBuys ? EXECUTING_ENTITY_LEI : clientLei,
      tradingDateTime: execution.executedAt,
      tradingCapacity: 'DEAL',
      quantity: execution.quantity,
      priceMinor: execution.executedPriceMinor,
      priceCurrency: execution.currency,
      venue: 'XOFF',
      instrumentIsin: isin,
    },
  };
}
