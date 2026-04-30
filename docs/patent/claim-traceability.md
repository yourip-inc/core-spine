# Patent-Conformance Traceability — YouRip Core Spine

**Story:** T1-S1-G-03.
**Owner:** Patent Conformance Officer (PCO).
**Status as of:** End of T1 Sprint 1.

This document is the central record of patent-claim conformance for the Core Spine. It is updated on every patent-adjacent merge by the PCO as part of the merge checklist (T1-S1-G-02). The matrix structure below mirrors the SOW Section 9 patent-claim-to-implementation matrix.

## How to read this document

- **Claim** — patent claim number as it appears in the non-provisional.
- **Status** — `implemented` / `legacy` / `placeholder`. Mirrors `tests/claim_registry.yaml`.
- **Test files** — relative paths to tests named `test_claim_N_*` that exercise the claim.
- **Code artifacts** — relative paths to the source files that implement the claim.
- **Gate claim?** — Yes if the claim is on the Sprint 1 G-04 gate list (1, 2, 3, 10, 11, 12, 14, 15, 19).
- **Most recent commit SHA** — the commit that last touched the implementation. To be filled in by the PCO at exit review. Placeholder `<pending>` means "update on next patent-adjacent merge."

## Claim matrix

### Tier 1: Gate claims (must be green at Sprint 1 exit)

| Claim | Title | Status | Test files | Code artifacts | Commit |
|---|---|---|---|---|---|
| 1 | Challenge lifecycle state machine | implemented | `tests/unit/challenge-service.test.ts` | `src/challenge/challenge-service.ts` | `<pending>` |
| 2 | Submission registry with cryptographic hashes | **placeholder** | *(none yet; blocked on full Submission Registry)* | *(none)* | — |
| 3 | Effective vote mass formula (sum_w² / sum_w2) | implemented | `tests/unit/scoring/effective-vote-mass.test.ts`, `decimal4.test.ts`, `score-aggregator-service.test.ts`, `aggregator-wiring.test.ts` | `src/scoring/effective-vote-mass.ts`, `decimal4.ts`, `score-aggregator-service.ts` | `<pending>` |
| 10 | Role-aware contributor splits | implemented | `tests/unit/submission/contributor-role.test.ts` | `src/submission/contributor-role.ts`, `migrations/009_videographer_enum.sql` | `<pending>` |
| 11 | Migration record with checksum | implemented | `tests/unit/migration/migration-record.test.ts`, `migration-service.test.ts` | `src/migration/migration-record.ts`, `migration-service.ts`, `migration-repository.ts`, `migrations/007_challenge_migrations_reconstruction.sql` | `<pending>` |
| 12 | Versioned payout ruleset | **placeholder** | *(none yet; depends on Payout service, later sprint)* | *(none)* | — |
| 14 | Rubric immutability post-publish | implemented | `tests/unit/rubric-service.test.ts` | `src/rubric/rubric-service.ts`, `migrations/001_rubrics.sql`, `002_rubric_weight_sum.sql` | `<pending>` |
| 15 | Append-only event store integrity | **placeholder** | *(none yet; requires Audit Ledger service, later sprint)* | *(none)* | — |
| 19 | Rater weights do not persist across challenges | implemented | `tests/unit/scoring/signal-ingestion.test.ts` | `src/scoring/signal-ingestion.ts`, `rater-weight-repository.ts`, `migrations/005_rater_event_weights.sql` | `<pending>` |

**Gate claim status: 6 of 9 green** (1, 3, 10, 11, 14, 19). Three red (2, 12, 15) — remediation plans in exit memo.

### Tier 2: Implemented non-gate claims

| Claim | Title | Status | Test files | Code artifacts |
|---|---|---|---|---|
| 13A | Winner-axis: score threshold | implemented | `tests/unit/scoring/winner-gate.test.ts`, `score-aggregator-service.test.ts` | `src/scoring/winner-gate.ts` |
| 13B | Winner-axis: stability threshold | implemented | `tests/unit/scoring/winner-gate.test.ts`, `stability-score.test.ts` | `src/scoring/winner-gate.ts`, `stability-score.ts` |
| 17 | Canonical JSON hash for score aggregate | implemented | `tests/unit/canonical-json.test.ts`, `score-aggregator-service.test.ts` | `src/canonical/canonical-json.ts`, `event-hash.ts` |
| 20A | Winner-gate reason codes | implemented | `tests/unit/scoring/winner-gate.test.ts`, `score-aggregator-service.test.ts` | `src/scoring/winner-gate.ts`, `src/errors/reason-codes.ts` |
| 23 | Migration replay branches at recomputation time | implemented | `tests/unit/migration/migration-service.test.ts` | `src/migration/migration-service.ts` |

### Tier 3: Legacy placeholders (F-04)

Seven claims have legacy-test placeholder paths recorded; no code yet. These carry `rename_target` and `rename_story` in the registry and will be implemented in later sprints.

| Claim | Title | Rename target |
|---|---|---|
| 6 | Challenge-window enforcement | `test_claim_6_challenge_window_enforced` |
| 7 | Submission eligibility gate | `test_claim_7_submission_eligibility` |
| 8 | Slot-bound monetization event record | `test_claim_8_slot_bound_monetization_event` |
| 9 | Idempotent payout endpoint | `test_claim_9_payout_idempotent` |
| 16 | Replay determinism | `test_claim_16_replay_determinism` |
| 18 | Tier-adjusted weighting | `test_claim_18_tier_adjusted_weighting` |
| 21 | Audit bundle signature | `test_claim_21_audit_bundle_signature` |

### Tier 4: Remaining placeholders (not gate claims, not implemented)

| Claim | Title | Blocked on |
|---|---|---|
| 4 | Real-time rating ingestion | Rating Service persistence |
| 5 | Multi-axis decision envelope | Scoring Service completion |
| 13 | Winner-axis binary envelope | Scoring Service (parent claim of 13A/13B) |
| 20 | Terminal reason-code emission | Winner Gate finalization |
| 22 | Cross-version payout reconciliation | Payout Service |

## Ambiguity log

Per T1-S1-G-01 §4. Every entry has a log ID and lifecycle.

| Log ID | Raised | By | Claim(s) | Status | Summary | Resolution | Counsel sign-off | Commit |
|---|---|---|---|---|---|---|---|---|
| AMB-T1-001 | T1 Sprint 1 | PCO retrospective | 11 | deferred | Should DB plpgsql recompute checksum on INSERT, or only TS? Risk of silent drift between canonicalizations. | PCO interpretation: TS is authoritative. DB function retained as secondary audit helper with documented caveat. Matches Flag 3 of the API contract. | *(pending next sync)* | `<pending>` |
| AMB-T1-002 | T1 Sprint 1 | PCO retrospective | 11 | resolved | Should `verify_migration_checksum` be architecturally prevented from returning false (block UPDATE at DB) vs allowed (D-02 AC tests `verify → false` after manual UPDATE)? | PCO: AC explicitly requires `verify → false` after UPDATE. UPDATE must be physically possible; checksum IS the tamper-detection mechanism. Service layer exposes no UPDATE path; DB UPDATE requires DBA access. | PCO self-sign (routine) | `<pending>` |
| AMB-T1-003 | T1 Sprint 1 | PCO retrospective | Catalog hygiene (not a specific claim) | resolved | Two cases of reason-code reuse caught during WS-1D: empty `migration_reason` was emitting `MIGRATION_CLIENT_CHECKSUM_REJECTED`; FK violation on `challenge_id` was emitting `RUBRIC_VERSION_UNRESOLVABLE`. | Added dedicated codes `MIGRATION_REASON_EMPTY` and `CHALLENGE_ID_UNRESOLVABLE`. Policy going forward: never reuse a code from a different domain — catalog is patent-portfolio-level. | PCO self-sign (routine) | `<pending>` |

## Change log

| Date | Entry | PCO |
|---|---|---|
| T1 Sprint 1 end | Document created as part of T1-S1-G-03. Populated with Sprint 1 scope. | — |
