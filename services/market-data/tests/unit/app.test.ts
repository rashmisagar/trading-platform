import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('GET /prices/:symbol', () => {
  it('returns a quote for a known symbol', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/prices/AAPL' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.symbol).toBe('AAPL');
    expect(Number.isSafeInteger(body.priceMinor)).toBe(true);
  });

  it('returns 404 for an unknown symbol', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/prices/NOPE' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SYMBOL_NOT_FOUND');
  });
});
