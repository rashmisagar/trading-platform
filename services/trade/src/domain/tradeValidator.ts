/** Pre-trade checks — pure domain logic, exhaustively unit-tested. */
export interface TradeRequest {
  readonly accountId: string;
  readonly symbol: string;
  readonly quantity: number; // positive integer
  readonly side: 'BUY' | 'SELL';
}

export type ValidationResult = { valid: true } | { valid: false; reason: string };

const MAX_NOTIONAL_MINOR = 1_000_000_00; // $1,000,000.00 single-order limit

export function validateTrade(req: TradeRequest, priceMinor: number): ValidationResult {
  if (!Number.isSafeInteger(req.quantity) || req.quantity <= 0) {
    return { valid: false, reason: 'QUANTITY_MUST_BE_POSITIVE_INTEGER' };
  }
  const notional = priceMinor * req.quantity;
  if (!Number.isSafeInteger(notional)) {
    return { valid: false, reason: 'NOTIONAL_OVERFLOW' };
  }
  if (notional > MAX_NOTIONAL_MINOR) {
    return { valid: false, reason: 'NOTIONAL_LIMIT_EXCEEDED' };
  }
  return { valid: true };
}
