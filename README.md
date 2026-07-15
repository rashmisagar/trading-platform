# Trading Platform — Microservice Testing Reference Project

A small but **fully runnable** finance/investment microservices system built to demonstrate
every testing level from [Testing Strategies in a Microservice Architecture](https://martinfowler.com/articles/microservice-testing/)
(Toby Clemson, martinfowler.com), wired into a working GitHub Actions pipeline with quality
gates in test-pyramid order.

**Stack:** TypeScript · Node 20 · Fastify · Vitest · Pact · WireMock · Playwright · k6 · Docker Compose · GitHub Actions

---

## Architecture — annotated with test levels

```
        ┌──────────────────────────────────────────────────────────────┐
        │  E2E SCOPE (Playwright, docker-compose.e2e.yml)              │
        │  3 curated journeys: buy→position, buy+sell→flat, reject     │
        │                                                              │
        │                    ┌───────────────┐                         │
        │   POST /trades ───▶│     trade     │  ← unit: validator      │
        │                    │ (orchestrator)│    (sociable) +         │
        │                    └──────┬────┬───┘    orchestration        │
        │                           │    │        (mockist)            │
        │        CONTRACT (Pact)    │    │    CONTRACT (Pact)          │
        │        trade-market-data  │    │    trade-portfolio          │
        │        .json              │    │    .json                    │
        │                           ▼    ▼                             │
        │              ┌────────────┐  ┌────────────┐                  │
        │              │market-data │  │ portfolio  │ ← unit: position │
        │              │            │  │            │   math, idempo-  │
        │              └────────────┘  └─────┬──────┘   tency          │
        │               ↑ unit: money,       │                         │
        │                 price lookup       │ INTEGRATION             │
        │                                    ▼ (real Postgres)         │
        │                              ┌──────────┐                    │
        │                              │ Postgres │                    │
        │                              └──────────┘                    │
        └──────────────────────────────────────────────────────────────┘

  COMPONENT (per service): the real container driven via its public API,
  everything outside it replaced by WireMock / disposable Postgres
  (docker-compose.component.yml).

  INTEGRATION (trade side): its HTTP clients tested over real sockets against
  a local stub server — real timeouts, real serialization, real status codes.

  PERFORMANCE (k6): smoke on every merge (CI), load + spike nightly.
```

### Why each boundary gets the test level it does

| Boundary                                              | Level                | Why this level and not another                                                                                                                          |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside each service (validator, position math, money) | **Unit**             | Cheapest place to catch a logic bug; domain gets sociable tests, orchestration gets mockist tests                                                       |
| trade's HTTP clients ↔ real sockets                   | **Integration**      | Timeout, serialization, and status-mapping bugs only exist over a real connection — mocks can't catch them                                              |
| portfolio ↔ Postgres                                  | **Integration**      | Proves the SQL: precision, idempotency at the DB level, `FOR UPDATE` concurrency                                                                        |
| trade ↔ market-data, trade ↔ portfolio                | **Contract (Pact)**  | We own both sides' pipelines; the failure mode is _the provider changing its API_, and provider verification catches that pre-deploy                    |
| Each whole service via its public API                 | **Component**        | Acceptance test for the service in isolation: real container, stubbed world — including failure modes (timeout ⇒ fail closed, malformed upstream ⇒ 503) |
| The full wired system                                 | **E2E (Playwright)** | Three curated journeys only — proves the real wiring, doesn't re-test logic                                                                             |
| trade's public API under load                         | **Performance (k6)** | Smoke in CI; load (SLO percentiles) + spike (graceful degradation) nightly                                                                              |

---

## The services

| Service         | Port | Responsibility                                                                                                                                                              | Data                                             |
| --------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `market-data`   | 3001 | `GET /prices/:symbol` — quotes in integer minor units                                                                                                                       | none (static source)                             |
| `portfolio`     | 3002 | `POST /positions/apply`, `GET /positions/:accountId` — idempotent position keeping                                                                                          | owns Postgres                                    |
| `trade`         | 3003 | `POST /trades` — prices via market-data, validates (notional limit), books via portfolio                                                                                    | none (stateless orchestrator)                    |
| `reg-reporting` | 3004 | `POST /executions`, `GET /reports/:trn`, `GET /reconciliation` — MiFID II (RTS 22) transaction reporting: enrichment, field validation, ARM ACK/NACK, duplicate suppression | in-memory (outbox + durable store in production) |

Finance-specific behaviours baked in (and tested):

- **Money is integer minor units** — constructing money from a float throws (`money.test.ts`).
- **Idempotency keys on every booking** — a retried trade can never double-book, enforced at the DB level (`pgPositionRepo.test.ts`).
- **Fail closed** — if market-data is slow/unavailable/malformed, the trade is rejected, never executed against a guessed price (`app.test.ts`, component suite).

## The pipeline (.github/workflows/ci.yml)

```
GATE 1  lint + prettier + tsc --noEmit        seconds
GATE 2  unit tests (×3 services, parallel)    ~seconds
GATE 3  integration (real Postgres service)   ~1 min
GATE 4a contract consumer (trade → pacts/)    ~seconds
GATE 4b contract provider verification (×2)   ~seconds
GATE 5  docker build (all images)             ~min
GATE 6  component (containers + WireMock)     ~1–2 min
GATE 7  e2e stack up → Playwright + k6 smoke  ~2 min
GATE 8  deploy (main only, protected env)     placeholder
```

Nightly (`.github/workflows/nightly-performance.yml`): k6 **load** (SLO percentiles
p95/p99) and **spike** (market-open step; graceful degradation asserted, 5xx = fail).

## Test report (Allure)

Every Vitest suite (unit, integration, contract, component) and the Playwright e2e
suite write [Allure](https://allurereport.org/) results. CI aggregates them across all
gates into a single report — it runs **even when gates fail**, since a red run is
exactly when you want the report:

- **On `main`**: published to GitHub Pages with trend history across runs —
  <https://rashmisagar.github.io/trading-platform/>
- **On PRs**: attached to the workflow run as a downloadable `allure-report` artifact.

Locally (needs Java for the Allure CLI — `brew install openjdk`):

```bash
npm run report:generate   # collect all workspaces' results + build the report
npm run report:open       # serve it in a browser
```

## AI-assisted testing: generation & self-healing

Two capabilities layered onto the e2e suite (demo specs in `tests/e2e/tests/`):

**Intelligent test generation.** `tests/e2e/api-catalog.json` declares the API surface
and domain invariants; `npm run generate:tests` deterministically derives boundary
specs from it (`tests/e2e/tests/generated/*.gen.spec.ts`) — including probing the
_exact_ notional limit computed from the live reference price at runtime. The AI path
extends the **catalog**, not the generated files: the `playwright` MCP server
(`.vscode/mcp.json`) lets GitHub Copilot's agent mode probe the running stack, record
real status codes/shapes into the catalog, and regenerate — reusable prompt in
`.github/prompts/generate-api-tests.prompt.md`.

**Self-healing pipeline** (detect → heal → record → escalate). Tests using the
`healing` fixture (`tests/e2e/lib/fixtures.ts`) survive benign API drift — renamed
fields (naming-convention normalization, domain synonyms, bounded fuzzy match) and
relocated endpoints (declared candidate fallback). Every healing event carries a
strategy + confidence and is attached to the Allure report as
`self-healing-report.json` — drift is absorbed but never silent. Unhealable drift
fails fast; `.github/prompts/heal-tests.prompt.md` walks Copilot through codifying
healed drift back into contracts/tests so healing stays a bridge, not a destination.

### Running them

```bash
# Self-healing pipeline demo — fully self-contained, no stack needed:
# spins up a deliberately drifted trade API in-process and heals against it
npm run test:e2e -- self-healing

# Regenerate boundary specs from the catalog (deterministic; review the diff)
npm run generate:tests

# Generated specs run as part of the normal e2e suite (stack must be up —
# docker compose -f docker-compose.e2e.yml up -d, or the no-Docker tsx path below)
npm run test:e2e -- generated
```

In CI, both ride **Gate 7** unchanged: the self-healing demos and generated specs live
in `tests/e2e/tests/`, so the existing e2e job picks them up, and healing reports land
in the published Allure report automatically.

The interactive path needs VS Code + GitHub Copilot: `.vscode/mcp.json` auto-configures
the Playwright MCP server, and the repo ships two workspace prompts —
`/generate-api-tests` (probe the running stack, extend the catalog, regenerate) and
`/heal-tests` (turn recorded healing events into codified contract/test fixes). Both
follow the conventions in `.github/copilot-instructions.md`.

**Where this pays off** — and where it doesn't:

- _Generation_ shines for boundary/permutation coverage that's tedious to hand-write
  and rots when constants change: the notional-limit probes recompute the exact
  boundary from the live price on every run. It does **not** replace the curated
  journeys — those stay hand-written and tiny.
- _Self-healing_ pays off at boundaries you don't fully control (a provider team
  shipping renames ahead of contract updates): the suite keeps signaling on real
  regressions instead of drowning them in rename noise. It is deliberately **not**
  used in the contract (Pact) suites — their whole job is to fail loudly on drift.

## Regulatory transaction reporting (MiFID II / EMIR / SFTR)

Executed trades flow to `reg-reporting`, which enriches them into **MiFID II RTS 22**
transaction reports (LEI/ISIN validation with real check-digit algorithms, buyer/seller
derivation, UTC timestamps), simulates the ARM's ACK/NACK, suppresses duplicate TRNs,
and exposes a reconciliation summary. Reporting is fire-and-forget from the trading
path — an outage never halts trading, and completeness is owned by reconciliation.

The testing is the point — see **[docs/REG-REPORTING-TEST-STRATEGY.md](docs/REG-REPORTING-TEST-STRATEGY.md)**
for the full strategy (integrity pillars, corpus governance, EMIR/SFTR roadmap):

```bash
# RTS 22 field-validation regression pack (golden corpus, rule-ID traceable)
npm run test:unit --workspace services/reg-reporting

# End-to-end reporting integrity across the wired stack (stack must be up)
npm run test:e2e -- mifid

# Nightly high-volume integrity: reconciliation must balance after load
k6 run tests/performance/reg-reporting-volume.js
```

## Run it locally

```bash
npm install

# Gates 1–4 need nothing but Node:
npm run lint && npm run typecheck
npm run test:unit
npm run test:contract:consumer && npm run test:contract:provider
npm run test:integration            # portfolio's DB tests skip without Postgres

# Gates 3 (full), 6, 7 need Docker:
docker compose -f docker-compose.component.yml up -d --build
npm run test:component
docker compose -f docker-compose.component.yml down -v

docker compose -f docker-compose.e2e.yml up -d --build
npm run test:e2e
k6 run tests/performance/trade-smoke.js
docker compose -f docker-compose.e2e.yml down -v

# Or run the stack without Docker at all (portfolio in-memory):
npx tsx services/market-data/src/server.ts &
REPO=memory npx tsx services/portfolio/src/server.ts &
MARKET_DATA_URL=http://localhost:3001 PORTFOLIO_URL=http://localhost:3002 \
  npx tsx services/trade/src/server.ts &
npm run test:e2e
```

## Scaling this up to a real estate

This repo keeps everything runnable with zero external infrastructure. In a real
multi-team/multi-repo estate you would swap in:

- **Pact Broker** instead of the pacts/ artifact hand-off: consumers `pact-broker publish`,
  providers verify from the broker, and deployment is gated by `can-i-deploy`.
- **Registry + image scanning** (Trivy) in the build gate, and Helm/K8s + canary in deploy.
- **Kafka + schema registry** if boundaries become event-driven: the contract gate becomes a
  schema **backward-compatibility check** in the producer's pipeline — same principle,
  different mechanism.
- Compiled `tsc` output (or esbuild) in the Dockerfiles instead of running `tsx` directly —
  tsx keeps this demo simple, production images should ship compiled JS.

See `docs/STANDARDS.md` for the full coding and testing standards.
