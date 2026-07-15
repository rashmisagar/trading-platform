/**
 * In-memory report store keyed by TRN — duplicate suppression is the store's
 * job (same TRN reported twice must never produce two regulatory reports).
 * Production would be a durable store fed by a transactional outbox on the
 * trading side; the interface is what the tests pin down.
 */
import type { EmirReportPair } from '../domain/emirReport.js';
import type { PairingResult } from '../domain/emirPairing.js';
import type { MifidTransactionReport } from '../domain/mifidReport.js';
import type { RuleViolation } from '../domain/validators.js';

export type ReportOutcome = 'ACCEPTED' | 'REJECTED';

export interface StoredReport {
  report: MifidTransactionReport;
  outcome: ReportOutcome; // simulated ARM ACK/NACK
  violations: RuleViolation[];
  receivedAt: string;
  accountId: string;
}

export interface StoredEmirPair {
  pair: EmirReportPair;
  violations: { firm: RuleViolation[]; client: RuleViolation[] };
  pairing: PairingResult;
  accountId: string;
  receivedAt: string;
}

export interface ReconciliationSummary {
  executionsReceived: number;
  reportsAccepted: number;
  reportsRejected: number;
  duplicatesSuppressed: number;
  enrichmentFailures: number;
  emir: {
    pairsMatched: number;
    pairsUnmatched: number;
    sidesRejected: number;
  };
}

export class ReportStore {
  private readonly byTrn = new Map<string, StoredReport>();
  private readonly emirByUti = new Map<string, StoredEmirPair>();
  private duplicates = 0;
  private executions = 0;
  private enrichmentFailures = 0;

  countExecution(): void {
    this.executions++;
  }

  countEnrichmentFailure(): void {
    this.enrichmentFailures++;
  }

  /** Returns false when the TRN was already reported (duplicate suppressed). */
  save(trn: string, stored: StoredReport): boolean {
    if (this.byTrn.has(trn)) {
      this.duplicates++;
      return false;
    }
    this.byTrn.set(trn, stored);
    return true;
  }

  get(trn: string): StoredReport | undefined {
    return this.byTrn.get(trn);
  }

  byAccount(accountId: string): StoredReport[] {
    return [...this.byTrn.values()].filter((r) => r.accountId === accountId);
  }

  saveEmir(uti: string, stored: StoredEmirPair): boolean {
    if (this.emirByUti.has(uti)) return false; // duplicate — already counted via TRN
    this.emirByUti.set(uti, stored);
    return true;
  }

  getEmir(uti: string): StoredEmirPair | undefined {
    return this.emirByUti.get(uti);
  }

  emirByAccount(accountId: string): StoredEmirPair[] {
    return [...this.emirByUti.values()].filter((p) => p.accountId === accountId);
  }

  reconciliation(): ReconciliationSummary {
    const all = [...this.byTrn.values()];
    const pairs = [...this.emirByUti.values()];
    return {
      executionsReceived: this.executions,
      reportsAccepted: all.filter((r) => r.outcome === 'ACCEPTED').length,
      reportsRejected: all.filter((r) => r.outcome === 'REJECTED').length,
      duplicatesSuppressed: this.duplicates,
      enrichmentFailures: this.enrichmentFailures,
      emir: {
        pairsMatched: pairs.filter((p) => p.pairing.status === 'MATCHED').length,
        pairsUnmatched: pairs.filter((p) => p.pairing.status !== 'MATCHED').length,
        sidesRejected: pairs.filter(
          (p) => p.violations.firm.length > 0 || p.violations.client.length > 0,
        ).length,
      },
    };
  }
}
