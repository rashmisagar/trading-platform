/**
 * MiFID II RTS 22 field validators — pure functions, exhaustively unit-tested.
 * Every rule carries an ID traceable to the RTS 22 Annex I Table 2 field it
 * enforces; the regression corpus asserts on these IDs, so a rule can never
 * silently disappear from the pack.
 */
import type { MifidTransactionReport } from './mifidReport.js';

export interface RuleViolation {
  ruleId: string;
  field: string;
  message: string;
}

const UTI_PATTERN = /^[A-Z0-9]{1,52}$/;

/**
 * Shared dual-sided identifier rules (UTI structure + counterparty LEIs) —
 * mechanically identical across EMIR and SFTR; each regime supplies its own
 * traceable rule IDs so packs and audits stay regime-scoped.
 */
export function validateUtiAndCounterparties(
  report: { uti: string; reportingCounterpartyLei: string; otherCounterpartyLei: string },
  rules: {
    utiFormat: string;
    utiPrefix: string;
    reportingLei: string;
    otherLei: string;
    selfDealing: string;
  },
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!UTI_PATTERN.test(report.uti)) {
    violations.push({
      ruleId: rules.utiFormat,
      field: 'uti',
      message: 'UTI must be 1–52 uppercase alphanumeric characters',
    });
  } else if (!isValidLei(report.uti.slice(0, 20))) {
    violations.push({
      ruleId: rules.utiPrefix,
      field: 'uti',
      message: 'UTI must begin with the generating entity LEI (ISO 17442)',
    });
  }
  if (!isValidLei(report.reportingCounterpartyLei))
    violations.push({
      ruleId: rules.reportingLei,
      field: 'reportingCounterpartyLei',
      message: 'reporting counterparty LEI fails ISO 17442',
    });
  if (!isValidLei(report.otherCounterpartyLei))
    violations.push({
      ruleId: rules.otherLei,
      field: 'otherCounterpartyLei',
      message: 'other counterparty LEI fails ISO 17442',
    });
  if (
    isValidLei(report.reportingCounterpartyLei) &&
    report.reportingCounterpartyLei === report.otherCounterpartyLei
  )
    violations.push({
      ruleId: rules.selfDealing,
      field: 'otherCounterpartyLei',
      message: 'reporting and other counterparty must differ',
    });
  return violations;
}

/**
 * ISO 17442 MOD 97-10 over the full 20 characters (letters → 10..35).
 * Memoized: the same handful of ref-data LEIs is validated ~15× per
 * execution across the three regimes' reports — measurable churn at
 * hundreds of executions/second. Bounded so hostile input can't grow it.
 */
const leiCache = new Map<string, boolean>();
const LEI_CACHE_MAX = 1024;

export function isValidLei(lei: string): boolean {
  const cached = leiCache.get(lei);
  if (cached !== undefined) return cached;
  let valid = false;
  if (/^[A-Z0-9]{20}$/.test(lei)) {
    let remainder = 0;
    for (const ch of lei) {
      const value = /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    valid = remainder === 1;
  }
  if (leiCache.size >= LEI_CACHE_MAX) leiCache.clear();
  leiCache.set(lei, valid);
  return valid;
}

/** ISO 6166 ISIN: 12 chars, Luhn check digit over letter-expanded digits. */
export function isValidIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const expanded = [...isin]
    .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join('');
  let sum = 0;
  let double = true; // start doubling from the rightmost digit - 1
  for (let i = expanded.length - 2; i >= 0; i--) {
    let d = Number(expanded[i]) * (double ? 2 : 1);
    if (d > 9) d -= 9;
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10 === Number(expanded[expanded.length - 1]);
}

/** UTC ISO-8601 with at least seconds granularity, and never in the future. */
export function isValidTradingDateTime(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && parsed <= now.getTime();
}

const TRN_PATTERN = /^[A-Za-z0-9-]{1,52}$/;

/**
 * Validate a built report against the RTS 22 field rules.
 * Returns every violation — regulators reject on ANY, so tests must see ALL.
 */
export function validateMifidReport(
  report: MifidTransactionReport,
  now: Date = new Date(),
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const add = (ruleId: string, field: string, message: string): void => {
    violations.push({ ruleId, field, message });
  };

  if (!TRN_PATTERN.test(report.transactionReferenceNumber))
    add(
      'RTS22-F2-TRN-FORMAT',
      'transactionReferenceNumber',
      'TRN must be 1–52 alphanumeric/hyphen characters',
    );
  if (!isValidLei(report.executingEntityLei))
    add('RTS22-F4-LEI-CHECKSUM', 'executingEntityLei', 'executing entity LEI fails ISO 17442');
  if (!isValidLei(report.buyerLei))
    add('RTS22-F7-LEI-CHECKSUM', 'buyerLei', 'buyer LEI fails ISO 17442');
  if (!isValidLei(report.sellerLei))
    add('RTS22-F16-LEI-CHECKSUM', 'sellerLei', 'seller LEI fails ISO 17442');
  if (!isValidTradingDateTime(report.tradingDateTime, now))
    add(
      'RTS22-F28-TIMESTAMP',
      'tradingDateTime',
      'tradingDateTime must be UTC ISO-8601 with seconds granularity, not in the future',
    );
  if (!Number.isSafeInteger(report.quantity) || report.quantity <= 0)
    add('RTS22-F30-QUANTITY', 'quantity', 'quantity must be a positive integer');
  if (!Number.isSafeInteger(report.priceMinor) || report.priceMinor <= 0)
    add('RTS22-F33-PRICE', 'priceMinor', 'price must be positive integer minor units');
  if (!/^[A-Z]{3}$/.test(report.priceCurrency))
    add('RTS22-F34-CURRENCY', 'priceCurrency', 'currency must be ISO 4217 alpha-3');
  if (!isValidIsin(report.instrumentIsin))
    add('RTS22-F41-ISIN-CHECKSUM', 'instrumentIsin', 'instrument ISIN fails ISO 6166');

  return violations;
}
