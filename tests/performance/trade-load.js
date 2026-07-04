// LOAD (nightly / pre-release): expected peak volume, SLO-based thresholds.
// Percentiles, never averages — the tail is what breaches SLAs.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const tradeLatency = new Trend('trade_latency', true);
const tradeErrors = new Rate('trade_errors');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // ramp — lets pools warm
    { duration: '3m', target: 200 }, // sustained expected peak
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    trade_latency: ['p(95)<200', 'p(99)<400'],
    trade_errors: ['rate<0.001'],
  },
};

const BASE = __ENV.TRADE_URL || 'http://localhost:3003';

export default function () {
  const res = http.post(
    `${BASE}/trades`,
    JSON.stringify({ accountId: `acc-load-${__VU}`, symbol: 'MSFT', quantity: 2, side: 'BUY' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  tradeLatency.add(res.timings.duration);
  tradeErrors.add(res.status !== 201);
  check(res, { executed: (r) => r.status === 201 });
  sleep(0.2);
}
