/**
 * CONSUMER CONTRACT — trade ↔ portfolio.
 * Generates pacts/trade-portfolio.json for portfolio's provider verification.
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PortfolioClient } from '../../src/clients/portfolioClient.js';

const { like, integer, boolean } = MatchersV3;
const dirname_ = path.dirname(fileURLToPath(import.meta.url));

const provider = new PactV3({
  consumer: 'trade',
  provider: 'portfolio',
  dir: path.resolve(dirname_, '../../../../pacts'),
});

describe('trade ↔ portfolio contract', () => {
  it('POST /positions/apply books a delta and returns the updated position', async () => {
    provider
      .given('account acc-1 can accept position updates')
      .uponReceiving('a position delta for an executed BUY trade')
      .withRequest({
        method: 'POST',
        path: '/positions/apply',
        headers: { 'Content-Type': 'application/json' },
        body: {
          accountId: like('acc-1'),
          symbol: like('AAPL'),
          quantityDelta: integer(10),
          priceMinor: integer(18950),
          currency: like('USD'),
          idempotencyKey: like('trd-00000000-0000-0000-0000-000000000000'),
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          accountId: like('acc-1'),
          symbol: like('AAPL'),
          quantity: integer(10),
          avgPriceMinor: integer(18950),
          duplicate: boolean(false),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new PortfolioClient(mockServer.url);
      const result = await client.applyDelta({
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantityDelta: 10,
        priceMinor: 18950,
        currency: 'USD',
        idempotencyKey: 'trd-00000000-0000-0000-0000-000000000000',
      });
      expect(result.ok).toBe(true);
    });
  });
});
