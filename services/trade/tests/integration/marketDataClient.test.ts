/**
 * INTEGRATION — the boundary between MarketDataClient and a real HTTP server.
 * A local stub server (real sockets, real fetch, real timeouts) — this is what
 * catches serialization, status-mapping, and timeout bugs that mocks can't.
 */
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MarketDataClient } from '../../src/clients/marketDataClient.js';

const stub = Fastify();
let baseUrl = '';

beforeAll(async () => {
  stub.get('/prices/AAPL', async () => ({
    symbol: 'AAPL',
    priceMinor: 18950,
    currency: 'USD',
    asOf: '2026-01-01T00:00:00Z',
  }));
  stub.get('/prices/NOPE', async (_req, reply) =>
    reply.code(404).send({ error: 'SYMBOL_NOT_FOUND' }),
  );
  stub.get('/prices/SLOW', async () => {
    await new Promise((r) => setTimeout(r, 500));
    return { symbol: 'SLOW', priceMinor: 100, currency: 'USD', asOf: '2026-01-01T00:00:00Z' };
  });
  stub.get('/prices/BROKEN', async () => ({ totally: 'wrong-shape' }));
  const addr = await stub.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = addr;
});

afterAll(async () => stub.close());

describe('MarketDataClient over real HTTP', () => {
  it('parses a valid quote', async () => {
    const client = new MarketDataClient(baseUrl);
    const result = await client.getQuote('AAPL');
    expect(result).toEqual({ ok: true, quote: expect.objectContaining({ priceMinor: 18950 }) });
  });

  it('maps 404 to SYMBOL_NOT_FOUND', async () => {
    const client = new MarketDataClient(baseUrl);
    expect(await client.getQuote('NOPE')).toEqual({ ok: false, reason: 'SYMBOL_NOT_FOUND' });
  });

  it('times out slow responses and fails closed', async () => {
    const client = new MarketDataClient(baseUrl, 100); // 100ms timeout vs 500ms response
    expect(await client.getQuote('SLOW')).toEqual({ ok: false, reason: 'MARKET_DATA_UNAVAILABLE' });
  });

  it('treats a malformed response body as unavailable — never trusts bad data', async () => {
    const client = new MarketDataClient(baseUrl);
    expect(await client.getQuote('BROKEN')).toEqual({
      ok: false,
      reason: 'MARKET_DATA_UNAVAILABLE',
    });
  });
});
