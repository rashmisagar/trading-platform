/**
 * Identifier check-digit algorithms — proven against real public identifiers
 * (Apple's LEI/ISIN) plus corruption cases. These two validators are the
 * front line against the most common NACK cause: fat-fingered ref data.
 */
import { describe, expect, it } from 'vitest';
import { isValidIsin, isValidLei, isValidTradingDateTime } from '../../src/domain/validators.js';

describe('LEI validation (ISO 17442, MOD 97-10)', () => {
  it('accepts a real public LEI (Apple Inc)', () => {
    expect(isValidLei('HWUPKR0MPOU8FGXBT394')).toBe(true);
  });
  it('accepts the fictional but checksum-valid test LEIs', () => {
    expect(isValidLei('FINCOGLOBALMARKETS76')).toBe(true);
    expect(isValidLei('CLIENTALPHACAPITAL58')).toBe(true);
  });
  it('rejects a transposed checksum', () => {
    expect(isValidLei('CLIENTALPHACAPITAL85')).toBe(false);
  });
  it('rejects wrong length, lowercase, and embedded symbols', () => {
    expect(isValidLei('FINCOGLOBALMARKETS7')).toBe(false);
    expect(isValidLei('fincoglobalmarkets76')).toBe(false);
    expect(isValidLei('FINCO-GLOBALMARKET76')).toBe(false);
  });
});

describe('ISIN validation (ISO 6166, Luhn over expanded digits)', () => {
  it('accepts real ISINs (Apple, Microsoft)', () => {
    expect(isValidIsin('US0378331005')).toBe(true);
    expect(isValidIsin('US5949181045')).toBe(true);
  });
  it('rejects a corrupted check digit', () => {
    expect(isValidIsin('US0378331006')).toBe(false);
  });
  it('rejects malformed structure', () => {
    expect(isValidIsin('US03783310')).toBe(false); // too short
    expect(isValidIsin('0S0378331005')).toBe(false); // country code must be alpha
    expect(isValidIsin('US037833100A')).toBe(false); // check digit must be numeric
  });
});

describe('tradingDateTime validation (RTS 22 F28)', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  it('accepts UTC ISO-8601 with seconds or millisecond granularity', () => {
    expect(isValidTradingDateTime('2026-01-15T10:30:00Z', now)).toBe(true);
    expect(isValidTradingDateTime('2026-01-15T10:30:00.123Z', now)).toBe(true);
  });
  it('rejects future timestamps, offsets, and missing granularity', () => {
    expect(isValidTradingDateTime('2026-03-01T00:00:00Z', now)).toBe(false); // future
    expect(isValidTradingDateTime('2026-01-15T10:30:00+01:00', now)).toBe(false); // not UTC
    expect(isValidTradingDateTime('2026-01-15T10:30Z', now)).toBe(false); // minutes only
    expect(isValidTradingDateTime('2026-01-15', now)).toBe(false); // date only
  });
});
