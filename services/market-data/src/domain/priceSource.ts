import { type MoneyMinor, moneyMinor } from './money.js';

export interface Quote {
  readonly symbol: string;
  readonly price: MoneyMinor;
  readonly asOf: string; // ISO 8601 UTC
}

export interface PriceSource {
  getQuote(symbol: string): Quote | undefined;
}

/** Deterministic seeded source — real impl would wrap a vendor feed. */
export class StaticPriceSource implements PriceSource {
  private readonly prices = new Map<string, MoneyMinor>([
    ['AAPL', moneyMinor(18950, 'USD')],
    ['MSFT', moneyMinor(41232, 'USD')],
    ['VOD.L', moneyMinor(7180, 'GBP')],
  ]);

  getQuote(symbol: string): Quote | undefined {
    const price = this.prices.get(symbol.toUpperCase());
    if (!price) return undefined;
    return { symbol: symbol.toUpperCase(), price, asOf: new Date().toISOString() };
  }
}
