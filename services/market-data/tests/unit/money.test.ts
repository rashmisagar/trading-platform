import { describe, expect, it } from 'vitest';
import { moneyMinor, multiplyByQuantity } from '../../src/domain/money.js';

describe('MoneyMinor', () => {
  it('rejects non-integer amounts — money is never a float', () => {
    expect(() => moneyMinor(150.25, 'USD')).toThrow(TypeError);
  });

  it('computes notional as integer minor units', () => {
    const price = moneyMinor(18950, 'USD'); // $189.50
    const notional = multiplyByQuantity(price, 10);
    expect(notional.amountMinor).toBe(189500); // $1,895.00 exactly — no float drift
  });

  it('rejects zero or negative quantity', () => {
    expect(() => multiplyByQuantity(moneyMinor(100, 'USD'), 0)).toThrow(TypeError);
    expect(() => multiplyByQuantity(moneyMinor(100, 'USD'), -5)).toThrow(TypeError);
  });
});
