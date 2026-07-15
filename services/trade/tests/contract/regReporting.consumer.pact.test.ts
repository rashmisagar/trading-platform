/**
 * CONSUMER CONTRACT — trade ↔ reg-reporting.
 * Generates pacts/trade-reg-reporting.json for reg-reporting's provider
 * verification. Per STANDARDS §3: a new service boundary ships its contract
 * test in the same PR — a stub with no contract behind it is a silent risk.
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegReportingClient } from '../../src/clients/regReportingClient.js';

const { like, integer, boolean } = MatchersV3;
const dirname_ = path.dirname(fileURLToPath(import.meta.url));

const provider = new PactV3({
  consumer: 'trade',
  provider: 'reg-reporting',
  dir: path.resolve(dirname_, '../../../../pacts'),
});

describe('trade ↔ reg-reporting contract', () => {
  it('POST /executions submits an execution and returns the submission receipt', async () => {
    provider
      .given('the reporting store is empty')
      .uponReceiving('an executed BUY trade for transaction reporting')
      .withRequest({
        method: 'POST',
        path: '/executions',
        headers: { 'Content-Type': 'application/json' },
        body: {
          tradeId: like('trd-00000000-0000-4000-8000-000000000000'),
          accountId: like('acc-alpha'),
          symbol: like('AAPL'),
          quantity: integer(10),
          side: like('BUY'),
          executedPriceMinor: integer(18950),
          currency: like('USD'),
          executedAt: like('2026-01-15T10:30:00.000Z'),
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          transactionReferenceNumber: like('trd-00000000-0000-4000-8000-000000000000'),
          duplicate: boolean(false),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new RegReportingClient(mockServer.url);
      const result = await client.reportExecution({
        tradeId: 'trd-00000000-0000-4000-8000-000000000000',
        accountId: 'acc-alpha',
        symbol: 'AAPL',
        quantity: 10,
        side: 'BUY',
        executedPriceMinor: 18950,
        currency: 'USD',
        executedAt: '2026-01-15T10:30:00.000Z',
      });
      expect(result.ok).toBe(true);
    });
  });
});
