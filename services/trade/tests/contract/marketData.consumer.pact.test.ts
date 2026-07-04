/**
 * CONSUMER CONTRACT — trade ↔ market-data.
 * Declares exactly the fields trade depends on (shape-matched, not values).
 * Generates pacts/trade-market-data.json, replayed by market-data's
 * provider-verification suite. Pipeline order: this job runs FIRST.
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketDataClient } from '../../src/clients/marketDataClient.js';

const { like, integer, timestamp } = MatchersV3;
const dirname_ = path.dirname(fileURLToPath(import.meta.url));

const provider = new PactV3({
  consumer: 'trade',
  provider: 'market-data',
  dir: path.resolve(dirname_, '../../../../pacts'),
});

describe('trade ↔ market-data contract', () => {
  it('GET /prices/:symbol returns the fields trade depends on', async () => {
    provider
      .given('a quote exists for AAPL')
      .uponReceiving('a request for the AAPL quote')
      .withRequest({ method: 'GET', path: '/prices/AAPL' })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          symbol: like('AAPL'),
          priceMinor: integer(18950),
          currency: like('USD'),
          asOf: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSSX", '2026-01-01T00:00:00.000Z'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new MarketDataClient(mockServer.url);
      const result = await client.getQuote('AAPL');
      expect(result.ok).toBe(true);
      if (result.ok) expect(Number.isSafeInteger(result.quote.priceMinor)).toBe(true);
    });
  });
});
