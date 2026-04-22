# Sprint 1 Acceptance Matrix — ALL 7 EPICS

Complete mapping of Sprint 1 stories → implementation files → test coverage. Reviewed for PCO sign-off per T1-S1-G-02. Sprint 1 exit memorandum at `docs/patent/sprint-1-exit-memo.md`.

## Legend

- **✅ Code** — Implementation present and reviewed.
- **🧪 Tests** — Unit test coverage present (runtime verification pending in your dev env).
- **🔴 Open** — Documented follow-up tracked in §Open.

---

## WS-1A — Rubric Schema (5 stories, 13 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-A-01 — Create rubrics and rubric_criteria tables | `migrations/001_rubrics.sql` | 🔴 DB integration pending |
| T1-S1-A-02 — Enforce weight sum = 10000 | `src/rubric/rubric-service.ts`, `migrations/002_rubric_weight_sum.sql` | 🧪 `tests/unit/rubric-service.test.ts` |
| T1-S1-A-03 — POST/GET /v1/rubrics | `src/http/rubric-routes.ts` | 🔴 HTTP integration pending |
| T1-S1-A-04 — Challenge Service rejects lock | `src/challenge/challenge-service.ts` | 🧪 `tests/unit/challenge-service.test.ts` |
| T1-S1-A-05 — Rating Service validates criteria_scores_bp | `src/rating/rating-service.ts` | 🧪 `tests/unit/rating-service.test.ts` |

## WS-1F — Claim-Coverage Test Harness (4 stories, 13 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-F-01 — `test_claim_N_` naming + CI lint | `eslint-rules/claim-test-naming.cjs`, `.eslintrc.cjs`, `.github/workflows/ci.yml` | 🧪 `tests/meta/claim-test-naming-rule.test.ts` |
| T1-S1-F-02 — Report generator | `src/claim-coverage/{generate-report,yaml-parse,discover,render,types}.ts` | 🧪 `tests/meta/claim-coverage.test.ts` |
| T1-S1-F-03 — Seed registry | `tests/claim_registry.yaml` (26 entries) | 🧪 `tests/meta/claim-coverage.test.ts` |
| T1-S1-F-04 — Rename legacy tests | Documented greenfield interpretation in `docs/claim-coverage.md` | — (no legacy tests exist yet) |

## WS-1B — Effective Vote Mass & Stability (4 stories, 13 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-B-01 — DDL columns | `migrations/003_score_aggregates.sql` (greenfield prereq), `migrations/004_score_aggregate_claim_columns.sql` + `.down.sql` | 🔴 DB integration pending |
| T1-S1-B-02 — Effective vote mass formula | `src/scoring/decimal4.ts`, `effective-vote-mass.ts`, `rater-weight-provider.ts` | 🧪 `tests/unit/scoring/decimal4.test.ts`, `effective-vote-mass.test.ts` |
| T1-S1-B-03 — Stability score derivation | `src/scoring/stability-score.ts`, `docs/scoring-model-requirements.md` | 🧪 `tests/unit/scoring/stability-score.test.ts` |
| T1-S1-B-04 — Winner gate | `src/scoring/winner-gate.ts` | 🧪 `tests/unit/scoring/winner-gate.test.ts` |
| *(glue)* ScoreAggregatorService | `src/scoring/score-aggregator-service.ts` | 🧪 `tests/unit/scoring/score-aggregator-service.test.ts` |

## WS-1C — Rater Event Weights (4 stories, 10 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-C-01 — rater_event_weights table | `migrations/005_rater_event_weights.sql` + `.down.sql`; `migrations/008_rater_event_weights_fk.sql` (adds FK→challenges cascade) | 🔴 DB integration pending |
| T1-S1-C-02 — Bounded-weight computation | `src/scoring/bounded-weight.ts` | 🧪 `tests/unit/scoring/bounded-weight.test.ts` |
| T1-S1-C-03 — Telemetry ingestion | `src/scoring/signal-ingestion.ts`, `rater-weight-repository.ts` | 🧪 `tests/unit/scoring/signal-ingestion.test.ts` |
| T1-S1-C-04 — Wire into Score Aggregator | `src/scoring/score-aggregator-service.ts` (extended), `rater-weight-repository.ts` (`getWeightsForRaters`) | 🧪 `tests/unit/scoring/aggregator-wiring.test.ts` |

## WS-1D — Migration Record Reconstruction (3 stories, 8 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-D-01 — Drop legacy, create Claim-11 structure | `migrations/006_challenges.sql` (greenfield prereq), `migrations/007_challenge_migrations_reconstruction.sql` + `.down.sql` | 🔴 DB integration pending |
| T1-S1-D-02 — migration_checksum + verify | `src/migration/migration-record.ts`, plpgsql `verify_migration_checksum()` in 007 | 🧪 `tests/unit/migration/migration-record.test.ts`, `migration-service.test.ts` |
| T1-S1-D-03 — POST /v1/challenges/:challengeId/migrations | `src/http/migration-routes.ts`, `src/migration/migration-service.ts`, `migration-repository.ts`, `openapi/core-spine.yaml` | 🧪 `migration-service.test.ts`; 🔴 HTTP integration pending |

## WS-1E — Vocabulary Alignment (3 stories, 5 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-E-01 — VIDEOGRAPHER enum + backfill | `migrations/009_videographer_enum.sql` + `.down.sql` (enum with 4 canonical roles + deprecated FILMER) | 🔴 DB integration pending |
| T1-S1-E-02 — Canonical usage + CI lint | `src/submission/contributor-role.ts`, `openapi/core-spine.yaml` (`ContributorRole` schema), `eslint-rules/no-filmer-outside-alias.cjs` | 🧪 `tests/unit/submission/contributor-role.test.ts`, `tests/meta/no-filmer-outside-alias-rule.test.ts` |
| T1-S1-E-03 — Deprecated alias + RFC 8594 headers | `src/http/submission-routes.ts`, `src/http/deprecation-headers.ts` | 🧪 `tests/unit/submission/submission-routes.test.ts` |

## WS-1G — Counsel Retro + Process (4 stories, 8 pts)

| Story | Code | Tests |
|---|---|---|
| T1-S1-G-01 — Weekly counsel sync + escalation SLA | `docs/patent/counsel-sync.md` | — (process doc) |
| T1-S1-G-02 — PCO sign-off + CODEOWNERS + PR template | `CODEOWNERS`, `.github/pull_request_template.md` | — (process doc) |
| T1-S1-G-03 — Traceability document | `docs/patent/claim-traceability.md` | — (process doc; regenerable from registry) |
| T1-S1-G-04 — Sprint 1 exit review + gate verification | `docs/patent/sprint-1-exit-memo.md` (6/9 gate claims green; 3 documented misses with remediation plans) | — (ceremony deliverable) |

---

## Verification required in your dev env

1. `npm install && npm run typecheck` — zero errors expected.
2. `npm test` — ~150+ unit test cases expected to pass.
3. `npm run lint` — ESLint passes with the custom `claim-test-naming` AND `no-filmer-outside-alias` rules.
4. `npm run claim-coverage:report` — renders `coverage-report/claim-coverage.{md,html}`; exits 0.
5. `docker compose up postgres migrate` — migrations 001–009 apply cleanly.

## Registry status snapshot (Sprint 1 final)

| Status | Count | Claim IDs |
|---|---|---|
| implemented | 11 | 1, 3, 10, 11, 13A, 13B, 14, 17, 19, 20A, 23 |
| legacy | 7 | 6, 7, 8, 9, 16, 18, 21 |
| placeholder | 8 | 2, 4, 5, 12, 13, 15, 20, 22 |
| **Total** | **26** | — |

**Gate claim verification (G-04):** 6 of 9 gate claims green (1, 3, 10, 11, 14, 19). 3 red (2, 12, 15) — all explicitly documented as misses in the exit memo with owner + target + remediation plan.

## New reason codes introduced this sprint

| Code | Added in | Purpose |
|---|---|---|
| `RUBRIC_WEIGHT_SUM_INVALID` | WS-1A | Rubric criteria weight_bp sum ≠ 10000 |
| `RUBRIC_VERSION_UNRESOLVABLE` | WS-1A | Challenge lock or lookup references unknown/draft rubric |
| `RUBRIC_CRITERION_UNKNOWN` | WS-1A | Rating payload has key not in rubric |
| `RUBRIC_CRITERION_MISSING` | WS-1A | Rating payload missing key required by rubric |
| `EFFECTIVE_VOTE_MASS_ZERO_RATERS` | WS-1B | Empty rater set or all-zero weights |
| `STABILITY_SCORE_BELOW_THRESHOLD` | WS-1B | Stability axis failed winner gate |
| `SCORE_BELOW_THRESHOLD` | WS-1B | Mean axis failed winner gate |
| `RATER_WEIGHT_DEFAULTED` | WS-1C | At least one accepted rater had no stored weight row |
| `MIGRATION_PRIOR_EQUALS_NEW` | WS-1D | prior_ruleset_version equals new_ruleset_version |
| `MIGRATION_CHECKSUM_INVALID` | WS-1D | Reserved for replay pre-check failures |
| `MIGRATION_CLIENT_CHECKSUM_REJECTED` | WS-1D | Client attempted to supply migration_checksum |
| `MIGRATION_REASON_EMPTY` | WS-1D | migration_reason is empty or whitespace-only |
| `CHALLENGE_ID_UNRESOLVABLE` | WS-1D | challenge_id FK does not reference an existing challenge |

13 new codes. Two cases of reason-code reuse caught and corrected during WS-1D implementation — pattern flagged for ongoing counsel-sync attention (AMB-T1-003 in `docs/patent/claim-traceability.md`).

## Counsel-sync ambiguity log

Three entries raised during Sprint 1, logged in `docs/patent/claim-traceability.md` §"Ambiguity log":

- **AMB-T1-001** (deferred): TS vs plpgsql canonical-JSON drift risk on migration checksum — pending counsel sign-off on "TS is authoritative" interpretation.
- **AMB-T1-002** (resolved PCO self-sign): Whether `verify_migration_checksum` should be architecturally unable to return false — resolved against, because D-02 AC explicitly tests the mutation→false path.
- **AMB-T1-003** (resolved PCO self-sign): Reason-code catalog hygiene — "never reuse a code from a different domain" policy adopted.

## Architectural decisions documented

### TS is the authority for `migration_checksum`
The WS-1D DB migration includes a plpgsql `verify_migration_checksum()` helper but does NOT use it in an INSERT trigger. Postgres's `to_jsonb()` string escaping diverges from the TS canonical-JSON on edge characters. Running both would risk silent drift (Flag 3 in the API Contract). The TS library is authoritative; the plpgsql is a cross-check audit aid.

### Migration records are UPDATEable at the DB layer
D-02 AC explicitly tests `verify → false` after a manual UPDATE. That requires UPDATE to succeed physically. Blocking at trigger layer would make checksum redundant. Service layer exposes no UPDATE path; DB UPDATE requires DBA access.

### FILMER alias kept in enum, not rows
`contributor_role` enum retains FILMER as a deprecated value for one release cycle so in-flight DB state doesn't break. Postgres doesn't support removing enum values, so full removal requires a type-rebuild migration in a later sprint (documented in `009_videographer_enum.down.sql` and `docs/vocabulary-deprecations.md`).

## Open for next sprint follow-up

### DB integration tests (all 9 migrations)
- Apply 001–009 against a real Postgres instance.
- Verify rubric immutability triggers fire on post-publish UPDATE.
- Verify deferred weight-sum constraint fires at COMMIT on bad criterion inserts.
- Verify `rater_event_weights` composite PK rejects duplicate `(challenge_id, rater_id)`.
- Verify `challenges` post-open mutation guard fires on direct UPDATE of version columns.
- Verify `challenge_migrations` FK cascades on `DELETE FROM challenges`.
- Verify `verify_migration_checksum` returns false after a manual UPDATE.
- Verify `contributor_role` enum accepts all 4 canonical values + FILMER.

### HTTP integration
- `fastify.inject` coverage for rubric routes (AC open).
- `fastify.inject` coverage for migration routes (AC open).
- Submission routes tests are already present — `tests/unit/submission/submission-routes.test.ts`.

### Persistence wiring (Sprint 2)
- `ScoreAggregatorService.compute()` writes to `score_aggregates`.
- `RaterWeightProvider.getBoundedWeights(submissionId, …)` gets its submission→rater resolution once Rating Service persists.
- Submission Registry full shape (Claim 2 remediation).

### Audit Ledger (Sprint 2/3)
- Claim 15 remediation — `audit_events` with hash chain.

### Payout Ruleset (Sprint 2)
- Claim 12 remediation — `payout_rulesets` immutable resolver.

### FILMER sunset
- Monitor `Deprecation: true` response-header telemetry to confirm no remaining FILMER clients.
- Schedule removal migration ~one release before `FILMER_SUNSET_HTTP_DATE` (currently 2026-10-01).
