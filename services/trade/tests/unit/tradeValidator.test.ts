import { describe, expect, it } from 'vitest';
import { validateTrade } from '../../src/domain/tradeValidator.js';

const req = { accountId: 'acc-1', symbol: 'AAPL', quantity: 10, side: 'BUY' as const };

describe('validateTrade — pre-trade checks', () => {
  it('accepts a trade within the notional limit', () => {
    expect(validateTrade(req, 18950)).toEqual({ valid: true });
  });

  it('rejects a trade exceeding the $1m single-order notional limit', () => {
    const result = validateTrade({ ...req, quantity: 10000 }, 18950); // $1.895m
    expect(result).toEqual({ valid: false, reason: 'NOTIONAL_LIMIT_EXCEEDED' });
  });

  it('accepts a trade at exactly the $1m notional limit', () => {
    // 10,000 × $100.00 = $1,000,000.00 — the limit is exclusive, so this books
    expect(validateTrade({ ...req, quantity: 10000 }, 10000)).toEqual({ valid: true });
  });

  it('rejects non-positive quantity', () => {
    expect(validateTrade({ ...req, quantity: 0 }, 18950).valid).toBe(false);
    expect(validateTrade({ ...req, quantity: -5 }, 18950).valid).toBe(false);
  });

  it('rejects fractional quantity', () => {
    const result = validateTrade({ ...req, quantity: 2.5 }, 18950);
    expect(result).toEqual({ valid: false, reason: 'QUANTITY_MUST_BE_POSITIVE_INTEGER' });
  });

  it('rejects when notional would overflow safe integers', () => {
    const result = validateTrade({ ...req, quantity: Number.MAX_SAFE_INTEGER - 1 }, 100000);
    expect(result).toEqual({ valid: false, reason: 'NOTIONAL_OVERFLOW' });
  });
});
