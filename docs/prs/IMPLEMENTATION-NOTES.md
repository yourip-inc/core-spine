# Implementation notes for the claim-coverage harness §4.2 + §4.4 PR

Companion to `PR-harness-4.2-4.4.md`. Records three design decisions and the
pre-merge verification results.

## What this package contains

**This package ships the full post-PR1-post-PR2 state of the files.** It is
not a pure diff-on-top of PR1 — each file here is the complete version that
should land after both PRs are merged.

Concretely, these files contain the PR1 changes plus the PR2 changes:

| File | Changed by PR1? | Changed by PR2? |
|---|---|---|
| `src/claim-coverage/discover.ts` | Yes (meta exclusion) | Yes (describe in regex + docstring) |
| `src/claim-coverage/generate-report.ts` | Yes (fallback verification) | Yes (vitest-results gate) |
| `src/claim-coverage/verify-test-files.ts` | Yes (new file) | No |
| `src/claim-coverage/types.ts` | Yes (diagnostics field) | No |
| `src/claim-coverage/render.ts` | Yes (diagnostics rendering) | No |
| `tests/meta/claim-coverage-discover.test.ts` | Yes (new file) | Yes (appended 4 describe tests) |
| `tests/meta/claim-coverage-generate-report.test.ts` | Yes (new file) | No |
| `tests/meta/claim-coverage-vitest-gate.test.ts` | No | Yes (new file) |

If PR1 has already been merged when the engineer picks this PR up, they
should apply only the PR2-specific deltas:
- `discover.ts`: one-line regex change + docstring update
- `generate-report.ts`: docstring update, new `VitestResultsRequiredError`
  export, new `assertVitestResultsFresh()` helper, `generateReport`
  signature extension, `loadVitestStatuses()` path parameter, `main()`
  error handling tidy
- `tests/meta/claim-coverage-discover.test.ts`: append the "§4.2 —
  describe() discovery" section
- `tests/meta/claim-coverage-vitest-gate.test.ts`: new file

## Design decision 1 — no ESLint rule change needed

The original PR description said the companion change to
`eslint-rules/claim-test-naming.cjs` was required. That was wrong. Reading
the rule carefully:

- Line 80: the `CallExpression` visitor already matches `["it", "test", "describe"]`.
- Line 67–68: inside the check function, `describe` calls return early with
  a comment *"\`describe\` blocks are group names; allow them freely"*.

That early-return is intentional and should stay. The repo uses `describe`
two ways that both need to be valid:

1. **Group-name describe** (53 occurrences): `describe("ScoreAggregator WS-1C wiring", () => { ... })`.
2. **Claim-name describe** (34 occurrences): `describe("test_claim_21_byte_level_determinism", () => { ... })`.

If the rule started requiring `test_claim_N_*` naming on all describes, the
53 group-name describes would all fail lint. What §4.2 is fixing is
strictly in the *discovery* regex — the linter is fine as-is.

**Implication:** when merging this PR, do NOT touch
`eslint-rules/claim-test-naming.cjs`. The existing tests in
`tests/meta/claim-test-naming-rule.test.ts` continue to pass unmodified.

## Design decision 2 — env-var fallback requires strict `=== "1"`

`CLAIM_COVERAGE_REQUIRE_RESULTS` is checked against the string `"1"` only,
not parsed as a boolean. Values like `"true"`, `"yes"`, or an empty string
do NOT enable the gate.

Rationale: with loose truthy checking, a misspelling like
`CLAIM_COVERAGE_REQUIRE_RESULT=true` (singular) in CI yaml would silently
leave the gate off, because `process.env.CLAIM_COVERAGE_REQUIRE_RESULTS`
would be `undefined` and therefore falsy. Making `"1"` the sole enablement
value means a misspelled env var fails loudly (the gate is off and CI runs
normally, which matches the local-dev case), but in exchange, a
*correctly-spelled* env var can't be accidentally defeated by setting it to
`"false"` or `"0"`. Tests in `claim-coverage-vitest-gate.test.ts` pin this
behavior so a future refactor doesn't relax it.

Tradeoff accepted: someone setting the env var via `export CLAIM_COVERAGE_REQUIRE_RESULTS=true`
will be confused when nothing happens. The test message and docstring
both mention `=1` specifically to make this discoverable.

## Design decision 3 — strict-less-than on mtime

`resultsStat.mtimeMs < registryStat.mtimeMs` uses `<`, not `<=`. On
filesystems with second-resolution mtime (ext3, some NFS mounts), a
registry written and a results file written within the same second will
have the same mtime; `<=` would incorrectly flag them as stale. The `<`
variant is forgiving of this while still catching the case the audit
flagged: a test run that predated a registry change.

The smoke test scenario 3 exercises this path — it sleeps 1.1 seconds
between writing the registry and writing the results file to ensure the
mtime ordering works even on coarse filesystems.

## Pre-merge verification performed

### Type-checking

Against the repo's strict settings (`strict: true`,
`exactOptionalPropertyTypes: true`, `noUnusedLocals`, `noUnusedParameters`):
**0 errors** across all seven production + test files.

### Runtime smoke tests

**§4.2 — describe() discovery** against a temp directory with:
- A real test file containing two describe-level claim-21 names + one
  it-level claim-3 name + one group-name describe.
- A meta-directory fixture file containing a literal `describe("test_claim_1_...", ...)`
  inside a template string (the RuleTester-style fixture case).

| Expected | Observed |
|---|---|
| 3 discoveries | ✓ 3 discoveries |
| Two claim-21 on describes | ✓ found |
| One claim-3 on it | ✓ found |
| Group-name describe filtered by CLAIM_NAME_RE | ✓ not in output |
| Meta fixture excluded (§4.1 still works) | ✓ not in output |

**§4.4 — vitest-results gate**, six scenarios:

| # | Setup | Expected | Observed |
|---|---|---|---|
| 1 | `requireVitestResults=true`, results absent | throws `VitestResultsRequiredError` | ✓ correct type, correct message |
| 2 | `requireVitestResults=true`, results older than registry | throws with "older than the claim registry" | ✓ correct type, correct message |
| 3 | `requireVitestResults=true`, results present and fresh | passes, returns report | ✓ `report.summary.total=1` |
| 4 | `requireVitestResults=false`, results absent | no throw, greedy-green | ✓ returns report |
| 5 | env var `=1`, opts not provided, results absent | throws | ✓ correct type |
| 6 | env var `=true`, opts not provided, results absent | no throw (strict "1" only) | ✓ returns report |

Runtime behavior matches spec exactly.

### Not verified

I could not run `npm test` against the actual repo — sandbox has no network
access, so vitest could not be installed. The PR's "Testing" checkboxes in
the PR description remain for the engineer picking this up. The type-check
and smoke-test evidence above is stronger than most PRs get at handoff, but
is not a substitute for `npm test && npm run claim-coverage:report` against
the real tree.

## Ready-to-merge order

1. **PR 1 (`harness-fix-4.1-4.3`) must be in main first.** Without §4.1,
   the §4.2 regex widening makes false positives worse, not better.
2. Drop the seven files from this package into their repo locations.
3. Run `npm run typecheck` — expect 0 errors.
4. Run `npm test` — expect 18 tests from PR1 + 10 new from PR2 = 28 new
   `test_claim_coverage_*` tests passing.
5. Run `npm run claim-coverage:report` — expect the "After" column from
   PR-harness-4.2-4.4.md to reproduce: Claims 1, 3, 14, 19, 21 become
   richer or newly-discoverable.
6. Add `CLAIM_COVERAGE_REQUIRE_RESULTS=1` to `.github/workflows/ci.yml` on
   the step that runs `npm run claim-coverage:report`.
7. Run `CLAIM_COVERAGE_REQUIRE_RESULTS=1 npm run claim-coverage:report`
   with a fresh `.vitest-results.json` — expect clean exit.
8. Temporarily delete `.vitest-results.json` and re-run with the flag set
   — expect non-zero exit with a clear error message on stderr.

## Lines of code delta

From post-PR1 to post-PR2:

| File | PR1 | PR2 | Delta (PR2 only) |
|---|---|---|---|
| `discover.ts` | 143 | 155 | +12 (docstring + regex) |
| `generate-report.ts` | 218 | 276 | +58 (gate + error class) |
| `tests/meta/claim-coverage-discover.test.ts` | 132 | 250 | +118 (describe tests) |
| `tests/meta/claim-coverage-vitest-gate.test.ts` | 0 | 198 | +198 (new file) |
| **Total delta** | | | **+386** |

No changes to `verify-test-files.ts`, `types.ts`, `render.ts`, or
`tests/meta/claim-coverage-generate-report.test.ts` in PR2.
