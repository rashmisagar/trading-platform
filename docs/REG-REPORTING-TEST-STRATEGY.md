# Regulatory Transaction Reporting — Test Strategy

Scope: the `reg-reporting` service and the trade → reg-reporting flow.
**MiFID II (RTS 22) is implemented and tested today**; EMIR and SFTR follow the same
architecture (see §7). Every claim in this document maps to a test that exists in this
repo — a strategy line without an enforcing test is a wish, not a strategy.

## 1. What can go wrong (risk model)

Transaction reporting fails differently from trading. A trading bug loses money once;
a reporting bug silently accumulates **regulatory breaches per trade** until an
auditor, an ARM reject batch, or an NCA letter finds it. The four integrity pillars,
and where each is enforced:

| Pillar           | Failure mode                                        | Enforced at                                                                             |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Completeness** | an executed trade never becomes a report            | e2e (`mifid-reporting.spec.ts`), volume (`reg-reporting-volume.js` reconciliation gate) |
| **Accuracy**     | report fields diverge from executed economics       | regression pack (field rules), e2e (report ⇄ trade field comparison)                    |
| **Timeliness**   | report exists but arrives late (T+1 breach)         | async hand-off polled with a hard timeout at e2e; latency under load in nightly volume  |
| **Uniqueness**   | one trade reported twice (double-booking the books) | unit (duplicate TRN suppression), e2e (exactly-one-report assertion)                    |

Two cross-cutting failure modes get explicit treatment:

- **Enrichment gaps** (unknown ISIN/LEI) must fail the report **loudly** — a guessed
  identifier is worse than a missing report, because it corrupts the regulator's view.
  Enforced: `mifidReport.test.ts` (build fails, never defaults), reconciliation counts
  `enrichmentFailures`.
- **Reporting outage vs trading**: reporting must never halt trading (halting is a
  market-conduct problem bigger than late reports), but the gap must be _visible_.
  Enforced: trade's unit pack ("a reporting outage NEVER fails the trade") +
  reconciliation. Production hardening: replace fire-and-forget HTTP with a
  transactional **outbox + replay**; the interface and tests stay the same.

## 2. The regression pack (Gate 2 — runs on every PR)

`services/reg-reporting/tests/unit/regression.pack.test.ts`, data-driven from the
golden corpus `tests/fixtures/mifid-regression-corpus.json`.

- **One case = one mutation of a known-good baseline report + the exact rule IDs the
  validator must raise.** Asserting on rule IDs (not just "invalid") means a rule
  can't silently vanish and a new rule can't accidentally fire on clean reports.
- **Rule IDs are traceable**: `RTS22-F41-ISIN-CHECKSUM` names the RTS 22 Annex I
  Table 2 field it enforces. An auditor can walk from regulation text → rule ID →
  corpus cases → the validator line that enforces it.
- **Governance ratchet**: the corpus only grows. Every production NACK or reporting
  incident is reproduced as a corpus case _before_ the fix lands (same discipline as
  a regression test for a bug). A meta-test pins the case-count floor.
- **All violations at once**: regulators reject on any defect, so the validator
  returns every violation, and MIFID-REG-014 pins multi-defect reporting.
- Identifier algorithms (LEI ISO 17442 MOD 97-10, ISIN ISO 6166 Luhn) are verified
  against **real public identifiers** plus corruption cases (`validators.test.ts`);
  fixture LEIs are fictional but checksum-valid, so format-vs-checksum bugs can't hide.

## 3. Contract (Gate 4) — the boundary that pays for itself

trade ↔ reg-reporting is Pact-covered in both directions
(`regReporting.consumer.pact.test.ts` → `provider.verify.test.ts`). The realistic
failure this catches pre-deploy: the reporting team reshapes `/executions` while the
trading team still submits the old shape — which would otherwise surface as a
_silent completeness breach_ in production, the worst failure mode this domain has.

## 4. End-to-end validation (Gate 7)

`tests/e2e/tests/mifid-reporting.spec.ts` — four curated journeys across the real
wiring (trade → market-data/portfolio → reg-reporting), no logic re-testing:

1. executed BUY → **exactly one** ACCEPTED report carrying the executed economics
   (accuracy is asserted field-by-field against the trade response, and enrichment
   is asserted as _enrichment_ — the ISIN is not echoed from the request)
2. SELL → buyer/seller **swap** (the classic real-world mis-reporting defect)
3. rejected trade → **no report** (negative completeness; absence asserted after a
   settle window, since absence cannot be polled-for)
4. reconciliation invariant: received ≥ accepted + rejected + enrichment failures,
   and zero NACKs/drops in a healthy stack

Async hand-off is polled with `expect(...).toPass({ timeout })` — timeliness with a
hard ceiling, never a sleep-and-hope.

## 5. High-volume integrity (nightly)

`tests/performance/reg-reporting-volume.js` (k6): sustained trading load, then a
**reconciliation gate in teardown** — every execution reported, zero NACKs, zero
drops, or the run throws. Latency thresholds alone are the wrong pass condition for
reporting: a pipeline that drops 0.1% under load meets every latency SLO while
breaching MiFID II on every dropped trade.

## 6. What is deliberately NOT tested here

- **CANC/amend lifecycle** (RTS 22 report status transitions) — next increment;
  the `reportStatus` field is already modelled to carry it.
- **Real ARM connectivity** (ISO 20022 / XML envelopes, sequencing, ACK files) —
  the ACK/NACK simulation covers behaviour; wire-format tests belong at the ARM
  adapter boundary when one exists.
- **Self-healing** — banned in this suite, as in the Pact suites (STANDARDS §6):
  a reporting test absorbing drift would defeat its purpose. Reporting tests fail
  loudly, by design.

## 7. Scaling to EMIR / SFTR

The architecture is regime-agnostic on purpose:

| Piece                | MiFID II (today)          | EMIR (next)                                      | SFTR (later)                   |
| -------------------- | ------------------------- | ------------------------------------------------ | ------------------------------ |
| Report builder       | RTS 22 subset             | trade + valuation + collateral                   | SFT lifecycle events           |
| Validator + rule IDs | `RTS22-F*`                | `EMIR-T*` (Table 1/2 fields)                     | `SFTR-T*`                      |
| Golden corpus        | `mifid-regression-corpus` | per-regime corpus, same schema                   | per-regime corpus              |
| Counterparty model   | buyer/seller LEI          | **dual-sided**: both LEIs + UTI pairing/matching | UTI + master-agreement linkage |
| Reconciliation       | trade ⇄ report            | + inter-TR reconciliation                        | + collateral reuse chains      |

The regime-specific hard parts to plan for: EMIR's **UTI pairing** (both sides must
generate/agree the same UTI — a matching problem, not a validation problem) and
SFTR's collateral reuse chains. Both slot in as new corpora + new reconciliation
invariants, not new architecture.
