/**
 * MiFID II END-TO-END VALIDATION — the reporting-integrity journey across
 * the fully wired stack: trade → (market-data, portfolio) → reg-reporting.
 *
 * E2E proves the three integrity pillars over real wiring — everything
 * field-level already lives in the reg-reporting regression pack:
 *   COMPLETENESS — every executed trade produces exactly one report
 *   ACCURACY     — the report carries the trade's executed economics
 *   UNIQUENESS   — no trade is ever double-reported
 * …and the negative: a rejected trade must never generate a report.
 */
import { expect, test } from '@playwright/test';

const REG_REPORTING_URL = process.env.REG_REPORTING_URL ?? 'http://localhost:3004';

test.describe('MiFID II transaction reporting — end-to-end integrity', () => {
  test('an executed BUY produces exactly one ACCEPTED report carrying the executed economics', async ({
    request,
  }) => {
    const accountId = `acc-e2e-mifid-${Date.now()}`;

    const tradeRes = await request.post('/trades', {
      data: { accountId, symbol: 'AAPL', quantity: 10, side: 'BUY' },
    });
    expect(tradeRes.status()).toBe(201);
    const trade = await tradeRes.json();

    // COMPLETENESS: the report appears (reporting is async — poll, never sleep)
    await expect(async () => {
      const res = await request.get(`${REG_REPORTING_URL}/reports/${trade.tradeId}`);
      expect(res.status()).toBe(200);
      const stored = await res.json();

      // ACCURACY: report economics === trade economics, field by field
      expect(stored.outcome).toBe('ACCEPTED');
      expect(stored.report).toMatchObject({
        reportStatus: 'NEWT',
        transactionReferenceNumber: trade.tradeId,
        quantity: 10,
        priceMinor: trade.executedPriceMinor,
        priceCurrency: trade.currency,
        instrumentIsin: 'US0378331005', // AAPL — enrichment, not echo
      });
      // buyer/seller derivation: client bought, firm sold
      expect(stored.report.buyerLei).not.toBe(stored.report.sellerLei);
      expect(stored.report.sellerLei).toBe('FINCOGLOBALMARKETS76');
    }).toPass({ timeout: 10_000 });

    // UNIQUENESS: exactly one report for this account, even after the poll loop
    const all = await (
      await request.get(`${REG_REPORTING_URL}/reports?accountId=${accountId}`)
    ).json();
    expect(all.reports).toHaveLength(1);
  });

  test('a SELL is reported with buyer/seller swapped — the classic mis-reporting defect', async ({
    request,
  }) => {
    const accountId = `acc-e2e-mifid-sell-${Date.now()}`;
    const tradeRes = await request.post('/trades', {
      data: { accountId, symbol: 'MSFT', quantity: 5, side: 'SELL' },
    });
    expect(tradeRes.status()).toBe(201);
    const trade = await tradeRes.json();

    await expect(async () => {
      const res = await request.get(`${REG_REPORTING_URL}/reports/${trade.tradeId}`);
      expect(res.status()).toBe(200);
      const { report, outcome } = await res.json();
      expect(outcome).toBe('ACCEPTED');
      expect(report.buyerLei).toBe('FINCOGLOBALMARKETS76'); // firm buys
      expect(report.instrumentIsin).toBe('US5949181045'); // MSFT
    }).toPass({ timeout: 10_000 });
  });

  test('a rejected trade generates NO report — only executions are reportable', async ({
    request,
  }) => {
    const accountId = `acc-e2e-mifid-reject-${Date.now()}`;
    const res = await request.post('/trades', {
      data: { accountId, symbol: 'AAPL', quantity: 10000, side: 'BUY' }, // > $1m notional
    });
    expect(res.status()).toBe(422);

    // Deliberate settle window, then assert absence (absence can't be polled-for)
    await new Promise((r) => setTimeout(r, 1500));
    const reports = await (
      await request.get(`${REG_REPORTING_URL}/reports?accountId=${accountId}`)
    ).json();
    expect(reports.reports).toHaveLength(0);
  });

  test('reconciliation stays consistent: accepted + rejected + enrichment failures ≤ executions received', async ({
    request,
  }) => {
    const recon = await (await request.get(`${REG_REPORTING_URL}/reconciliation`)).json();
    expect(recon.executionsReceived).toBeGreaterThanOrEqual(
      recon.reportsAccepted + recon.reportsRejected + recon.enrichmentFailures,
    );
    // in this stack every execution is enrichable and valid — nothing may leak
    expect(recon.enrichmentFailures + recon.reportsRejected).toBe(0);
  });
});
