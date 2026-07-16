/**
 * SFTR END-TO-END VALIDATION — securities-financing reporting integrity
 * across the wired stack. What only e2e proves for SFTR: a real execution
 * produces a MATCHED dual-sided stock-loan pair with consistent loan AND
 * collateral legs under its own UTI (distinct from the EMIR one). Field
 * rules live in the SFTR regression pack; pairing taxonomy in
 * sftrPairing.test.ts — neither is re-tested here.
 */
import { expect, test } from '@playwright/test';

const REG_REPORTING_URL = process.env.REG_REPORTING_URL ?? 'http://localhost:3004';

test.describe('SFTR reporting — end-to-end financing-leg integrity', () => {
  test('an executed trade produces a MATCHED GIVE/TAKE pair with covered collateral', async ({
    request,
  }) => {
    const accountId = `acc-e2e-sftr-${Date.now()}`;

    const tradeRes = await request.post('/trades', {
      data: { accountId, symbol: 'MSFT', quantity: 4, side: 'BUY' },
    });
    expect(tradeRes.status()).toBe(201);
    const trade = await tradeRes.json();

    await expect(async () => {
      const res = await request.get(`${REG_REPORTING_URL}/sftr/reports?accountId=${accountId}`);
      const { pairs } = await res.json();
      expect(pairs).toHaveLength(1); // exactly one pair — uniqueness
      const [stored] = pairs;

      expect(stored.pairing).toEqual({ status: 'MATCHED' });
      expect(stored.violations).toEqual({ firm: [], client: [] });

      const { firmReport, clientReport } = stored.pair;
      // one UTI, two views; securities lender GIVEs, borrower TAKEs
      expect(firmReport.uti).toBe(clientReport.uti);
      expect(firmReport.counterpartySide).toBe('GIVE');
      expect(clientReport.counterpartySide).toBe('TAKE');
      // financing legs derived from the executed economics
      expect(firmReport.securityIsin).toBe('US5949181045'); // MSFT — enrichment
      expect(firmReport.loanValueMinor).toBe(trade.executedPriceMinor * 4);
      expect(firmReport.collateralMarketValueMinor).toBeGreaterThanOrEqual(
        firmReport.loanValueMinor,
      );
      // consistent master agreement for a stock loan
      expect(firmReport.sftType).toBe('SLEB');
      expect(firmReport.masterAgreementType).toBe('GMSLA');
    }).toPass({ timeout: 10_000 });
  });

  test('SFTR reconciliation reports zero unmatched pairs and zero rejected sides', async ({
    request,
  }) => {
    const recon = await (await request.get(`${REG_REPORTING_URL}/reconciliation`)).json();
    expect(recon.sftr.pairsUnmatched).toBe(0);
    expect(recon.sftr.sidesRejected).toBe(0);
  });
});
