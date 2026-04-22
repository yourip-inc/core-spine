# Sprint 1 Close-Out — PR Sequence Summary

Companion to the T1 Patent-Conformance Audit (2026-04-22). This document
tracks the full ordered sequence of PRs and documents needed to close Sprint 1
and reach a signable exit memo.

## The chain

Four workstreams, strict ordering between them:

```
 ┌──────────────────────────────────────────────────────────────────┐
 │ 0. AMB-T1-004 — counsel sign-off on canonical claim numbering    │
 │    (blocks exit-memo signature; everything downstream)           │
 │    Artifact: AMB-T1-004-entry.md                                 │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 1. PR: harness-fix-4.1-4.3                                       │
 │    - §4.1 exclude tests/meta from discovery                      │
 │    - §4.3 verify registry-listed test_files (exist + name match) │
 │    Artifact: PR-harness-4.1-4.3.md + harness-fix-code.zip        │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 2. PR: harness-fix-4.2-4.4                                       │
 │    - §4.2 add describe() to discovery regex                      │
 │    - §4.4 gate missing .vitest-results.json                      │
 │    Artifact: PR-harness-4.2-4.4.md                               │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 3. PR: registry-hygiene                                          │
 │    - §5.1 fix Claim 2 + Claim 23 blocked_by                      │
 │    - §5.2 clear phantom paths; promote Claim 21                  │
 │    - §5.3 update docs/claim-coverage.md counts                   │
 │    - §5.4 fix Claim 17 title in traceability doc                 │
 │    - §5.5 delete CODEOWNERS (1) from Archive_2                   │
 │    Artifact: PR-registry-hygiene.md + registry-hygiene/*         │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 4. AMB-T1-004 relabel work                                       │
 │    - Rename every test_claim_N_* symbol to canonical numbering   │
 │    - Update Jira CSV claim-N labels                              │
 │    - Rewrite registry entries authored against draft numbering   │
 │    - Re-run claim-coverage:report; amend or confirm §2 of memo   │
 │    (Only starts after counsel sign-off from step 0)              │
 └────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ 5. Exit memo signature                                           │
 │    - Apply EDITS 1–4 from exit-memo-AMB-T1-004-updates.md        │
 │    - Assign target sprint to AMB-T1-001                          │
 │    - PCO signs §8                                                │
 │    Artifact: exit-memo-AMB-T1-004-updates.md                     │
 └──────────────────────────────────────────────────────────────────┘
```

## Why this order

**Step 0 before steps 1–3.** Without counsel sign-off on canonical numbering,
every relabel in step 4 is premature; the registry/doc edits in step 3 might
need to be redone; harness fixes in steps 1–2 operate on the wrong data.
Step 0 is document and counsel work, not a PR — it unblocks the rest.

**Step 1 before step 2.** §4.1 must land before §4.2 because widening the
discovery regex to include `describe` without also excluding the meta
directory would increase the false-positive rate, not decrease it. The
`tests/meta/claim-test-naming-rule.test.ts` file contains RuleTester fixture
strings that include literal `describe("test_claim_1_...", ...)` — those
would be credited as coverage before §4.1 excludes the whole meta subtree.

**Step 2 before step 3.** The registry-hygiene PR promotes Claim 21 from
`legacy` to `implemented` on the basis of five `describe()`-level test names
that exist today but are invisible to discovery until §4.2 lands. Landing
the promotion first would cause the post-§4.3 harness to fail-verify the
promoted entry and render Claim 21 as red_missing.

**Step 4 after steps 1–3.** The relabel is mechanical search-and-replace
across code, tests, Jira CSVs, and the registry. Doing it against a harness
that cannot produce trustworthy output, or against a registry that still
contains contradictions, means you cannot verify the relabel afterward.
Land the harness and registry cleanups first, THEN relabel against known-
good infrastructure.

**Step 5 is last.** The exit memo's §2 gate-claim table asserts "6 of 9
green" and the remediation plans in §3 depend on knowing which claim number
refers to which patent claim. Neither can be signed honestly until 0–4 are
done.

## Artifacts in this close-out package

| Step | Artifact | Status |
|---|---|---|
| 0 | `AMB-T1-004-entry.md` — drop-in for claim-traceability.md | Delivered |
| 0 | `exit-memo-AMB-T1-004-updates.md` — four edits for sprint-1-exit-memo.md | Delivered |
| 1 | `PR-harness-4.1-4.3.md` — PR description | Delivered |
| 1 | `harness-fix-code.zip` — all five production files + two test files, type-checked + smoke-tested | Delivered |
| 1 | `harness-fix/IMPLEMENTATION-NOTES.md` — design decision + verification results | Delivered |
| 2 | `PR-harness-4.2-4.4.md` — PR description | Delivered |
| 2 | `harness-fix-4.2-4.4/` — full source tree, type-checked + smoke-tested | Delivered |
| 2 | `harness-fix-4.2-4.4/IMPLEMENTATION-NOTES.md` — design decisions + verification | Delivered |
| 3 | `PR-registry-hygiene.md` — PR description | Delivered |
| 3 | `registry-hygiene/tests/claim_registry.yaml` — corrected registry, diff-verified | Delivered |
| 3 | `registry-hygiene/docs/patent/claim-traceability-patch.md` — Claim 17 title fix | Delivered |
| 3 | `registry-hygiene/docs/claim-coverage-patch.md` — §F-03/§F-04 doc updates | Delivered |

## What's NOT in this package

**Step 4 relabel work.** Mechanical search-and-replace; the exact scope
depends on which numbering counsel names canonical. Cannot be written
until step 0 resolves.

**Sprint 2 items.** The audit §9.3 list (ESLint flat-config, DB integration
tests, Claims 2/12/15 remediation) is not in scope for Sprint 1 close and
is not addressed in this package.

## One thing to watch

Across all the artifacts in this package, I assumed that **AMB-T1-004
will resolve in favor of Option A** (filed non-provisional as canonical).
The PR for step 3 (registry hygiene) specifically says it does not touch
claim *numbers*, only metadata, to stay safe under either numbering. But
the traceability and exit-memo edits in step 0 read the filed numbering as
the presumptive answer. If counsel overrules and picks Option B (Jira-CSV
numbering as canonical), the exit-memo EDIT 2 and EDIT 3 need rephrasing —
not reversing, just rephrasing — and the step 4 relabel work runs against
the code/tests/CSVs instead of the registry. Everything else in this
package is safe under either numbering.

## Estimated sequencing

With full engineering focus:

- **Day 0:** Raise AMB-T1-004 with counsel. Wait for sign-off (counsel-sync.md §2 says same-business-day for blocking items).
- **Day 1:** Land PR 1 (harness-fix-4.1-4.3). Code is ready. Allow for one round of review.
- **Day 2:** Write code for PR 2 (harness-fix-4.2-4.4), land it. Small change.
- **Day 2–3:** Land PR 3 (registry-hygiene). Data-only, fast review.
- **Day 3–4:** Execute relabel (step 4). Mechanical, but broad — touches many files.
- **Day 4:** Re-run claim-coverage:report, verify §2 of exit memo matches, apply the four edits to exit-memo, PCO signs.

If counsel sign-off on AMB-T1-004 slips by more than 3 business days,
`counsel-sync.md §5` allows PCO to write the best-defensible interpretation
as `deferred (counsel unavailable)` and proceed. Given that the PCO
recommendation (Option A) is internally well-grounded — matching the
existing registry and traceability doc — this is the defensible fallback.
