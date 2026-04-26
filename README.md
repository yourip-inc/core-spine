# YouRip Core Spine (T1)

TypeScript + Node.js server implementing the T1 Core Spine API per PRD-T1-CORE-SPINE-ENG-v1.0 and API Contract PRD-T1-API-v1.0. Patent claims 1, 14, 21 (and 22/23 once audit replay lands in WS-1D).

## Sprint 1 / WS-1A scope

This repository currently implements Epic WS-1A (Rubric Schema) only. The other Sprint 1 epics (WS-1B effective vote mass, WS-1C rater event weights, WS-1D migration records, WS-1E vocabulary alignment, WS-1F claim-coverage harness, WS-1G counsel retro) are open.

| Story | What it implements | Where |
|---|---|---|
| **T1-S1-A-01** Create rubrics and rubric_criteria tables | Tables, immutability triggers after publish, UUID primary keys, integer-millisecond timestamps | `migrations/001_rubrics.sql` |
| **T1-S1-A-02** Enforce rubric weight sum equals 10000 | App-layer check returning `RUBRIC_WEIGHT_SUM_INVALID` + deferred SQL constraint trigger backstop | `src/rubric/rubric-service.ts`, `migrations/002_rubric_weight_sum.sql` |
| **T1-S1-A-03** POST /v1/rubrics and GET /v1/rubrics/{rubric_version} | Fastify routes, Zod request validation, DomainError → reason_code envelope | `src/http/rubric-routes.ts` |
| **T1-S1-A-04** Challenge Service rejects lock when rubric_version unresolvable | Minimal Challenge Service stub — `resolveLockableRubric` returns canonical hash or throws `RUBRIC_VERSION_UNRESOLVABLE` | `src/challenge/challenge-service.ts` |
| **T1-S1-A-05** Rating Service validates criteria_scores_bp keys | Minimal Rating Service stub — validates keys + values against locked rubric | `src/rating/rating-service.ts` |

Scope limits: `ChallengeService` and `RatingService` are WS-1A-only scaffolds. The full 8-step rating validation pipeline (API Contract Flag 1) enters scope in WS-1B when hash recomputation and signature verification land.

## Patent-critical invariants

These are non-negotiable and guarded by frozen test fixtures. Any drift breaks downstream tracks silently.

1. **Canonical JSON is byte-deterministic.** Sorted keys, null omission, integer-only, no floats. `src/canonical/canonical-json.ts`. Golden string in `tests/unit/canonical-json.test.ts :: test_claim_1_deterministic_serialization` is frozen; changing it requires a coordinated version bump across T1–T9.
2. **Rating Service validation order.** Hash recomputation BEFORE signature verification (API Contract Flag 1). Enforced in tests once WS-1B lands.
3. **Signatures are over digests, not raw JSON.** Ed25519 over the 32-byte event_hash. See `src/canonical/event-hash.ts`.
4. **Rubrics are immutable after publish.** Enforced at app layer, DB trigger (`rubrics_no_update_after_publish_trg`), and weight-sum deferred constraint.
5. **BIGINT round-trips as string → BigInt.** `pg.types.setTypeParser(20, ...)` in `src/http/server.ts` forces this; repository layer converts to `BigInt`.

## Getting started

```bash
# Prereqs: Node 20.10+, Postgres 16+
npm install
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/core_spine
npm run migrate
npm run dev
```

Tests:

```bash
npm test                          # all tests
npm run test:claim-coverage       # just the claim-coverage suite (not yet populated; WS-1F)
```

## Reason code catalog

`src/errors/reason-codes.ts` is the single source of truth. Adding a code is a PR that requires PCO sign-off per T1-S1-G-02. Renaming a code is prohibited (PRD §6.6).

WS-1A added four codes: `RUBRIC_WEIGHT_SUM_INVALID`, `RUBRIC_VERSION_UNRESOLVABLE`, `RUBRIC_CRITERION_UNKNOWN`, `RUBRIC_CRITERION_MISSING`.

## Known gaps

- No `Dockerfile` or `docker-compose.yml` yet — local Postgres is bring-your-own.
- No HTTP integration tests against the running Fastify instance — unit tests cover the service layer with stubbed repo. Add `supertest` or `fastify.inject` tests before WS-1A sign-off.
- No DB integration tests proving the immutability and weight-sum triggers actually fire. Planned for the integration pass.
- Dependencies listed in `package.json` have not been installed in this environment (network-restricted sandbox). Verify `npm install` succeeds and tests pass before treating WS-1A as green.
- Canonical-JSON string escaping iterates UTF-16 code units; supplementary-plane characters (emoji) pass through correctly via `TextEncoder`, but a targeted test for surrogate pairs should be added before WS-1B.

## File map

```
src/
  canonical/          # canonical JSON serializer, event hash, Ed25519 helpers (patent-critical)
  rubric/             # types, Zod schemas, PG repo, service (WS-1A core)
  challenge/          # WS-1A stub: lock-rubric resolution only
  rating/             # WS-1A stub: criteria_scores_bp validation only
  http/               # Fastify server + routes
  errors/             # DomainError + locked reason-code catalog
  db/                 # migration runner
migrations/           # numbered SQL files (001_rubrics, 002_rubric_weight_sum)
tests/unit/           # vitest; test names use test_claim_N_* convention (per WS-1F)
```
