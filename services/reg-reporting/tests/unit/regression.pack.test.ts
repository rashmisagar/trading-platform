/**
 * MiFID II RTS 22 FIELD-VALIDATION REGRESSION PACK — data-driven from the
 * golden corpus (tests/fixtures/mifid-regression-corpus.json).
 *
 * Every case mutates one aspect of a known-good baseline report and pins the
 * EXACT rule IDs raised, so:
 *  - a validator rule can never silently vanish (case starts failing),
 *  - a new rule can never accidentally fire on clean reports (MIFID-REG-001),
 *  - every production reporting incident becomes a permanent corpus case.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MifidTransactionReport } from '../../src/domain/mifidReport.js';
import { validateMifidReport } from '../../src/domain/validators.js';

interface CorpusCase {
  caseId: string;
  description: string;
  mutations: Partial<Record<keyof MifidTransactionReport, unknown>>;
  expectRuleIds: string[];
}

const corpus = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../fixtures/mifid-regression-corpus.json'),
    'utf8',
  ),
) as { baseline: MifidTransactionReport; cases: CorpusCase[] };

// The corpus is timeless: validate as-of a fixed instant after the baseline
// trade date, so "future timestamp" cases stay deterministic forever.
const AS_OF = new Date('2026-02-01T00:00:00.000Z');

describe('MiFID II RTS 22 field-validation regression pack', () => {
  it.each(corpus.cases)('$caseId — $description', ({ mutations, expectRuleIds }) => {
    const report = { ...corpus.baseline, ...mutations } as MifidTransactionReport;

    const ruleIds = validateMifidReport(report, AS_OF)
      .map((v) => v.ruleId)
      .sort();

    expect(ruleIds).toEqual([...expectRuleIds].sort());
  });

  it('corpus governance: case IDs are unique and sequential coverage never shrinks', () => {
    const ids = corpus.cases.map((c) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
    // Ratchet: the pack only ever grows. Raise this floor when adding cases.
    expect(corpus.cases.length).toBeGreaterThanOrEqual(14);
  });
});
