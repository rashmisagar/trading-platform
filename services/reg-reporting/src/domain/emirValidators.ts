/**
 * EMIR (REFIT) field validators. Rule IDs follow the table structure —
 * EMIR-T1F* = counterparty data, EMIR-T2F* = common data (field numbers
 * indicative of the REFIT tables). Same contract as the MiFID validator:
 * pure, returns EVERY violation, and the regression corpus asserts on the
 * exact rule IDs so no rule can silently vanish.
 */
import type { EmirTradeReport } from './emirReport.js';
import {
  isValidIsin,
  isValidLei,
  isValidTradingDateTime,
  type RuleViolation,
} from './validators.js';

const UTI_PATTERN = /^[A-Z0-9]{1,52}$/;

export function validateEmirReport(
  report: EmirTradeReport,
  now: Date = new Date(),
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const add = (ruleId: string, field: string, message: string): void => {
    violations.push({ ruleId, field, message });
  };

  if (!UTI_PATTERN.test(report.uti)) {
    add('EMIR-T2F1-UTI-FORMAT', 'uti', 'UTI must be 1–52 uppercase alphanumeric characters');
  } else if (!isValidLei(report.uti.slice(0, 20))) {
    add('EMIR-T2F1-UTI-PREFIX', 'uti', 'UTI must begin with the generating entity LEI (ISO 17442)');
  }
  if (!isValidLei(report.reportingCounterpartyLei))
    add(
      'EMIR-T1F4-LEI-CHECKSUM',
      'reportingCounterpartyLei',
      'reporting counterparty LEI fails ISO 17442',
    );
  if (!isValidLei(report.otherCounterpartyLei))
    add('EMIR-T1F9-LEI-CHECKSUM', 'otherCounterpartyLei', 'other counterparty LEI fails ISO 17442');
  if (
    isValidLei(report.reportingCounterpartyLei) &&
    report.reportingCounterpartyLei === report.otherCounterpartyLei
  )
    add(
      'EMIR-T1F14-SELF-DEALING',
      'otherCounterpartyLei',
      'reporting and other counterparty must differ',
    );
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
