/**
 * SELF-HEALING API CLIENT — a deterministic healing pipeline for API drift.
 *
 * Pipeline: detect → heal → record → escalate.
 *   detect   — an expected response field is missing, or an endpoint 404s
 *   heal     — remap fields via naming-convention normalization, domain
 *              synonyms, then bounded edit distance; retry alternate
 *              endpoint candidates in declared order
 *   record   — every healing event carries a strategy + confidence and is
 *              attached to the test's Allure report, so drift is visible
 *              in reporting, never silently absorbed
 *   escalate — unhealable fields are surfaced in `unhealed`; the attached
 *              self-healing-report.json feeds .github/prompts/heal-tests
 *              so Copilot can codify the fix back into source
 *
 * Healing keeps a drifted-but-compatible API from failing the suite;
 * genuinely breaking drift still fails fast, with a report explaining why.
 */
import type { APIRequestContext, TestInfo } from '@playwright/test';

export type HealingStrategy =
  'endpoint-fallback' | 'field-convention' | 'field-synonym' | 'field-fuzzy';

export interface HealingEvent {
  endpoint: string;
  strategy: HealingStrategy;
  healed: string;
  from: string;
  confidence: number;
}

export interface HealedResponse {
  status: number;
  body: Record<string, unknown>;
  /** Expected fields that no strategy could recover — the escalation signal. */
  unhealed: string[];
}

/** Collapse naming conventions: executedPriceMinor / executed_price_minor / EXECUTED-PRICE-MINOR → executedpriceminor */
const canon = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Domain vocabulary drift we have seen or expect — keyed by canonical expected name. */
const SYNONYMS: Record<string, readonly string[]> = {
  quantity: ['qty', 'units', 'shares'],
  executedpriceminor: ['priceminor', 'executedprice', 'fillpriceminor'],
  accountid: ['account', 'acctid'],
  status: ['state', 'tradestatus', 'orderstatus'],
  symbol: ['ticker', 'instrument'],
};

/** Small, bounded Levenshtein — last-resort matching for typo-level drift. */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

export class SelfHealingApiClient {
  readonly events: HealingEvent[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly testInfo: TestInfo,
  ) {}

  /**
   * POST to the first endpoint candidate that answers with a non-404, then
   * heal the response body against the fields the test expects.
   */
  async post(
    candidates: readonly string[],
    data: unknown,
    expectedFields: readonly string[],
  ): Promise<HealedResponse> {
    return this.send('POST', candidates, data, expectedFields);
  }

  async get(
    candidates: readonly string[],
    expectedFields: readonly string[],
  ): Promise<HealedResponse> {
    return this.send('GET', candidates, undefined, expectedFields);
  }

  private async send(
    method: 'GET' | 'POST',
    candidates: readonly string[],
    data: unknown,
    expectedFields: readonly string[],
  ): Promise<HealedResponse> {
    let status = 404;
    let raw: Record<string, unknown> = {};
    for (const [i, path] of candidates.entries()) {
      const res =
        method === 'POST' ? await this.request.post(path, { data }) : await this.request.get(path);
      status = res.status();
      if (status === 404 && i < candidates.length - 1) continue; // route moved? try next declared candidate
      raw = (await res.json()) as Record<string, unknown>;
      if (i > 0) {
        this.events.push({
          endpoint: path,
          strategy: 'endpoint-fallback',
          healed: path,
          from: candidates[0],
          confidence: 0.9,
        });
      }
      return { status, ...this.healFields(raw, expectedFields, path) };
    }
    return { status, body: raw, unhealed: [...expectedFields] };
  }

  private healFields(
    raw: Record<string, unknown>,
    expectedFields: readonly string[],
    endpoint: string,
  ): { body: Record<string, unknown>; unhealed: string[] } {
    const body: Record<string, unknown> = { ...raw };
    const unhealed: string[] = [];
    const byCanon = new Map(Object.keys(raw).map((k) => [canon(k), k]));

    for (const field of expectedFields) {
      if (field in body) continue; // no drift
      const target = canon(field);

      // 1. same name, different naming convention (snake_case, kebab, casing)
      const conventional = byCanon.get(target);
      if (conventional) {
        this.heal(body, raw, field, conventional, 'field-convention', 0.95, endpoint);
        continue;
      }
      // 2. known domain synonym
      const synonym = (SYNONYMS[target] ?? []).find((s) => byCanon.has(s));
      if (synonym) {
        this.heal(body, raw, field, byCanon.get(synonym) as string, 'field-synonym', 0.8, endpoint);
        continue;
      }
      // 3. typo-level drift — bounded edit distance, best match only
      const fuzzy = [...byCanon.keys()]
        .map((k) => ({ k, d: editDistance(target, k) }))
        .filter(({ d }) => d > 0 && d <= 2)
        .sort((a, b) => a.d - b.d)[0];
      if (fuzzy) {
        this.heal(body, raw, field, byCanon.get(fuzzy.k) as string, 'field-fuzzy', 0.6, endpoint);
        continue;
      }
      unhealed.push(field); // escalation: nothing plausible in the response
    }
    return { body, unhealed };
  }

  private heal(
    body: Record<string, unknown>,
    raw: Record<string, unknown>,
    field: string,
    from: string,
    strategy: HealingStrategy,
    confidence: number,
    endpoint: string,
  ): void {
    body[field] = raw[from];
    this.events.push({ endpoint, strategy, healed: field, from, confidence });
  }

  /** Attach the healing report to the test (visible in the Allure report). */
  async attachReport(): Promise<void> {
    if (this.events.length === 0) return;
    await this.testInfo.attach('self-healing-report.json', {
      body: JSON.stringify(
        {
          test: this.testInfo.title,
          verdict:
            'API drift healed — codify these mappings in source, then remove them from SYNONYMS',
          events: this.events,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    this.testInfo.annotations.push({
      type: 'self-healing',
      description: `${this.events.length} healing event(s) — schema drift detected, see self-healing-report.json`,
    });
  }
}
