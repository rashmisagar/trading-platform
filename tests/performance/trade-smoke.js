// SMOKE (runs in CI on every merge, against the e2e compose stack):
// tiny load, tight functional thresholds — proves the deployed stack
// responds correctly and quickly before heavier tests bother running.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 2,
  duration: '15s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

const BASE = __ENV.TRADE_URL || 'http://localhost:3003';

export default function () {
  const res = http.post(
    `${BASE}/trades`,
    JSON.stringify({ accountId: `acc-k6-${__VU}`, symbol: 'AAPL', quantity: 1, side: 'BUY' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'trade executed': (r) => r.status === 201 });
}
