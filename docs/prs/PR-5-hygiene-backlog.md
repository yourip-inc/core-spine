# PR #5 Hygiene Backlog

Tracking doc for items deferred from PR #5 (T1 patent claim-ID backfill —
CS-prefix migration). All items in this doc are non-blocking; they are
documentation, comment, or lint hygiene with **zero runtime, build, or
test impact**. Substance of the migration shipped in PR #5's 9 commits.

This doc is the source of truth for what the post-PR-5 hygiene chunk
will address.

## Status

- **PR #5 status:** awaiting merge after PCO sign-off
- **Hygiene chunk status:** not started; runs after PR #5 merges
- **Owner:** youripapp
- **Target sprint:** post-PR-5, ahead of T2 story A-02 work resumption

## Items deferred

### 1. Pre-existing lint errors (71 baseline)

Source: PR #5 description, communicated to PCO as awareness/FYI.

The eslint custom-rule loader (`eslint-rules/claim-test-naming.js`)
fires 71 pre-existing errors on the post-PR-5 tree. None of these were
introduced by PR #5; they reflect descriptive-it()-inside-claim-named-
describe() patterns that predate the chunk-C regex tightening.

Resolution path: rename inner it() calls to conform to `CLAIM_NAME_RE
= /^test_claim_(CS_\d+[A-Z]?)_[a-z][a-z0-9_]*$/`. Same pattern as
chunk I's CS-13A umbrella block fix. Estimated ~71 substitutions
across patent-adjacent test files.

CPO override approved this deferral on the basis that the substance
of PR #5 (CS-prefix migration) is sound and the lint errors are
unrelated; addressing them inline would have expanded PR #5's
scope significantly.

### 2. Round 5 doc-drift sites (2 sites)

Source: Code Review Round 5 on PR #5 (post-chunk-I).

Two CS-prefix migration drift sites that survived the round-by-round
audit. Both are pure documentation/comment drift; the runtime
authority (regex on line 123 of verify-test-files.ts; the it() calls
themselves in decimal4.test.ts) is correct.

**Site A — `src/claim-coverage/verify-test-files.ts` line 106**

The `buildClaimNameRegex` JSDoc currently reads:
```
Build a regex that matches a `test_claim_CS_N[claimId]?` token in source.
```

This is grammatically broken — it mixes a literal placeholder
(`CS_N`) with what reads as a regex character class plus optional
marker (`[claimId]?`). The pre-PR text was a coherent template-
literal example: `test_claim_${claimId}_`. The CS-migration regex
substituted incorrectly.

**Fix:** change the docstring to mirror the actual code on line 123:
```
Build a regex that matches a `test_claim_${testNameId}_` token in source.
```
or, if you prefer the placeholder shape:
```
Build a regex that matches a `test_claim_CS_${N}_` token in source.
```

One-token edit.

**Site B — `tests/unit/scoring/decimal4.test.ts` line 7**

Header comment currently reads:
```
* File path: tests/unit/scoring/... → patent-adjacent → uses test_claim_N_* naming.
```

Every it() call in the file (lines 15-105, 14 calls) was renamed
by chunk D to `test_claim_CS_N_*` form. The header advertises the
old convention while the body uses the new one — file contradicts
itself within 8 lines.

**Fix:** change `test_claim_N_*` to `test_claim_CS_N_*` (or
`test_claim_{PREFIX}_{N}_*` to mirror Rule 1's vocabulary in
CLAUDE.md).

One-token edit.

## Approach for the hygiene chunk

When the hygiene chunk runs, take a unified-sweep approach rather
than round-by-round. Specifically:

1. **Add an automated check** (lint rule or test) that fails when
   bare-numeric claim references appear in patent-adjacent context.
   This is "Option 2" discussed in PR #5's planning conversation —
   surface all drift programmatically rather than via review rounds.

   Candidate locations:
   - Extend `eslint-rules/claim-test-naming.js` to also flag
     `test_claim_N_*` and bare-numeric `Claim N` references in
     comments/docstrings of patent-adjacent paths.
   - Or add a meta-test in `tests/meta/` that greps
     `src/`, `tests/`, `eslint-rules/`, and `CLAUDE.md` for
     CS-drift patterns.

2. **Run the check, see what surfaces, fix everything that does.**
   This is by definition all the drift. No round-by-round dance.

3. **Address the 71 pre-existing lint errors** (item 1 above)
   alongside the same sweep, since they're the same family of
   substitution work.

The 2 Round 5 sites (item 2 A and B) will fall out of step 2
automatically. Listing them here for completeness in case the
automated check approach is deferred further.

## Related

- PR #5 thread: https://github.com/yourip-inc/core-spine/pull/5
  (Round 5 deferral comment posted)
- CLAUDE.md Rule 1 — claim test naming convention
- `eslint-rules/claim-test-naming.js` — runtime authority for naming

## Changelog

- **2026-05-01** — created. Initial scope: 71 pre-existing lint errors
  + 2 Round 5 doc-drift sites.
