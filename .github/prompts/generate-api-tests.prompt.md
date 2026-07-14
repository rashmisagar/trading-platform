---
mode: agent
description: 'Probe the running stack with Playwright MCP and extend the generated API test suite'
---

Extend this project's generated API tests. Follow `.github/copilot-instructions.md`.

1. Ensure the stack is running (`docker compose -f docker-compose.e2e.yml up -d`;
   trade :3003, portfolio :3002, market-data :3001) — start it if it isn't.
2. Using the **playwright MCP server**, probe the API surface for behaviours not yet
   captured in `tests/e2e/api-catalog.json`: try unknown symbols, missing/extra body
   fields, wrong types, both `side` values, repeated idempotent calls. Record the
   actual status codes and response shapes you observe — never guess.
3. Add what you learned to `tests/e2e/api-catalog.json` (new endpoints, invariants,
   rejected-status ranges). Do not edit files under `tests/e2e/tests/generated/`.
4. Run `npm run generate:tests` and review the regenerated spec diff.
5. For journey-shaped behaviours that don't fit the catalog's invariant model, write a
   handcrafted spec in `tests/e2e/tests/` using the `healing` fixture from
   `tests/e2e/lib/fixtures.ts`.
6. Run the suite (`npm run test:e2e`) and report which new behaviours are now covered.
