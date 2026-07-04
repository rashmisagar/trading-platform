/**
 * All monetary amounts are integer minor units (e.g. cents) — never floats.
 * Float arithmetic on money is an incident class in finance, not a style choice.
 */
export interface MoneyMinor {
  readonly amountMinor: number; // integer, e.g. 15025 = 150.25
  readonly currency: 'USD' | 'GBP' | 'EUR';
}

export function moneyMinor(amountMinor: number, currency: MoneyMinor['currency']): MoneyMinor {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError(`Money must be an integer number of minor units, got: ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function multiplyByQuantity(price: MoneyMinor, quantity: number): MoneyMinor {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new TypeError(`Quantity must be a positive integer, got: ${quantity}`);
  }
  return moneyMinor(price.amountMinor * quantity, price.currency);
}
