# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

YouRip **T1 Core Spine** — a TypeScript + Fastify + Postgres server implementing the PRD-T1-CORE-SPINE and PRD-T1-API contracts. This is a *patent-adjacent* codebase: most of `src/` corresponds directly to specific patent claims (1, 3, 10, 11, 13A/B, 14, 19, 21, 23). Treat changes to those directories accordingly — see "Patent conformance" below.

Sprint 1 (WS-1A through WS-1G) is complete; open work is tracked in `ACCEPTANCE.md` §"Open for next sprint follow-up". `docs/history/MERGE_MANIFEST.md` records how this tree was assembled from upstream zips — only useful if auditing history.

## Commands

```bash
npm install
npm run dev                                  # tsx watch src/http/server.ts
npm run build                                # tsc → dist/
npm run start                                # node dist/http/server.js
npm run typecheck                            # tsc --noEmit (strict mode, exactOptionalPropertyTypes)
npm run lint                                 # eslint with custom --rulesdir eslint-rules
npm test                                     # vitest run (tests/**/*.test.ts)
npm run test:watch
npm run test:claim-coverage                  # only tests/claim-coverage/
npm run migrate                              # runs migrations/*.sql via src/db/migrate.ts
npm run claim-coverage:report                # writes coverage-report/claim-coverage.{md,html}

# Single test file / single test name
npx vitest run tests/unit/rubric-service.test.ts
npx vitest run -t "test_claim_1_deterministic_serialization"

# Local stack (postgres + migrate + server)
docker compose up postgres migrate
```

Node 20.10+. `DATABASE_URL=postgres://postgres:postgres@localhost:5432/core_spine` is the dev default.

## Architecture

HTTP → service → repository → Postgres. Wiring is in `src/http/server.ts::buildServer`. Services take a `pg.Pool` and a repo interface so tests inject in-memory fakes.

- **`src/canonical/`** — `canonical-json.ts` (sorted keys, null omission, integers only, no floats, UTF-8 bytes, no whitespace) and `event-hash.ts`. **Patent-critical.** `event_hash` is SHA-256 over `canonicalBytes(...)`; Ed25519 signatures are over the 32-byte digest, **never** raw JSON. Byte output MUST NOT change for a given input without a coordinated version bump across T1–T9 (golden fixture: `tests/unit/canonical-json.test.ts :: test_claim_1_deterministic_serialization`).
- **`src/scoring/`** — `Decimal4` stores values as BigInt at scale 10_000. Division **truncates** (floor for positives), not half-away-from-zero — this matches the AC fixture `[2.0, 1.0, 1.0] → n_eff = 2.6666`. Documented in `decimal4.ts` top comment; any rounding change breaks the patent example in paragraph 333.
- **`src/rubric/`** — rubrics are immutable after publish. Enforcement is layered: Zod schema → app check (`RUBRIC_WEIGHT_SUM_INVALID` when criteria `weight_bp` sum ≠ 10000) → DB trigger `rubrics_no_update_after_publish_trg` → deferred weight-sum constraint. All three must agree.
- **`src/migration/`** — Claim 11 migration records. `migration_checksum` is computed in TypeScript; the plpgsql `verify_migration_checksum()` exists as an audit cross-check and is deliberately NOT attached to an INSERT trigger (TS-vs-plpgsql string-escape divergence would cause silent drift per API Contract Flag 3). TS is authoritative.
- **`src/errors/reason-codes.ts`** — locked enum; **renaming a code is prohibited** (PRD §6.6). Adding one requires PCO sign-off (T1-S1-G-02) and a new registry row if claim-relevant.
- **`src/submission/contributor-role.ts`** — 4 canonical roles + `FILMER` deprecated alias. `FILMER` stays in the Postgres enum for one release cycle (PG can't remove enum values); the `no-filmer-outside-alias` ESLint rule blocks new references outside the alias-normalization layer. Sunset target `2026-10-01`.
- **`src/claim-coverage/`** — harness that reads `tests/claim_registry.yaml`, scans `tests/**/*.test.ts` for `test_claim_N_*` names, consumes `.vitest-results.json`, and renders `coverage-report/claim-coverage.{md,html}`. Exits non-zero on `red_failing` only; `red_missing`/placeholder is informational.

### Patent conformance

Patent-adjacent paths (enforced by CODEOWNERS + PR template): `src/canonical/`, `src/rubric/`, `src/rating/`, `src/challenge/`, `src/scoring/`, `src/migration/`, `src/submission/`, `src/errors/reason-codes.ts`, `migrations/`, `openapi/`, `tests/unit/` mirrors, `docs/patent/`.

Rules that apply in those paths:

1. **Test naming:** every `it(...)` / `test(...)` name in a patent-adjacent test file must match `test_claim_{N}_snake_case` (N = digits, optional single uppercase suffix like `13A`). Enforced by `eslint-rules/claim-test-naming.js`. `describe(...)` is exempt. `tests/meta/` is excluded.
2. **Claim registry:** `tests/claim_registry.yaml` is the source of truth for claim status (`implemented` | `legacy` | `placeholder`). Changes to it need PCO review. When you implement a `placeholder` or `legacy` claim, flip its status here *and* add a matching `test_claim_N_*` test; `npm run claim-coverage:report` must go green for it.
3. **Reason codes:** add to `src/errors/reason-codes.ts`; never rename; never reuse a code across domains (see AMB-T1-003 in `docs/patent/claim-traceability.md`).
4. **BIGINT handling:** `pg.types.setTypeParser(20, String)` is set module-level in `src/http/server.ts`. The repo layer converts to `BigInt`. Never let a BIGINT round-trip as JS `number` — precision loss past 2^53 silently corrupts event hashes.

### Config

- `tsconfig.json` — strict, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `moduleResolution: bundler`, ESM (`"type": "module"` in `package.json`; imports use `.js` suffixes).
- `vitest.config.ts` — `tests/**/*.test.ts`, `globals: false` (import `describe`/`it` explicitly), v8 coverage over `src/**`.
- `.eslintrc.cjs` — loads custom rules `claim-test-naming` and `no-filmer-outside-alias` via `--rulesdir eslint-rules`. Running `eslint` without `--rulesdir` will fail on the custom rule names.
- CI (`.github/workflows/ci.yml`) runs typecheck → lint → `npm test -- --reporter=json --outputFile=.vitest-results.json` → `claim-coverage:report` and uploads `coverage-report/` as an artifact.
