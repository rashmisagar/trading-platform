# Coding & Testing Standards

Every rule here maps to something enforced in this repo — a gate is only worth having if
the thing it checks is enforced consistently. References point at real files.

## 1. Repository & branching

- **Trunk-based development**: short-lived branches (< 2 days) merged to `main` via PR.
- **Branch protection on `main`**: all CI gates required, ≥ 2 approving reviews, no
  force-push, signed commits (`git commit -S`) for audit traceability.
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
- **CODEOWNERS** on `pacts/` and each `tests/contract/` directory — a contract change
  needs sign-off from both the consuming and providing team.

## 2. TypeScript standards (enforced by Gate 1)

| Concern | Enforcement |
|---|---|
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | `tsconfig.base.json`, checked by `tsc --noEmit` |
| `any` banned | `@typescript-eslint/no-explicit-any: error` in `eslint.config.js` |
| Explicit return types on functions | eslint rule (relaxed in tests) |
| Formatting | Prettier, `format:check` in CI |
| Runtime validation of ALL external input | `zod` schema at every boundary — HTTP body, params, and **upstream responses** (see `clients/*.ts`: a malformed upstream body is treated as unavailable, never trusted) |

**Finance-specific, non-negotiable:**
- **Money is integer minor units, never floats.** `moneyMinor()` throws on non-integers,
  and there's a unit test asserting that (`money.test.ts`). Position math stays in integers
  end to end — no drift, ever.
- **Idempotency keys on every mutating call.** trade generates one per trade; portfolio
  enforces it inside a DB transaction (`applied_deltas` + `ON CONFLICT DO NOTHING`), so a
  retry can never double-book. Tested at unit, integration (DB-level), and implicitly at e2e.
- **Fail closed.** Price unavailable/slow/malformed ⇒ trade rejected (503), never executed.
  Asserted at unit (mocked), integration (real timeout over real sockets), and component
  (real container, WireMock delay) levels — the same invariant, proven at three costs.
- **UTC ISO-8601 timestamps everywhere.**
- No bare `catch` that swallows and continues in money paths — map to an explicit error
  result (`QuoteResult`, `ApplyResult` discriminated unions, not thrown strings).

## 3. Test-writing standards (Gates 2–7)

**Layout — the pyramid is visible in the directory tree:**
```
services/<svc>/tests/unit          Gate 2 — no I/O
services/<svc>/tests/integration   Gate 3 — ONE real dependency
services/<svc>/tests/contract      Gate 4 — Pact (consumer in trade, provider in the others)
tests/component                    Gate 6 — real container, stubbed world
tests/e2e                          Gate 7 — Playwright, curated journeys only
tests/performance                  Gate 7 + nightly — k6
```

- **One behaviour per test; the name states the behaviour**:
  `'FAILS CLOSED: market data unavailable → 503 and portfolio is NEVER called'`.
- **Domain logic → sociable unit tests** (`tradeValidator.test.ts`, `position.test.ts`);
  **orchestration → mockist unit tests** asserting interactions (`trade/tests/unit/app.test.ts`).
- **No sleeps.** Async assertions poll: Playwright `expect(...).toPass({ timeout })`.
  One CI retry in `playwright.config.ts` absorbs rare timing noise — flaky tests get fixed
  or deleted, never retried into silence.
- **Integration tests skip gracefully** when their dependency is absent
  (`describe.skipIf` in `pgPositionRepo.test.ts`) so local runs never mysteriously fail —
  CI always provides the dependency, so nothing is silently skipped where it matters.
- **Component tests cover failure modes, not just happy paths**: upstream timeout,
  malformed body, and the "rejected trade must not touch portfolio" negative assertion
  (verified via WireMock's request journal).
- **New service boundary ⇒ new contract test, in the same PR.** A stub with no contract
  behind it is a silent production risk; review rejects it.
- **E2E stays tiny** — three journeys. Anything more belongs at a cheaper level.
- **Test data is synthetic** and generated per-run (`acc-e2e-${Date.now()}`) — no shared
  fixtures between runs, no production data below production, ever.

## 4. Contract standards (Gate 4)

- Consumer tests declare **only the fields the consumer uses**, shape-matched
  (`like`, `integer`), not value-matched — providers stay free to change data, but any
  field rename/removal/type change breaks verification.
- Provider verification runs against the **real app** with provider states
  (`stateHandlers`) and the **in-memory repo** — contracts verify the interface, not
  persistence (that's the integration suite's job).
- This repo hands pacts from consumer to provider via a CI artifact (zero-infra,
  single-repo). In a multi-repo estate: publish to a **Pact Broker**, verify from the
  broker in each provider's own pipeline, and gate every deploy with `can-i-deploy`.
- An intentional breaking change: version the endpoint, migrate consumers, then remove —
  never break a verified contract in place.

## 5. Performance standards (Gate 7 + nightly)

- **Thresholds are percentiles (p95/p99), never averages** — the tail breaches SLAs.
- **Smoke** (tight thresholds, tiny load) runs on every merge; **load** and **spike** run
  nightly, off the PR path.
- Spike assertion is **graceful degradation**: shedding with 4xx is a pass, any 5xx is a
  fail, and the ramp-down stage proves recovery.
- Keep SLOs in a checked-in file per service and generate k6 thresholds from it, so the
  documented SLO and the enforcing gate can't drift apart.

## 6. Pipeline standards

- **Cheapest gates first, hard `needs:` ordering** — the pipeline shape IS the pyramid.
- **`fail-fast: false` on test matrices** — one service's failure shouldn't hide another's.
- **Logs dumped on failure** for every containerized gate (`docker compose logs`), and
  Playwright traces retained on failure — a red gate you can't diagnose is a gate people
  learn to re-run instead of fix.
- **Teardown `if: always()`** — no leaked containers between runs.
- **`concurrency` with `cancel-in-progress`** — pushes to the same branch supersede stale runs.
- Deploy only from `main`, behind a protected environment with required reviewers.
