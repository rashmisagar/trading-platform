/**
 * EMIR (REFIT) FIELD-VALIDATION REGRESSION PACK — data-driven from the
 * golden corpus (tests/fixtures/emir-regression-corpus.json), same driver
 * and governance as the MiFID pack: exact rule-ID pinning, a clean-baseline
 * case, and a ratchet so the corpus can only grow.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EmirTradeReport } from '../../src/domain/emirReport.js';
import { validateEmirReport } from '../../src/domain/emirValidators.js';

interface CorpusCase {
  caseId: string;
  description: string;
  mutations: Partial<Record<keyof EmirTradeReport, unknown>>;
  expectRuleIds: string[];
}

const corpus = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../fixtures/emir-regression-corpus.json'),
    'utf8',
  ),
) as { baseline: EmirTradeReport; cases: CorpusCase[] };

const AS_OF = new Date('2026-02-01T00:00:00.000Z');

describe('EMIR REFIT field-validation regression pack', () => {
  it.each(corpus.cases)('$caseId — $description', ({ mutations, expectRuleIds }) => {
    const report = { ...corpus.baseline, ...mutations } as EmirTradeReport;

    const ruleIds = validateEmirReport(report, AS_OF)
      .map((v) => v.ruleId)
      .sort();

    expect(ruleIds).toEqual([...expectRuleIds].sort());
  });

  it('corpus governance: case IDs are unique and coverage never shrinks', () => {
    const ids = corpus.cases.map((c) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
    // Ratchet: raise this floor when adding cases, never lower it.
    expect(corpus.cases.length).toBeGreaterThanOrEqual(14);
  });
});
