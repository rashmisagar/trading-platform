// REG-REPORTING VOLUME (nightly): reporting integrity under sustained trading
// load. The pass condition is not latency — it is that the reconciliation
// balances at the end: every executed trade produced exactly one accepted
// report. A reporting pipeline that drops 0.1% under load is a regulatory
// breach that a latency threshold would never catch.
import http from 'k6/http';
import { check, sleep } from 'k6';

const TRADE = __ENV.TRADE_URL || 'http://localhost:3003';
const REG = __ENV.REG_REPORTING_URL || 'http://localhost:3004';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 150 }, // sustained reportable flow
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const res = http.post(
    `${TRADE}/trades`,
    JSON.stringify({
      accountId: `acc-vol-${__VU}`,
      symbol: __ITER % 2 === 0 ? 'AAPL' : 'MSFT',
      quantity: 1 + (__ITER % 5),
      side: __ITER % 3 === 0 ? 'SELL' : 'BUY',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'trade executed': (r) => r.status === 201 });
  sleep(0.3);
}

// Integrity gate: after the load, the books must balance — both regimes.
export function teardown() {
  sleep(5); // grace for in-flight fire-and-forget submissions
  const recon = JSON.parse(http.get(`${REG}/reconciliation`).body);
  const mifidBalanced =
    recon.reportsAccepted === recon.executionsReceived &&
    recon.reportsRejected === 0 &&
    recon.enrichmentFailures === 0;
  const emirBalanced =
    recon.emir.pairsMatched === recon.executionsReceived &&
    recon.emir.pairsUnmatched === 0 &&
    recon.emir.sidesRejected === 0;
  check(recon, {
    'MiFID reconciliation balances: every execution reported, zero NACKs, zero drops': () =>
      mifidBalanced,
    'EMIR reconciliation balances: every execution paired and matched, zero breaks': () =>
      emirBalanced,
  });
  if (!mifidBalanced || !emirBalanced) {
    throw new Error(`reporting integrity breach: ${JSON.stringify(recon)}`);
  }
}
