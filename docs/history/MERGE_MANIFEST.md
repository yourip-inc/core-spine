# Merge Manifest

This repository was assembled from 10 uploaded zips on 2026-04-22 for hand-off
to Claude Code. Source-of-truth mapping below so future diffs are auditable.

## Base

**`Files (1).zip`** (Apr 20 17:59, 90 files) — canonical Sprint 1 end-state
repo tree with proper `src/`, `tests/`, `migrations/`, `docs/`, `.github/`
layout. Ran through all 7 WS-1 workstreams (A, B, C, D, E, F, G).

## Patches applied from `PR2.zip` → `sprint1-closeout-complete.zip`

Post-Sprint-1 hardening work (Apr 22, 16:55–16:57) addressing the
T1 Patent-Conformance Audit (2026-04-22). Two logical PRs bundled:

### harness-fix-4.2-4.4

Closes audit findings §4.2, §4.3, §4.4 (phantom path coverage, unverified
test backing, missing CI gate).

Overwritten:
- `src/claim-coverage/discover.ts`        (3132B → 5683B)
- `src/claim-coverage/generate-report.ts` (6756B → 13381B)
- `src/claim-coverage/render.ts`          (4457B → 5827B)
- `src/claim-coverage/types.ts`           (1190B → 1406B)

Added:
- `src/claim-coverage/verify-test-files.ts`  — audit §4.3 remediation
- `tests/meta/claim-coverage-discover.test.ts`
- `tests/meta/claim-coverage-generate-report.test.ts`
- `tests/meta/claim-coverage-vitest-gate.test.ts`

### registry-hygiene

Overwritten:
- `tests/claim_registry.yaml` — removed phantom `tests/legacy/*.test.ts`
  references (7 entries), flipped Claim 21 legacy → implemented pointing
  at real tests, tightened Claim 2's `blocked_by` to specify Sprint 2
  Submission Registry.

Added:
- `docs/claim-coverage-patch.md`
- `docs/patent/claim-traceability-patch.md`

## Patches applied from `PR1.zip`

PR1 is an earlier draft of PR2; its code files are strict subsets of the
PR2 versions above and were not applied. One unique document:

- `docs/patent/AMB-T1-004-entry.md` — drop-in ambiguity-log entry for
  the registry-wide claim-numbering reconciliation (blocking open item).

## PR narrative (reference only) — `docs/prs/`

The PR description / narrative markdown files were stashed under `docs/prs/`
so the reasoning trail stays with the code. These are not required by any
build or test:

- `docs/prs/CLOSE-OUT-SEQUENCE.md`
- `docs/prs/IMPLEMENTATION-NOTES.md`
- `docs/prs/PR-harness-4.2-4.4.md`
- `docs/prs/PR-registry-hygiene.md`

## Skipped

- `core-spine_2.zip`, `files.zip`, `files (2)–(6).zip` — flat dumps of
  earlier Sprint 1 states. Fully represented by Files (1) base, nothing
  unique found in diff passes.
- Nested zips (`core-spine-Sprint1-full.zip`, `core-spine-Sprint1-COMPLETE.zip`,
  `core-spine-WS1A.zip`, `harness-fix-code.zip`, etc.) — earlier packaged
  artifacts superseded by Files (1) and PR2.
- `PR1/T2_Jira_Import_Pack_Audit.docx` — T2 track reference material, not
  T1 Core Spine repo content.

## Final counts

- 101 files total (90 base + 11 added from PRs)
- 35 TypeScript source files
- 23 test files
- 15 SQL migrations (001–009, with down migrations for reconstruction-phase)
- 13 markdown docs
- 1 OpenAPI spec, 2 ESLint rules, 2 `.github/` process files
