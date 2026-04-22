# T1 Sprint 1 Exit Memorandum

**Story:** T1-S1-G-04.
**Signer:** Patent Conformance Officer (PCO).
**Date:** End of T1 Sprint 1.

## 1. Sprint scope

Seven workstreams, total 78 story points planned. Five coded, two process. All deliverables in the `yourip/core-spine` repository at the Sprint 1 merge.

| WS | Title | Points | Status |
|---|---|---|---|
| WS-1A | Rubric Schema | 13 | ✅ Code-complete |
| WS-1B | Effective Vote Mass & Stability | 13 | ✅ Code-complete |
| WS-1C | Rater Event Weights | 10 | ✅ Code-complete |
| WS-1D | Migration Record Reconstruction | 8 | ✅ Code-complete |
| WS-1E | Vocabulary Alignment (VIDEOGRAPHER) | 5 | ✅ Code-complete |
| WS-1F | Claim-Coverage Harness | 13 | ✅ Code-complete |
| WS-1G | Counsel retro / process | 8 | ✅ Documents landed |
| **Total** | | **70** | |

(Discrepancy from 78: three stories deferred to Sprint 2 — see §4.)

## 2. Gate claims — G-04 verification

The Sprint 1 gate claim list (1, 2, 3, 10, 11, 12, 14, 15, 19) was verified against the claim-coverage report run at sprint end.

| Claim | Title | Status | Notes |
|---|---|---|---|
| 1 | Challenge lifecycle state machine | 🟢 GREEN | Covered by `challenge-service.test.ts` |
| 2 | Submission registry with cryptographic hashes | 🔴 **RED** | See §3.1 |
| 3 | Effective vote mass formula | 🟢 GREEN | Four test files |
| 10 | Role-aware contributor splits | 🟢 GREEN | Flipped this sprint (WS-1E) |
| 11 | Migration record with checksum | 🟢 GREEN | Flipped this sprint (WS-1D) |
| 12 | Versioned payout ruleset | 🔴 **RED** | See §3.2 |
| 14 | Rubric immutability post-publish | 🟢 GREEN | Covered by `rubric-service.test.ts` |
| 15 | Append-only event store integrity | 🔴 **RED** | See §3.3 |
| 19 | Rater weights do not persist across challenges | 🟢 GREEN | Flipped this sprint (WS-1C) |

**6 of 9 gate claims green. 3 red.**

## 3. Gate misses — explicit remediation plans (required by G-04 AC)

### 3.1 Claim 2 — Submission registry with cryptographic hashes

**Miss reason:** The full Submission Registry was not in Sprint 1 scope. WS-1E created minimal `submissions` / `submission_contributors` tables (for contributor_role enum targets), but the cryptographic hash-per-submission and replay-ready registry shape required by Claim 2 are not present.

**Remediation plan:**
- **Owner:** Engineering Lead + PCO.
- **Target:** T1 Sprint 2, first two days.
- **Scope:** `POST /v1/challenges/{challengeId}/submissions` endpoint with canonical-JSON submission hash, event-hash link, rater-eligibility precheck.
- **Tests:** `test_claim_2_submission_registry_hash_deterministic`, `test_claim_2_submission_hash_change_detects_tampering`.
- **Migration:** Extend `submissions` table with `submission_hash CHAR(64) NOT NULL` + index.
- **Verification:** Registry entry updated; close AMB entry if opened.

### 3.2 Claim 12 — Versioned payout ruleset

**Miss reason:** Payout Service is not yet in scope for Sprint 1. The migration record (WS-1D) captures `prior_ruleset_version` and `new_ruleset_version` as string columns, but there is no backing Payout Ruleset table, no ruleset resolver, and no replay branching on payout versions.

**Remediation plan:**
- **Owner:** Engineering Lead.
- **Target:** T2 Sprint 1.
- **Scope:** `payout_rulesets` table; immutable rows keyed by `ruleset_version`; canonical-JSON hash; resolver API.
- **Tests:** `test_claim_12_payout_ruleset_immutable_post_publish`, `test_claim_12_payout_ruleset_resolver_returns_versioned_row`.
- **Dependency:** Must land before any event that writes a payout; Sprint 2 sequencing to ensure this.

### 3.3 Claim 15 — Append-only event store integrity

**Miss reason:** Audit Ledger service is not in Sprint 1 scope. The canonical-JSON library (`src/canonical/event-hash.ts`) and reason-code catalog exist, but the append-only event store — the row-level hash chain linking events to their predecessors — has no DDL or service code yet.

**Remediation plan:**
- **Owner:** Engineering Lead + PCO.
- **Target:** T2 Sprint 2.
- **Scope:** `audit_events` table with `event_hash`, `prior_event_hash` chain columns; DB trigger enforcing chain invariants; service API for append + verify-chain.
- **Tests:** `test_claim_15_event_chain_unbroken`, `test_claim_15_tampered_event_breaks_chain`.
- **Interim:** Until this lands, the migration-record append-only property (Claim 11, D-02) is the only hash-chain we have. Document this clearly in release notes so downstream teams don't assume ledger-grade integrity yet.

## 4. Stories deferred from Sprint 1

Three stories were descoped during planning to fit the sprint:

- **(Implicit)** HTTP integration tests for rubric and migration endpoints (fastify.inject). Recovered as "Open for next sprint follow-up" in `ACCEPTANCE.md`. **Target:** Sprint 2 week 1.
- **(Implicit)** DB integration tests running migrations 001–009 against live Postgres. **Target:** Sprint 2 week 1.
- **(Implicit)** Score-aggregate HTTP persistence endpoint (`POST /v1/core-spine/score-aggregates/compute`). **Target:** Sprint 2 week 2.

These are tracked in `ACCEPTANCE.md` "Open for next sprint follow-up" section and will be planned as Sprint 2 stories.

## 5. Counsel liaison brief (required by G-04 AC)

**Briefing status:** Held during final Sprint 1 counsel sync.

**Sprint 2 scope preview:**
- Submission Registry landing (closes Claim 2 gate miss).
- Audit Ledger service landing (closes Claim 15 gate miss).
- HTTP integration test coverage + DB integration test suite.
- Score-aggregate persistence endpoint (persists what the aggregator currently computes without writing).
- FILMER alias sunset-header scheduling.

**Claim-ambiguity log entries raised to counsel:** AMB-T1-001, AMB-T1-002, AMB-T1-003 (see `docs/patent/claim-traceability.md` §"Ambiguity log"). Counsel sign-off pending on AMB-T1-001 at sprint end.

## 6. Registry state at exit

| Status | Count | Claim IDs |
|---|---|---|
| implemented | 11 | 1, 3, 10, 11, 13A, 13B, 14, 17, 19, 20A, 23 |
| legacy | 7 | 6, 7, 8, 9, 16, 18, 21 |
| placeholder | 8 | 2, 4, 5, 12, 13, 15, 20, 22 |
| **Total** | **26** | |

## 7. Reason codes introduced this sprint

13 new reason codes added to the PRD §6.6 catalog; see `ACCEPTANCE.md` for full table. Two cases of reason-code reuse were detected and corrected (`MIGRATION_REASON_EMPTY`, `CHALLENGE_ID_UNRESOLVABLE` added to replace misleading reuse). Catalog hygiene flagged for ongoing counsel-sync attention.

## 8. Signatures

**PCO sign-off:**

- [ ] I have verified the claim-coverage report reflects the matrix above.
- [ ] I have verified all gate claims are either green or documented as a miss with owner and target date.
- [ ] I have verified `docs/patent/claim-traceability.md` is complete for Sprint 1 scope.
- [ ] I have briefed the counsel liaison on Sprint 2 scope.

Signed: _____________________ Date: _____________

**Engineering Lead sign-off (acknowledgment of remediation plans):**

Signed: _____________________ Date: _____________
