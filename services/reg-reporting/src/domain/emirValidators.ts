/**
 * EMIR (REFIT) field validators. Rule IDs follow the table structure —
 * EMIR-T1F* = counterparty data, EMIR-T2F* = common data (field numbers
 * indicative of the REFIT tables). Same contract as the MiFID validator:
 * pure, returns EVERY violation, and the regression corpus asserts on the
 * exact rule IDs so no rule can silently vanish. The mechanically shared
 * UTI/counterparty rules live in validators.ts; regime-specific rules stay
 * here.
 */
import type { EmirTradeReport } from './emirReport.js';
import {
  isValidIsin,
  isValidTradingDateTime,
  validateUtiAndCounterparties,
  type RuleViolation,
} from './validators.js';

export function validateEmirReport(
  report: EmirTradeReport,
  now: Date = new Date(),
): RuleViolation[] {
  const violations: RuleViolation[] = validateUtiAndCounterparties(report, {
    utiFormat: 'EMIR-T2F1-UTI-FORMAT',
    utiPrefix: 'EMIR-T2F1-UTI-PREFIX',
    reportingLei: 'EMIR-T1F4-LEI-CHECKSUM',
    otherLei: 'EMIR-T1F9-LEI-CHECKSUM',
    selfDealing: 'EMIR-T1F14-SELF-DEALING',
  });
  const add = (ruleId: string, field: string, message: string): void => {
    violations.push({ ruleId, field, message });
  };

  if (report.counterpartySide !== 'BUYR' && report.counterpartySide !== 'SLLR')
    add('EMIR-T1F17-SIDE', 'counterpartySide', 'side must be BUYR or SLLR');
  if (!isValidTradingDateTime(report.executionTimestamp, now))
    add(
      'EMIR-T2F42-TIMESTAMP',
      'executionTimestamp',
      'executionTimestamp must be UTC ISO-8601 with seconds granularity, not in the future',
    );
  if (!isValidIsin(report.isin)) add('EMIR-T2F7-ISIN-CHECKSUM', 'isin', 'ISIN fails ISO 6166');
  if (!Number.isSafeInteger(report.quantity) || report.quantity <= 0)
    add('EMIR-T2F5-QUANTITY', 'quantity', 'quantity must be a positive integer');
  if (!Number.isSafeInteger(report.priceMinor) || report.priceMinor <= 0)
    add('EMIR-T2F4-PRICE', 'priceMinor', 'price must be positive integer minor units');
  if (
    Number.isSafeInteger(report.notionalMinor) &&
    report.notionalMinor !== report.priceMinor * report.quantity
  )
    add(
      'EMIR-T2F10-NOTIONAL-CONSISTENCY',
      'notionalMinor',
      'notional must equal price × quantity in minor units',
    );

  return violations;
}
