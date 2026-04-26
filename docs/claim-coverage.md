# Claim Coverage Harness — Usage & Story-to-Code Map

Story coverage for WS-1F (Claim-Coverage Test Harness).

## F-01 — Naming convention + CI lint

**Enforcer:** Custom ESLint rule at `eslint-rules/claim-test-naming.cjs`. Loaded via `eslint --rulesdir eslint-rules` in `package.json`'s `lint` script.

**Scope:** Files matching `*.test.{ts,tsx,js,jsx}` whose path contains any of `/canonical/`, `/rubric/`, `/rating/`, `/challenge/`, `/scoring/`, `/payout/`, `/audit/`, `/replay/`.

**Allowed names:** `test_claim_{N}_{snake_case_description}` where `{N}` is digits optionally followed by a single uppercase letter (e.g., `test_claim_1_deterministic_serialization`, `test_claim_13A_canonical_hashing`).

**Error message:** Includes the filename and a link to `docs/patent-conformance-sow.md#test-naming` (which lives under WS-1G, T1-S1-G-03).

**Excluded paths (by design):** `tests/meta/` and any other path outside patent-adjacent packages — so generator meta-tests, fixture helpers, etc. don't need the convention.

## F-02 — Report generator

**Entry point:** `npm run claim-coverage:report` → `src/claim-coverage/generate-report.ts`.

**Inputs:**
1. `tests/claim_registry.yaml` — source of truth for which claims we track and their expected state.
2. Regex scan of `tests/**/*.test.ts` for `it("test_claim_N_...")` / `test(...)` names.
3. Optional `.vitest-results.json` from `npm test -- --reporter=json --outputFile=...` for pass/fail. When absent, the generator assumes tests pass (documented as "greedy-green" fallback — CI always produces the file).

**Outputs (written to `coverage-report/`):**
- `claim-coverage.md` — Markdown table, one row per claim, GitHub-renderable.
- `claim-coverage.html` — styled HTML version, safe against XSS via title escaping.

**Determinism:** With `CLAIM_COVERAGE_FROZEN_TS=0` in the env, the report is byte-identical across runs for a given registry+test set. CI leaves it unset so the header carries a real timestamp.

**Exit code:** Non-zero iff any claim is `red_failing` (tests exist but failing). Placeholders are informational, not failures — they're expected during a sprint.

**CI integration:** `.github/workflows/ci.yml` uploads `coverage-report/` as an artifact named `claim-coverage-report` on every main-branch build and every PR.

## F-03 — Seed registry

`tests/claim_registry.yaml` contains 26 entries (claims 1–23 plus 13A, 13B, 20A). Status taxonomy:

- **implemented** — at least one `test_claim_N_*` test exists today and is passing. Green.
- **legacy** — the claim is genuinely exercised by existing tests that predate the convention. Yellow, with `rename_target` and `rename_story: T1-S1-F-04`.
- **placeholder** — claim not yet implemented. Red until the corresponding story lands. Optionally tagged with `blocked_by: "<story-id>"`.

Current breakdown:

| Status | Count | Claim IDs |
|---|---|---|
| implemented | 4 | 1, 13A, 13B, 14 |
| legacy | 7 | 6, 7, 8, 9, 16, 18, 21 |
| placeholder | 15 | 2, 3, 4, 5, 10, 11, 12, 13, 15, 17, 19, 20, 20A, 22, 23 |

## F-04 — Rename note (greenfield context)

F-04 as written assumes existing tests from a pre-sprint codebase that need renaming. In this greenfield repo the "legacy" tests **do not yet exist on disk** — they're registered as the expected home for the relevant claim coverage when the matching modules (reel composer, payout engine, monetization ledger) are built in later sprints.

Operationally F-04's intent in the greenfield world becomes:

1. **For every future story that implements a legacy-tagged claim (6, 7, 8, 9, 16, 18, 21),** write the test with the `test_claim_N_*` name from day one and update the registry entry from `legacy` to `implemented`.
2. **Legacy entries currently render yellow** in the report until that happens.

We are keeping the `legacy` status as documentation of "the registry expects this; bring it up to green when you ship it."

## Adding a new claim

1. Edit `tests/claim_registry.yaml` (PR requires PCO sign-off per T1-S1-G-02).
2. Add at least one `test_claim_{N}_*` test in the relevant patent-adjacent package.
3. Run `npm run claim-coverage:report` locally to verify the claim flips to green.
4. CI will render the report as an artifact on merge.

## Reference

- Story breakdown: `T1-S1-F-01` through `T1-S1-F-04` in `YouRip_T1_Sprint1_Stories.csv`.
- Reason-code catalog (separate but related artifact): `src/errors/reason-codes.ts`.
