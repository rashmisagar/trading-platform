import { z } from 'zod';

const quoteSchema = z.object({
  symbol: z.string(),
  priceMinor: z.number().int().positive(),
  currency: z.enum(['USD', 'GBP', 'EUR']),
  asOf: z.string(),
});
export type Quote = z.infer<typeof quoteSchema>;

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; reason: 'SYMBOL_NOT_FOUND' | 'MARKET_DATA_UNAVAILABLE' };

export class MarketDataClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 2000,
  ) {}

  async getQuote(symbol: string): Promise<QuoteResult> {
    try {
      const res = await fetch(`${this.baseUrl}/prices/${encodeURIComponent(symbol)}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 404) return { ok: false, reason: 'SYMBOL_NOT_FOUND' };
      if (!res.ok) return { ok: false, reason: 'MARKET_DATA_UNAVAILABLE' };
      const parsed = quoteSchema.safeParse(await res.json());
      if (!parsed.success) return { ok: false, reason: 'MARKET_DATA_UNAVAILABLE' };
      return { ok: true, quote: parsed.data };
    } catch {
      // Timeout / network failure → FAIL CLOSED. A trade must never execute
      // against a price we could not obtain.
      return { ok: false, reason: 'MARKET_DATA_UNAVAILABLE' };
    }
  }
}
