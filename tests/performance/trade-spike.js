// SPIKE (nightly): sudden step to simulate market open. The assertion is
// "degrades gracefully" — shedding load with 4xx/429 is a PASS; 5xx or
// collapse is a FAIL. Recovery after the spike is part of the test.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 500 }, // sudden step, no gentle ramp
    { duration: '1m', target: 500 },
    { duration: '20s', target: 10 }, // and prove it RECOVERS
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<1500'],
  },
};

const BASE = __ENV.TRADE_URL || 'http://localhost:3003';

export default function () {
  const res = http.post(
    `${BASE}/trades`,
    JSON.stringify({ accountId: `acc-spike-${__VU}`, symbol: 'AAPL', quantity: 1, side: 'BUY' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, {
    'no 5xx (graceful degradation only)': (r) => r.status < 500,
  });
}
