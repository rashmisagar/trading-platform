/**
 * Reporting API behaviour — submission ACK/NACK, duplicate suppression
 * (uniqueness), and the reconciliation summary (completeness). These three
 * are the integrity pillars the e2e pack re-proves across the real wiring.
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const execution = {
  tradeId: 'trd-22222222-2222-4222-8222-222222222222',
  accountId: 'acc-alpha',
  symbol: 'AAPL',
  quantity: 100,
  side: 'BUY',
  executedPriceMinor: 18950,
  currency: 'USD',
  executedAt: '2026-01-15T10:30:00.000Z',
};

describe('POST /executions — submission and ARM ACK/NACK', () => {
  it('ACKs a clean execution: 201 ACCEPTED with zero violations', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/executions', payload: execution });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      transactionReferenceNumber: execution.tradeId,
      status: 'ACCEPTED',
      violations: [],
      duplicate: false,
    });
  });

  it('NACKs an invalid execution but STILL stores it — completeness over prettiness', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/executions',
      payload: { ...execution, quantity: -1 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('REJECTED');
    expect(res.json().violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
      'RTS22-F30-QUANTITY',
    );
    // the NACKed report is queryable — nothing reportable ever vanishes
    const stored = await app.inject({ method: 'GET', url: `/reports/${execution.tradeId}` });
    expect(stored.statusCode).toBe(200);
    expect(stored.json().outcome).toBe('REJECTED');
  });

  it('suppresses a duplicate TRN: same trade reported twice → one report (200 duplicate)', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/executions', payload: execution });
    const retry = await app.inject({ method: 'POST', url: '/executions', payload: execution });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({
      transactionReferenceNumber: execution.tradeId,
      duplicate: true,
    });
    const recon = (await app.inject({ method: 'GET', url: '/reconciliation' })).json();
    expect(recon.duplicatesSuppressed).toBe(1);
    expect(recon.reportsAccepted).toBe(1);
  });

  it('tracks enrichment failures in reconciliation — a dropped report is a breach, not a log line', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/executions',
      payload: { ...execution, symbol: 'ZZZZ' },
    });
    expect(res.statusCode).toBe(422);
    const recon = (await app.inject({ method: 'GET', url: '/reconciliation' })).json();
    expect(recon).toMatchObject({ executionsReceived: 1, enrichmentFailures: 1 });
  });

  it('rejects a malformed submission outright (schema, not domain)', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/executions', payload: { nope: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_EXECUTION');
  });
});

describe('report queries', () => {
  it('lists reports by account for reconciliation tooling', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/executions', payload: execution });
    const res = await app.inject({ method: 'GET', url: '/reports?accountId=acc-alpha' });
    expect(res.statusCode).toBe(200);
    expect(res.json().reports).toHaveLength(1);
  });

  it('404s an unknown TRN', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/reports/trd-unknown' });
    expect(res.statusCode).toBe(404);
  });
});
