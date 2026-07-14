# Copilot instructions — trading-platform

Microservice testing reference project (TypeScript, Fastify, Vitest, Playwright API mode,
Pact, k6). Full standards: `docs/STANDARDS.md`. The short version that matters for
generated code:

## Test conventions

- **One behaviour per test; the name states the behaviour.** No sleeps — poll with
  `expect(...).toPass({ timeout })`. Synthetic per-run test data (`acc-…-${Date.now()}`).
- **Money is integer minor units, never floats.** Quantities are positive safe integers.
- The e2e suite stays tiny and journey-focused; boundary/permutation tests belong in
  `tests/e2e/tests/generated/` (see below) or at cheaper levels (unit/component).

## AI-assisted test generation (Playwright MCP)

- `tests/e2e/api-catalog.json` is the machine-readable API surface + invariants and the
  **only** place to add knowledge; `npm run generate:tests` derives boundary specs from it
  into `tests/e2e/tests/generated/*.gen.spec.ts` (generated files: never edit by hand).
- Use the `playwright` MCP server (`.vscode/mcp.json`) to probe the running stack
  (`docker compose -f docker-compose.e2e.yml up -d`, services on :3001/:3002/:3003)
  before proposing catalog changes — verify actual status codes and response shapes.
- Workflow: probe with MCP → extend the catalog → `npm run generate:tests` → review diff.

## Self-healing tests

- API tests that should tolerate benign drift use the `healing` fixture from
  `tests/e2e/lib/fixtures.ts` (a `SelfHealingApiClient`), not raw `request`.
- Healing events surface in Allure as `self-healing-report.json` attachments. When you
  see one: the drift is real — codify the new field/endpoint in the test or contract,
  then remove the healed mapping from `SYNONYMS` in `tests/e2e/lib/selfHealing.ts`.
  Healing is a bridge, not a destination.
- Never "fix" a failing test by weakening its assertions; unhealable drift failing the
  suite is the escalation working as designed.
