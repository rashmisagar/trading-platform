---
mode: agent
description: 'Close the self-healing loop: codify healed API drift back into source'
---

The test suite's self-healing layer (`tests/e2e/lib/selfHealing.ts`) has recorded drift.
Close the loop — healing is a bridge, not a destination.

1. Collect the evidence: `self-healing-report.json` attachments in the latest Allure
   report (CI artifact or https://rashmisagar.github.io/trading-platform/), or run
   `npm run test:e2e` locally and check test attachments.
2. For each healing event, decide which side is right:
   - **Provider drifted intentionally** → update the consumer: test expectations, the
     Pact contract in `services/trade/tests/contract/`, and `tests/e2e/api-catalog.json`.
   - **Provider drifted accidentally** → the healing event is a bug report; fix the
     provider instead and leave the tests alone.
3. Once codified, remove the now-unnecessary synonym from `SYNONYMS` in
   `tests/e2e/lib/selfHealing.ts` so future drift on that field is loud again.
4. Run `npm run test:e2e` and confirm zero healing events remain, then summarize what
   drifted, what you changed, and why.
