export interface Position {
  readonly accountId: string;
  readonly symbol: string;
  readonly quantity: number; // signed integer: negative = short
  readonly avgPriceMinor: number; // integer minor units
  readonly currency: string;
}

export interface PositionDelta {
  readonly accountId: string;
  readonly symbol: string;
  readonly quantityDelta: number; // +buy / -sell, non-zero integer
  readonly priceMinor: number;
  readonly currency: string;
  readonly idempotencyKey: string; // trade retries must never double-apply
}

/** Pure domain function: apply a fill to an existing (or empty) position. */
export function applyDelta(existing: Position | undefined, delta: PositionDelta): Position {
  if (!Number.isSafeInteger(delta.quantityDelta) || delta.quantityDelta === 0) {
    throw new TypeError('quantityDelta must be a non-zero integer');
  }
  if (!Number.isSafeInteger(delta.priceMinor) || delta.priceMinor <= 0) {
    throw new TypeError('priceMinor must be a positive integer');
  }
  const prevQty = existing?.quantity ?? 0;
  const prevAvg = existing?.avgPriceMinor ?? 0;
  const newQty = prevQty + delta.quantityDelta;

  // Weighted average only when INCREASING an existing same-direction position;
  // reductions and flips keep/reset the average per standard convention.
  let newAvg: number;
  if (prevQty === 0 || Math.sign(prevQty) !== Math.sign(newQty)) {
    newAvg = delta.priceMinor; // opening or flipping direction
  } else if (Math.abs(newQty) > Math.abs(prevQty)) {
    newAvg = Math.round(
      (prevAvg * Math.abs(prevQty) + delta.priceMinor * Math.abs(delta.quantityDelta)) /
        Math.abs(newQty),
    );
  } else {
    newAvg = prevAvg; // reducing: average unchanged
  }

  return {
    accountId: delta.accountId,
    symbol: delta.symbol,
    quantity: newQty,
    avgPriceMinor: newQty === 0 ? 0 : newAvg,
    currency: delta.currency,
  };
}
