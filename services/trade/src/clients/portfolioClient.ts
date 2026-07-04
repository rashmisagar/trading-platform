import { z } from 'zod';

const appliedSchema = z.object({
  accountId: z.string(),
  symbol: z.string(),
  quantity: z.number().int(),
  avgPriceMinor: z.number().int(),
  duplicate: z.boolean(),
});
export type AppliedPosition = z.infer<typeof appliedSchema>;

export type ApplyResult =
  | { ok: true; position: AppliedPosition }
  | { ok: false; reason: 'PORTFOLIO_REJECTED' | 'PORTFOLIO_UNAVAILABLE' };

export class PortfolioClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 2000,
  ) {}

  async applyDelta(input: {
    accountId: string;
    symbol: string;
    quantityDelta: number;
    priceMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<ApplyResult> {
    try {
      const res = await fetch(`${this.baseUrl}/positions/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 400) return { ok: false, reason: 'PORTFOLIO_REJECTED' };
      if (!res.ok && res.status !== 200 && res.status !== 201)
        return { ok: false, reason: 'PORTFOLIO_UNAVAILABLE' };
      const parsed = appliedSchema.safeParse(await res.json());
      if (!parsed.success) return { ok: false, reason: 'PORTFOLIO_UNAVAILABLE' };
      return { ok: true, position: parsed.data };
    } catch {
      return { ok: false, reason: 'PORTFOLIO_UNAVAILABLE' };
    }
  }
}
