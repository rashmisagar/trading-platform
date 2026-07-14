/**
 * SELF-HEALING DEMO — proves the detect → heal → record → escalate pipeline
 * against a deliberately drifted copy of the trade API, served in-process
 * (no docker stack needed). The drift simulated here is the realistic kind:
 * a provider release that moves the route under /api/v2 and renames fields
 * to snake_case — compatible data, incompatible shape.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '../lib/fixtures.js';

/** trade API "v2": moved endpoint + snake_case + one renamed field. */
function driftedTradeApi(): Server {
  return createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v2/trades') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          trade_status: 'EXECUTED', // was: status
          executed_price_minor: 18950, // was: executedPriceMinor
          qty: 10, // was: quantity
          account_id: 'acc-heal-1',
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });
}

let server: Server;
let base: string;

test.beforeAll(async () => {
  server = driftedTradeApi();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.describe('self-healing pipeline', () => {
  test('heals endpoint relocation and field renames, and records every event', async ({
    healing,
  }) => {
    const res = await healing.post(
      [`${base}/trades`, `${base}/api/v2/trades`], // candidate order: current contract first
      { accountId: 'acc-heal-1', symbol: 'AAPL', quantity: 10, side: 'BUY' },
      ['status', 'executedPriceMinor', 'quantity'],
    );

    // the test's assertions keep working against the CANONICAL shape…
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('EXECUTED');
    expect(res.body.executedPriceMinor).toBe(18950);
    expect(res.body.quantity).toBe(10);
    expect(res.unhealed).toEqual([]);

    // …while the drift is loudly recorded, never silently absorbed
    const strategies = healing.events.map((e) => e.strategy).sort();
    expect(strategies).toEqual([
      'endpoint-fallback', // /trades → /api/v2/trades
      'field-convention', //  executed_price_minor → executedPriceMinor
      'field-synonym', //  trade_status → status
      'field-synonym', //  qty → quantity
    ]);
    for (const event of healing.events) expect(event.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test('escalates unhealable drift instead of guessing', async ({ healing }) => {
    const res = await healing.post(
      [`${base}/api/v2/trades`],
      { accountId: 'acc-heal-2', symbol: 'AAPL', quantity: 10, side: 'BUY' },
      ['status', 'settlementDate'], // settlementDate does not exist in any shape
    );

    // healing never fabricates data: the missing field is escalated…
    expect(res.unhealed).toEqual(['settlementDate']);
    expect(res.body.settlementDate).toBeUndefined();
    // …and nothing about the recoverable fields was lost
    expect(res.body.status).toBe('EXECUTED');
  });
});
