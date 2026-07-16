/**
 * SFTR field validators. Rule IDs follow the reporting-table structure —
 * SFTR-T1F* = counterparty data, SFTR-T2F* = loan and collateral data
 * (field numbers indicative). Same contract as the other regimes: pure,
 * returns EVERY violation, corpus-pinned by exact rule ID.
 */
import type { SftrTradeReport } from './sftrReport.js';
import {
  isValidIsin,
  isValidLei,
  isValidTradingDateTime,
  type RuleViolation,
} from './validators.js';

const UTI_PATTERN = /^[A-Z0-9]{1,52}$/;
const SFT_TYPES = ['SLEB', 'REPO', 'BSB', 'MGLD'];

/** Master-agreement linkage — SFTR's distinctive consistency rule. */
const AGREEMENT_FOR_TYPE: Record<string, string> = {
  SLEB: 'GMSLA',
  REPO: 'GMRA',
  BSB: 'GMRA',
};

export function validateSftrReport(
  report: SftrTradeReport,
  now: Date = new Date(),
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const add = (ruleId: string, field: string, message: string): void => {
    violations.push({ ruleId, field, message });
  };

  if (!UTI_PATTERN.test(report.uti)) {
    add('SFTR-T2F1-UTI-FORMAT', 'uti', 'UTI must be 1–52 uppercase alphanumeric characters');
  } else if (!isValidLei(report.uti.slice(0, 20))) {
    add('SFTR-T2F1-UTI-PREFIX', 'uti', 'UTI must begin with the generating entity LEI (ISO 17442)');
  }
  if (!isValidLei(report.reportingCounterpartyLei))
    add(
      'SFTR-T1F3-LEI-CHECKSUM',
      'reportingCounterpartyLei',
      'reporting counterparty LEI fails ISO 17442',
    );
  if (!isValidLei(report.otherCounterpartyLei))
    add(
      'SFTR-T1F11-LEI-CHECKSUM',
      'otherCounterpartyLei',
      'other counterparty LEI fails ISO 17442',
    );
  if (
    isValidLei(report.reportingCounterpartyLei) &&
    report.reportingCounterpartyLei === report.otherCounterpartyLei
  )
    add(
      'SFTR-T1F11-SELF-DEALING',
      'otherCounterpartyLei',
      'reporting and other counterparty must differ',
    );
  if (report.counterpartySide !== 'GIVE' && report.counterpartySide !== 'TAKE')
    add('SFTR-T1F9-SIDE', 'counterpartySide', 'side must be GIVE or TAKE');
  if (!SFT_TYPES.includes(report.sftType))
    add('SFTR-T2F5-SFT-TYPE', 'sftType', 'SFT type must be one of SLEB, REPO, BSB, MGLD');
  else {
    const required = AGREEMENT_FOR_TYPE[report.sftType];
    if (required !== undefined && report.masterAgreementType !== required)
      add(
        'SFTR-T2F9-MASTER-AGREEMENT-CONSISTENCY',
        'masterAgreementType',
        `${report.sftType} must be documented under ${required}`,
      );
  }
  if (!isValidTradingDateTime(report.executionTimestamp, now))
    add(
      'SFTR-T2F12-TIMESTAMP',
      'executionTimestamp',
      'executionTimestamp must be UTC ISO-8601 with seconds granularity, not in the future',
    );
  if (!isValidIsin(report.securityIsin))
    add('SFTR-T2F41-ISIN-CHECKSUM', 'securityIsin', 'security ISIN fails ISO 6166');
  if (!Number.isSafeInteger(report.quantity) || report.quantity <= 0)
    add('SFTR-T2F83-QUANTITY', 'quantity', 'quantity must be a positive integer');
  if (!Number.isSafeInteger(report.priceMinor) || report.priceMinor <= 0)
    add('SFTR-T2F84-PRICE', 'priceMinor', 'price must be positive integer minor units');
  if (
    Number.isSafeInteger(report.loanValueMinor) &&
    report.loanValueMinor !== report.priceMinor * report.quantity
  )
    add(
      'SFTR-T2F86-LOAN-VALUE-CONSISTENCY',
      'loanValueMinor',
      'loan value must equal price × quantity in minor units',
    );
  if (
    Number.isSafeInteger(report.collateralMarketValueMinor) &&
    report.collateralMarketValueMinor < report.loanValueMinor
  )
    add(
      'SFTR-T2F88-COLLATERAL-COVERAGE',
      'collateralMarketValueMinor',
      'collateral market value must cover the loan value (haircut ≥ 0)',
    );

  return violations;
}
