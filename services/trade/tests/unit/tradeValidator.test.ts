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

  it('rejects non-positive quantity', () => {
    expect(validateTrade({ ...req, quantity: 0 }, 18950).valid).toBe(false);
    expect(validateTrade({ ...req, quantity: -5 }, 18950).valid).toBe(false);
  });

  it('rejects when notional would overflow safe integers', () => {
    const result = validateTrade({ ...req, quantity: Number.MAX_SAFE_INTEGER - 1 }, 100000);
    expect(result).toEqual({ valid: false, reason: 'NOTIONAL_OVERFLOW' });
  });
});
