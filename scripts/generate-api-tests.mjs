#!/usr/bin/env node
/**
 * INTELLIGENT TEST GENERATION — derives boundary tests from the API catalog.
 *
 * The catalog (tests/e2e/api-catalog.json) declares the API surface and the
 * domain invariants; this generator turns each invariant into the boundary
 * probes a reviewer would ask for — including probing the EXACT notional
 * boundary computed from the live reference price at runtime, so the tests
 * stay correct when prices change.
 *
 * Deterministic by design: same catalog in, same spec out — safe to commit,
 * diff, and regenerate in CI. The AI-driven path (GitHub Copilot + Playwright
 * MCP, .github/prompts/generate-api-tests.prompt.md) extends the CATALOG,
 * not the generated files.
 *
 * Usage: npm run generate:tests
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'tests/e2e/api-catalog.json'), 'utf8'));

const trade = catalog.services['trade'];
const marketData = catalog.services['market-data'];
const { maxNotionalMinor, sides } = trade.invariants;
const symbol = marketData.referenceSymbol;

const header = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: tests/e2e/api-catalog.json · Regenerate: npm run generate:tests
 *
 * Boundary probes derived from the catalog's invariants. The notional
 * boundary is computed from the LIVE ${symbol} price at runtime, so these
 * tests probe the exact limit no matter what the price source returns.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const MARKET_DATA_URL = process.env.${marketData.baseUrlEnv} ?? '${marketData.defaultBaseUrl}';
const MAX_NOTIONAL_MINOR = ${maxNotionalMinor};

async function maxQuantityAtLimit(request: APIRequestContext): Promise<number> {
  const quote = (await (await request.get(\`\${MARKET_DATA_URL}/prices/${symbol}\`)).json()) as {
    priceMinor: number;
  };
  return Math.floor(MAX_NOTIONAL_MINOR / quote.priceMinor);
}
`;

const cases = [];

// invariant: maxNotionalMinor → probe both sides of the exact boundary, per side
for (const side of sides) {
  cases.push(`
  test('${side} at the exact notional limit executes (boundary from live price)', async ({
    request,
  }) => {
    const quantity = await maxQuantityAtLimit(request);
    const res = await request.post('${trade.endpoints[0].path}', {
      data: { accountId: \`acc-gen-limit-${side.toLowerCase()}-\${Date.now()}\`, symbol: '${symbol}', quantity, side: '${side}' },
    });
    expect(res.status()).toBe(${trade.endpoints[0].success});
    expect((await res.json()).status).toBe('EXECUTED');
  });`);
}
cases.push(`
  test('one share above the notional limit is rejected and books nothing', async ({ request }) => {
    const quantity = (await maxQuantityAtLimit(request)) + 1;
    const res = await request.post('${trade.endpoints[0].path}', {
      data: { accountId: \`acc-gen-over-\${Date.now()}\`, symbol: '${symbol}', quantity, side: 'BUY' },
    });
    expect(${JSON.stringify(trade.endpoints[0].rejected)}).toContain(res.status());
  });`);

// invariant: quantityRule positive-safe-integer → degenerate quantities must be rejected
for (const [label, quantity] of [
  ['fractional', 2.5],
  ['zero', 0],
  ['negative', -3],
]) {
  cases.push(`
  test('${label} quantity (\`${quantity}\`) is rejected', async ({ request }) => {
    const res = await request.post('${trade.endpoints[0].path}', {
      data: { accountId: \`acc-gen-${label}-\${Date.now()}\`, symbol: '${symbol}', quantity: ${quantity}, side: 'BUY' },
    });
    expect(${JSON.stringify(trade.endpoints[0].rejected)}).toContain(res.status());
  });`);
}

const spec = `${header}
test.describe('trade API — generated boundary probes (from api-catalog.json)', () => {${cases.join('\n')}
});
`;

const outDir = join(root, 'tests/e2e/tests/generated');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'trade-boundaries.gen.spec.ts');
writeFileSync(outFile, spec);
console.error(`generated ${outFile} (${cases.length} tests)`);
