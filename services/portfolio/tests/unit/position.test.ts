import { describe, expect, it } from 'vitest';
import { applyDelta, type Position } from '../../src/domain/position.js';

const base = { accountId: 'acc-1', symbol: 'AAPL', currency: 'USD', idempotencyKey: 'k-00000001' };

describe('applyDelta — position arithmetic', () => {
  it('opens a new long position at the fill price', () => {
    const pos = applyDelta(undefined, { ...base, quantityDelta: 10, priceMinor: 18950 });
    expect(pos).toMatchObject({ quantity: 10, avgPriceMinor: 18950 });
  });

  it('increases a long position with a weighted average price', () => {
    const existing: Position = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantity: 10,
      avgPriceMinor: 10000,
      currency: 'USD',
    };
    const pos = applyDelta(existing, { ...base, quantityDelta: 10, priceMinor: 20000 });
    expect(pos.quantity).toBe(20);
    expect(pos.avgPriceMinor).toBe(15000); // (10*100 + 10*200)/20 exactly — integers, no drift
  });

  it('keeps average unchanged when reducing', () => {
    const existing: Position = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantity: 20,
      avgPriceMinor: 15000,
      currency: 'USD',
    };
    const pos = applyDelta(existing, { ...base, quantityDelta: -5, priceMinor: 30000 });
    expect(pos).toMatchObject({ quantity: 15, avgPriceMinor: 15000 });
  });

  it('flat position resets average to zero', () => {
    const existing: Position = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantity: 5,
      avgPriceMinor: 15000,
      currency: 'USD',
    };
    const pos = applyDelta(existing, { ...base, quantityDelta: -5, priceMinor: 16000 });
    expect(pos).toMatchObject({ quantity: 0, avgPriceMinor: 0 });
  });

  it('rejects zero quantityDelta', () => {
    expect(() => applyDelta(undefined, { ...base, quantityDelta: 0, priceMinor: 100 })).toThrow(
      TypeError,
    );
  });
});
