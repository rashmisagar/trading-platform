import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { InMemoryPositionRepo } from '../../src/repo/positionRepo.js';

describe('POST /positions/apply', () => {
  it('applies a delta and returns 201', async () => {
    const app = buildApp(new InMemoryPositionRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/positions/apply',
      payload: {
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantityDelta: 10,
        priceMinor: 18950,
        currency: 'USD',
        idempotencyKey: 'k-11111111',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().quantity).toBe(10);
  });

  it('replaying the same idempotency key returns 200 and does NOT double-apply', async () => {
    const app = buildApp(new InMemoryPositionRepo());
    const payload = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantityDelta: 10,
      priceMinor: 18950,
      currency: 'USD',
      idempotencyKey: 'k-22222222',
    };
    await app.inject({ method: 'POST', url: '/positions/apply', payload });
    const replay = await app.inject({ method: 'POST', url: '/positions/apply', payload });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().quantity).toBe(10); // still 10, not 20
    expect(replay.json().duplicate).toBe(true);
  });

  it('rejects a float quantity with 400', async () => {
    const app = buildApp(new InMemoryPositionRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/positions/apply',
      payload: {
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantityDelta: 10.5,
        priceMinor: 18950,
        currency: 'USD',
        idempotencyKey: 'k-33333333',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
