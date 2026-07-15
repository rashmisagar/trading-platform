import { z } from 'zod';

const submissionSchema = z.object({
  transactionReferenceNumber: z.string(),
  duplicate: z.boolean(),
});

export type ReportSubmission = z.infer<typeof submissionSchema>;

export type ReportResult =
  { ok: true; submission: ReportSubmission } | { ok: false; reason: 'REG_REPORTING_UNAVAILABLE' };

export interface ExecutionReport {
  tradeId: string;
  accountId: string;
  symbol: string;
  quantity: number;
  side: 'BUY' | 'SELL';
  executedPriceMinor: number;
  currency: string;
  executedAt: string;
}

/**
 * Client for the reg-reporting service. Reporting is fire-and-forget from
 * the trading path — a reporting outage must never halt trading — so this
 * client NEVER throws. Completeness is owned by reg-reporting's
 * reconciliation (and, in production, an outbox + replay, not best-effort
 * HTTP: see docs/REG-REPORTING-TEST-STRATEGY.md).
 */
export class RegReportingClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 2000,
  ) {}

  async reportExecution(execution: ExecutionReport): Promise<ReportResult> {
    try {
      const res = await fetch(`${this.baseUrl}/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execution),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status !== 200 && res.status !== 201)
        return { ok: false, reason: 'REG_REPORTING_UNAVAILABLE' };
      const parsed = submissionSchema.safeParse(await res.json());
      if (!parsed.success) return { ok: false, reason: 'REG_REPORTING_UNAVAILABLE' };
      return { ok: true, submission: parsed.data };
    } catch {
      return { ok: false, reason: 'REG_REPORTING_UNAVAILABLE' };
    }
  }
}
