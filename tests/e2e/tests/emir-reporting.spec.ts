/**
 * EMIR END-TO-END VALIDATION — dual-sided reporting integrity across the
 * wired stack. What only e2e can prove for EMIR: a real execution produces
 * BOTH counterparty views, they carry the same UTI, and the pair MATCHES —
 * the exact properties a trade repository reconciles between two firms.
 * Field-level rules live in the EMIR regression pack; pairing taxonomy in
 * emirPairing.test.ts — neither is re-tested here.
 */
import { expect, test } from '@playwright/test';

const REG_REPORTING_URL = process.env.REG_REPORTING_URL ?? 'http://localhost:3004';

test.describe('EMIR transaction reporting — end-to-end pairing integrity', () => {
  test('an executed trade produces a MATCHED dual-sided pair under one UTI', async ({
    request,
  }) => {
    const accountId = `acc-e2e-emir-${Date.now()}`;

    const tradeRes = await request.post('/trades', {
      data: { accountId, symbol: 'AAPL', quantity: 7, side: 'BUY' },
    });
    expect(tradeRes.status()).toBe(201);
    const trade = await tradeRes.json();

    await expect(async () => {
      const res = await request.get(`${REG_REPORTING_URL}/emir/reports?accountId=${accountId}`);
      const { pairs } = await res.json();
      expect(pairs).toHaveLength(1); // exactly one pair — uniqueness
      const [stored] = pairs;

      expect(stored.pairing).toEqual({ status: 'MATCHED' });
      expect(stored.violations).toEqual({ firm: [], client: [] });

      const { firmReport, clientReport } = stored.pair;
      // one UTI, two views
      expect(firmReport.uti).toBe(clientReport.uti);
      // opposite sides, mirrored counterparties
      expect(firmReport.counterpartySide).toBe('SLLR'); // client bought
      expect(clientReport.counterpartySide).toBe('BUYR');
      expect(firmReport.otherCounterpartyLei).toBe(clientReport.reportingCounterpartyLei);
      // economics match the execution, notional derived not echoed
      expect(firmReport.priceMinor).toBe(trade.executedPriceMinor);
      expect(firmReport.notionalMinor).toBe(trade.executedPriceMinor * 7);
    }).toPass({ timeout: 10_000 });
  });

  test('EMIR reconciliation reports zero unmatched pairs and zero rejected sides', async ({
    request,
  }) => {
    const recon = await (await request.get(`${REG_REPORTING_URL}/reconciliation`)).json();
    expect(recon.emir.pairsUnmatched).toBe(0);
    expect(recon.emir.sidesRejected).toBe(0);
  });
});
