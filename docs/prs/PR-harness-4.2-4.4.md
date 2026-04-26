<!--
  PR description for the two Tier 2 claim-coverage harness fixes
  from the T1 Patent-Conformance Audit (2026-04-22):
    §4.2 — add describe() to the discovery regex alternation
    §4.4 — require .vitest-results.json when CLAIM_COVERAGE_REQUIRE_RESULTS=1

  Sequencing note: this PR depends on the §4.1 + §4.3 PR being merged
  first (meta-directory exclusion + registry-listed-file verification).
  Without §4.1, flipping the regex to include `describe` surfaces MORE
  false positives from the meta-directory fixtures. Do not merge this
  one until the first one is in main.

  Drafted against the house pull_request_template.md. Every checkbox and
  section header matches the template; content is filled in.
-->

## Summary

Fixes the two remaining audit defects in the claim-coverage harness identified as Tier 2 by the T1 Patent-Conformance Audit (2026-04-22): §4.2 (`describe()` blocks are invisible to discovery) and §4.4 (missing `.vitest-results.json` silently degrades to greedy-green). This is the companion PR to `harness-fix-4.1-4.3`, which landed the meta-directory exclusion and registry-path verification. That PR must be merged before this one — sequencing rationale in the "Why this depends on the first PR" section.

After this PR, every claim whose `test_claim_N_*` name is declared on a `describe()` block instead of `it()` becomes visible to discovery, and CI can no longer produce a green coverage report when vitest failed to emit results.

## Claim citation (required for patent-adjacent PRs)

- **Claim(s) implemented or affected:** None directly. Touches `src/claim-coverage/` only. The reporting of conformance for eight claims changes: Claims 1, 3, 14, 17, 19, 21, and others that declare `test_claim_N_*` names on `describe()` blocks will surface as discovered tests rather than falling through to the registry-fallback branch.
- **Story ID:** T1-S1-F-02 (harness), remediation for audit §4.2 + §4.4. Open a new story under WS-1F for tracking.
- **Test(s) added/updated:**
  - `tests/meta/claim-coverage-discover.test.ts` — MODIFIED. Adds four tests for `describe()` discovery.
    - `test_claim_coverage_discover_finds_claim_names_on_describe_blocks`
    - `test_claim_coverage_discover_finds_claim_names_on_describe_only_and_describe_skip`
    - `test_claim_coverage_discover_finds_both_describe_and_it_names_in_same_file`
    - `test_claim_coverage_discover_does_not_credit_describe_text_that_is_not_a_claim_name`
  - `tests/meta/claim-coverage-vitest-gate.test.ts` — NEW. Covers the `CLAIM_COVERAGE_REQUIRE_RESULTS` environment check.
    - `test_claim_coverage_require_results_throws_when_file_absent`
    - `test_claim_coverage_require_results_throws_when_file_older_than_registry`
    - `test_claim_coverage_require_results_passes_when_file_present_and_fresh`
    - `test_claim_coverage_require_results_ignores_when_flag_not_set`
- **Traceability doc entry updated?** [x] Yes — no new claim content; AMB-T1-004 notes this PR as a Tier 2 precondition for the registry-hygiene follow-up PR.

### Interpretation notes

No claim interpretation. The `describe()` discovery change aligns the harness with a convention the test suite already uses; the vitest-gate change is pure CI hygiene. No counsel sign-off required.

## What changed

### 1. `src/claim-coverage/discover.ts` — describe() discovery (audit §4.2)

**Problem.** Line 20 of the current file:
```typescript
const TEST_NAME_RE = /\b(?:it|test)(?:\.skip|\.only)?\s*\(\s*["']([^"']+)["']/g;
```
matches only `it(...)` and `test(...)` call sites. The test suite uses `describe("test_claim_N_...")` as a grouping convention in at least eight files (`canonical-json.test.ts`, `rubric-service.test.ts`, `rating-service.test.ts`, `challenge-service.test.ts`, `score-aggregator-service.test.ts`, `aggregator-wiring.test.ts`, `signal-ingestion.test.ts`, `rating-service.test.ts`). Every `test_claim_N_*` name declared on a `describe` block is silently ignored.

**Fix.** Extend the regex alternation to include `describe`:
```typescript
const TEST_NAME_RE = /\b(?:it|test|describe)(?:\.skip|\.only)?\s*\(\s*["']([^"']+)["']/g;
```

**No companion change to `eslint-rules/claim-test-naming.cjs` is required.** The ESLint rule already visits `describe` calls (see the `["it", "test", "describe"]` check at the bottom of the `CallExpression` visitor) and explicitly allows describe text to be anything (the rule's early-return at `if (calleeName === "describe") return;`). That pre-existing behavior is actually correct: the rule needs to permit both group-name describes (`describe("canonical JSON")`) and claim-test describes (`describe("test_claim_14_rubric_lock")`) because both usages coexist in the repo. What the audit §4.2 is fixing is in the *discovery* regex only — the linter is fine.

False-positive risk from widening discovery: zero. The claim-match second-stage filter (`CLAIM_NAME_RE` = `^test_claim_(\d+[A-Z]?)_[a-z][a-z0-9_]*$`) rejects any non-conforming describe text. Of the 87 `describe(...)` calls in the current test suite, 34 have `test_claim_N_*` names and 53 have group names like `describe("ScoreAggregator WS-1C wiring")` — the latter are filtered out at the claim-match step, not credited as coverage.

### 2. `src/claim-coverage/generate-report.ts` — vitest-results gating (audit §4.4)

**Problem.** `loadVitestStatuses()` catches the "file absent" case and returns an empty map. The `red_failing` check requires `testStatus.size > 0` before it can ever fire, so a missing `.vitest-results.json` makes every discovered test render as passing. The CI yaml is responsible for producing the file, but nothing enforces that it did — a yaml regression that drops the `--reporter=json` flag, or a vitest crash that aborts before writing the file, turns the gate silently green. The existing code comment acknowledges this ("CI is responsible for producing the file") without enforcing it.

**Fix.** Honor `CLAIM_COVERAGE_REQUIRE_RESULTS=1`. When the env var is set:
1. If `.vitest-results.json` is absent → throw a fatal error; the generator exits non-zero with a clear message.
2. If `.vitest-results.json` is present but older than `tests/claim_registry.yaml` (by mtime) → throw a fatal error; this catches the "stale results file left over from the previous run" case.
3. Otherwise — the file is present and fresh — load it normally.

When the env var is unset, preserve current behavior (greedy-green-on-absent). The env approach lets local development continue to work without the results file while making CI strictly gated.

**CI wiring.** Update `.github/workflows/ci.yml` to set `CLAIM_COVERAGE_REQUIRE_RESULTS=1` in the step that runs `npm run claim-coverage:report`. This is a one-line change to the workflow.

## Why this depends on the first PR

Merging §4.2 (describe discovery) **before** §4.1 (meta-directory exclusion) would make the false-positive problem worse, not better. The meta-test `tests/meta/claim-test-naming-rule.test.ts` contains RuleTester fixtures like:
```typescript
code: `describe("some group", () => { it("test_claim_1_ok", () => {}); });`
```
Today's regex only matches the `it(...)` call inside that fixture — five false positives for meta-test fixtures. After §4.2 without §4.1, the regex would ALSO match the outer `describe("some group", ...)` and any other fixture `describe` strings — more false positives, not fewer. The first PR's exclusion of `tests/meta/` makes it safe to widen the regex.

The correct merge order is: `harness-fix-4.1-4.3` → this PR → `registry-hygiene`. If the first PR is not yet merged when this PR is opened, set this one to draft.

## Before / after

Expected `npm run claim-coverage:report` output changes against the current registry, assuming §4.1+§4.3 is already merged:

| Claim | Before (§4.1+§4.3 only) | After (this PR) | Cause |
|---|---|---|---|
| 1 | 🔴 red_missing (names on describe, fallback downgraded by §4.3) | 🟢 GREEN | §4.2 — five `test_claim_1_*` names on describes across 7 files become discoverable |
| 3 | 🟢 GREEN (10 it-based + some on describes) | 🟢 GREEN (richer coverage — 17 tests) | §4.2 — additional describe-based names surface |
| 14 | 🟢 GREEN (some on describe, some on it) | 🟢 GREEN (richer coverage — 20+ tests) | §4.2 — same |
| 17 | 🟢 GREEN | 🟢 GREEN (no change; existing tests are it-based) | — |
| 19 | 🔴 red_missing (both names on describes) | 🟢 GREEN | §4.2 — two `test_claim_19_*` describes become discoverable |
| 21 | 🔴 red_missing (or yellow_legacy depending on file presence) | 🟢 GREEN (status change follows in registry-hygiene PR) | §4.2 — five `test_claim_21_*` describes in canonical-json + rubric-service + score-aggregator + aggregator-wiring |

**Claim 21 is the interesting case.** The registry still has `status: legacy` for Claim 21, but after this PR primary discovery finds five matching tests — so the harness will render GREEN (primary discovery always wins over the fallback branches). The registry's status field becomes out-of-sync with reality; the registry-hygiene PR that follows this one is the place to flip it to `implemented` and drop the `rename_target` field.

**Claim 23** is unchanged by this PR. Its two `test_claim_23_*` names are already on `it()` calls and already discovered; this PR only affects describe-based discovery.

The `describe` widening does NOT introduce new false positives from the real test suite — every discovered name is still required to match the `CLAIM_NAME_RE` pattern (`^test_claim_(\d+[A-Z]?)_[a-z][a-z0-9_]*$`), so group names like `describe("core spine integration")` remain ignored.

## Testing

- [ ] `npm run typecheck`
- [ ] `npm test` — including the nine new `test_claim_coverage_*` tests
- [ ] `npm run lint` — the ESLint rule update must also pass; the existing `claim-test-naming-rule.test.ts` has a valid-case fixture that already uses `describe` (line 47–49 in current file) which will start to exercise the rule's new code path
- [ ] `npm run claim-coverage:report` — output matches the "After" column above
- [ ] `CLAIM_COVERAGE_REQUIRE_RESULTS=1 npm run claim-coverage:report` with a stale or missing `.vitest-results.json` — expect non-zero exit, clear error message on stderr

New tests cover:

1. **`describe(...)` names are discovered** — synthetic file with `describe("test_claim_1_ok", ...)` produces one discovery.
2. **`describe.only(...)` and `describe.skip(...)`** — the `(?:\.skip|\.only)?` suffix on the alternation covers describe variants.
3. **Mixed describe + it in same file** — both surface as separate discoveries.
4. **Non-claim describe text is ignored** — `describe("feature area", ...)` is still not credited; only strings matching `CLAIM_NAME_RE` count.
5. **ESLint rule accepts describe-based names** — extend the valid fixtures in `claim-test-naming-rule.test.ts` with a `describe("test_claim_N_...")` case.
6. **Env-gated results requirement** — four scenarios: env unset + file absent (no throw, greedy-green as today); env set + file absent (throw); env set + file older than registry (throw); env set + file present and fresh (pass).

## Documentation

- [x] Reason codes added/changed? No.
- [x] OpenAPI schema changed? No.
- [x] SMR or API-contract section changed? No.
- [x] `docs/claim-coverage.md` updated:
  - §F-02 test-name convention note updated to mention `describe` as a valid declaration site.
  - New §F-05 subsection on `CLAIM_COVERAGE_REQUIRE_RESULTS=1` — when to set it (CI always; local development never by default).
- [x] `.github/workflows/ci.yml` updated — one-line env var set on the coverage step.

## Out of scope (handled separately)

- **Registry-hygiene PR** — once this PR lands, Claim 21 should flip from `legacy` to `implemented`; Claim 19's `status: implemented` becomes backed by real discovery rather than file-listing fallback; etc. Tracked as a follow-up PR (`registry-hygiene-post-harness`). Do not bundle that into this PR — data changes go through a separate review.
- **ESLint flat-config migration** (audit §5.6) — the `--rulesdir` CLI flag is deprecated in ESLint 8.57 and removed in 9.x. Tracked for Sprint 2 per audit §9.3.
- **Reason-code uniqueness test** (audit §6.3) — orthogonal to coverage harness.

## Hotfix exception

- [ ] Emergency hotfix (PCO review will follow within 2 business days)

Not a hotfix. Normal PCO review per CODEOWNERS.
