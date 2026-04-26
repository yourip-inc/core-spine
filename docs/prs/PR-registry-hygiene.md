<!--
  PR description for the registry-hygiene cleanup from the T1 Patent-
  Conformance Audit (2026-04-22). Resolves:
    §5.1 — registry entries with impossible field combinations
    §5.2 — phantom test-file paths in legacy entries
    §5.3 — stale counts in docs/claim-coverage.md §F-03
    §5.4 — Claim 17 title mismatch in claim-traceability.md
    §5.5 — delete macOS Finder duplicate from Archive_2

  Sequencing: MUST land AFTER both harness PRs (4.1+4.3 and 4.2+4.4).
  Rationale: promoting Claim 21 from legacy -> implemented requires §4.2
  to have widened discovery; otherwise the promoted entry would fall
  through to the registry-fallback path, which §4.3 now strictly verifies.

  Drafted against the house pull_request_template.md. Note that this PR
  does NOT touch the AMB-T1-004 numbering reconciliation — that is a
  separate, counsel-gated workstream that relabels claim numbers. This PR
  only corrects registry metadata within whatever numbering is canonical.
-->

## Summary

Closes six registry and documentation hygiene findings from the T1 Patent-Conformance Audit (2026-04-22) §5. None of these are patent-claim changes; all are metadata corrections that either resolve internal contradictions (a claim marked both implemented and blocked) or bring documentation in sync with the registry (stale counts, wrong titles, phantom file paths).

This PR is the third in the audit-remediation sequence:
1. `harness-fix-4.1-4.3` — meta-directory exclusion + file verification (must already be merged).
2. `harness-fix-4.2-4.4` — describe() discovery + vitest-results gating (must already be merged).
3. **This PR** — registry hygiene once the harness is honest.

## Claim citation (required for patent-adjacent PRs)

- **Claim(s) implemented or affected:** No new code for any patent claim. Registry metadata changes affect Claims 2, 17, 19, 21, 23, and the seven legacy claims (6, 7, 8, 9, 16, 18, 21). The only *status* change is Claim 21 (legacy → implemented) which follows from the §4.2 harness change having already shipped; the test content that justifies this promotion has existed since WS-1F and is now discoverable.
- **Story ID:** Opens a new hygiene story under WS-1F. Remediation for audit §5.1 – §5.5.
- **Test(s) added/updated:** None. Every change here is to `tests/claim_registry.yaml`, `docs/patent/claim-traceability.md`, and `docs/claim-coverage.md` — data and documentation, no executable code. The harness PRs already added the regression guards that prevent the class of errors this PR cleans up (phantom paths, unverified fallbacks).
- **Traceability doc entry updated?** [x] Yes — §5.4 correction to Claim 17 title is part of this PR; AMB-T1-004 status updated to note registry hygiene complete.

### Interpretation notes

No claim interpretation. No counsel sign-off required for hygiene. One note: AMB-T1-004 (claim-numbering reconciliation) is a separate, counsel-gated workstream and is NOT resolved by this PR. If AMB-T1-004 resolves in favor of relabeling claim numbers, some of the edits in this PR (e.g., Claim 21 promotion) will need to be redone against the relabeled numbering. The decision to land this hygiene work now, pre-AMB-T1-004-resolution, is that the non-numbering-related corrections (contradictory blocked_by fields, phantom paths, stale counts) are safe to make under either numbering and worth cleaning up while the audit is fresh.

## What changed

### 1. `tests/claim_registry.yaml` — six surgical edits

**1a. Claim 2 — correct the `blocked_by` target** (audit §5.1)

```diff
  - id: "2"
    title: "Submission registry with cryptographic hashes"
    status: placeholder
    test_files: []
-   blocked_by: WS-1D
+   blocked_by: "Submission Registry, Sprint 2"
```

Rationale: WS-1D is Migration Record Reconstruction and has already shipped. The traceability doc and exit memo §3.1 correctly identify the real blocker as the full Submission Registry in Sprint 2. This edit aligns the registry with both.

**1b. Claim 23 — remove the contradictory `blocked_by` field** (audit §5.1)

```diff
  - id: "23"
    title: "Migration replay branch at recomputation time"
    status: implemented
    test_files:
      - tests/unit/migration/migration-service.test.ts
-   blocked_by: WS-1D
```

Rationale: `status: implemented` and `blocked_by: <story>` are logically incompatible. WS-1D has shipped and Claim 23 is exercised by `migration-service.test.ts` (two discovered `test_claim_23_*` names, both on `it()` calls). The `blocked_by` field appears to be a merge artifact from when Claim 23 was pending WS-1D's landing.

**1c–1h. Legacy entries (6, 7, 8, 9, 16, 18) — clear phantom paths** (audit §5.2)

For each of the six pure-phantom entries, drop the `test_files` list contents; retain `status: legacy`, `rename_target`, and `rename_story`. Example for Claim 6:

```diff
  - id: "6"
    title: "Diversity-window tie-break by score"
    status: legacy
-   test_files:
-     - tests/legacy/reel-diversity.test.ts
+   test_files: []
    rename_target: test_claim_6_diversity_window_tie_break_by_score
    rename_story: T1-S1-F-04
```

Same pattern for Claims 7, 8, 9, 16, 18.

Rationale: the registry was claiming coverage by files that do not exist on disk. `docs/claim-coverage.md §F-04` already acknowledges this ("in this greenfield repo the 'legacy' tests do not yet exist on disk") but the registry itself did not reflect it. After this edit, the harness (post-§4.3) will report these as `red_missing` with a clear diagnostic; today they report as `yellow_legacy` citing nonexistent files as evidence.

**1i. Claim 21 — promote `legacy` → `implemented`, clean up paths** (audit §5.2 + §4.2 consequence)

```diff
  - id: "21"
    title: "Append-only event hash chain / audit bundle inputs"
-   status: legacy
+   status: implemented
    test_files:
      - tests/unit/canonical-json.test.ts
-     - tests/legacy/event-chain-integrity.test.ts
-   rename_target: test_claim_21_append_only_event_chain
-   rename_story: T1-S1-F-04
+      - tests/unit/rubric-service.test.ts
+      - tests/unit/scoring/score-aggregator-service.test.ts
+      - tests/unit/scoring/aggregator-wiring.test.ts
```

Rationale: five `test_claim_21_*` names exist across these four files — all on `describe()` blocks, which means they were invisible to discovery until the §4.2 harness PR landed. Now that `describe` is in the discovery regex, primary discovery finds these tests and renders Claim 21 as GREEN. The registry should reflect that: `status: implemented`, phantom path removed, additional real paths added, `rename_target` and `rename_story` dropped (no rename pending — these tests already use the new convention). The `canonical-json.test.ts` entry is retained because it really does contain one of the five.

**1j. Claim 17 — drop incorrect test_files entry** (discovered during hygiene drafting)

```diff
  - id: "17"
    title: "Confidence lower bound gate"
    status: implemented
    test_files:
      - tests/unit/scoring/winner-gate.test.ts
-     - tests/unit/scoring/score-aggregator-service.test.ts
```

Rationale: `score-aggregator-service.test.ts` does not contain any `test_claim_17_*` name (verified by grep). The first harness PR's §4.3 verification doesn't catch this because primary discovery finds real matches in `winner-gate.test.ts`, so the fallback path where verification runs is never reached. But the entry is still inaccurate registry data. Dropping it now prevents a future confusing report where Claim 17 lists a file that has no bearing on Claim 17's coverage.

### 2. `docs/patent/claim-traceability.md` — Claim 17 title correction (audit §5.4)

```diff
-| 17 | Canonical JSON hash for score aggregate | implemented | ...
+| 17 | Confidence lower bound gate | implemented | ...
```

Rationale: the registry title, the test names (`test_claim_17_winner_gate_*`), and the code (`winner-gate.ts`) all agree — Claim 17 is the confidence-lower-bound winner gate, not canonical JSON hashing (which is Claim 14). The traceability doc is the only document with the wrong title; this PR corrects it to match the three sources of truth that already agree.

### 3. `docs/claim-coverage.md §F-03` — stale counts (audit §5.3)

```diff
- | implemented | 4 | 1, 13A, 13B, 14 |
- | legacy | 7 | 6, 7, 8, 9, 16, 18, 21 |
- | placeholder | 15 | 2, 3, 4, 5, 10, 11, 12, 13, 15, 17, 19, 20, 20A, 22, 23 |
+ | implemented | 12 | 1, 3, 10, 11, 13A, 13B, 14, 17, 19, 20A, 21, 23 |
+ | legacy | 6 | 6, 7, 8, 9, 16, 18 |
+ | placeholder | 8 | 2, 4, 5, 12, 13, 15, 20, 22 |
```

Rationale: the audit noted 11/7/8 against the registry as shipped. This PR's edits to the registry change that to 12/6/8 (Claim 21 promotes; Claim 21 leaves the legacy list). All other entries match the registry state after this PR.

### 4. Delete `CODEOWNERS (1)` from Archive_2 (audit §5.5)

Not a code change — this is a distribution-artifact cleanup. The file is a macOS Finder duplicate of `CODEOWNERS`. Handled as part of the same PR because it was on the same audit action list and keeps the close-out contiguous.

## Before / after `claim-coverage:report`

Assuming both harness PRs have merged before this one:

| Claim | Before this PR | After this PR | Cause |
|---|---|---|---|
| 2 | 🔴 red_missing — "blocked by WS-1D" | 🔴 red_missing — "blocked by Submission Registry, Sprint 2" | §5.1 |
| 23 | 🟢 GREEN (with contradictory `blocked_by` in source) | 🟢 GREEN | §5.1 |
| 6 | 🔴 red_missing (diagnostic: "phantom path") | 🔴 red_missing (diagnostic: "no tests") | §5.2 — cleaner diagnostic; same color |
| 7, 8, 9, 16, 18 | Same as 6 | Same | §5.2 |
| 21 | 🟢 GREEN (from primary discovery; registry still says legacy) | 🟢 GREEN (registry now says implemented) | §5.2 + §4.2 |
| 17 | 🟢 GREEN | 🟢 GREEN | §5.4 — doc title only; no harness impact |

The coverage-report color counts do not change. What changes is the underlying consistency: every registry entry is now internally valid (no contradictions, no phantom citations), every status field matches reality, and the traceability doc agrees with the registry on what each claim is.

## Testing

- [ ] `npm run typecheck` — no source changes, should pass.
- [ ] `npm test` — no test changes. Existing tests unaffected.
- [ ] `npm run lint` — existing rules unaffected.
- [ ] `npm run claim-coverage:report` — output matches the "After" column above; counts match the new §F-03 table.
- [ ] Manual spot-check: diff the coverage report before/after to confirm only the expected rows changed.

No new tests. The regression guards that matter already exist:
- `test_claim_coverage_report_downgrades_legacy_when_all_testfiles_missing` (from harness PR 1) catches any future phantom-path reintroduction.
- `test_claim_coverage_report_downgrades_implemented_when_testfile_has_no_matching_name` (from harness PR 1) catches any future registry citation that doesn't contain a matching claim name.
- `test_claim_coverage_discover_finds_claim_names_on_describe_blocks` (from harness PR 2) catches any regression in describe-based discovery that would invalidate Claim 21's new status.

## Documentation

- [x] Reason codes added/changed? No.
- [x] OpenAPI schema changed? No.
- [x] SMR or API-contract section changed? No.
- [x] `docs/patent/claim-traceability.md` — Claim 17 title corrected (§5.4).
- [x] `docs/claim-coverage.md §F-03` — counts and claim ID lists updated (§5.3).
- [x] `docs/claim-coverage.md §F-04` — greenfield legacy note updated: the seven legacy claims are now six (Claim 21 promoted out), and the remaining six genuinely have no on-disk tests.

## Explicitly not included

- **AMB-T1-004 resolution** — numbering reconciliation is counsel-gated and tracked separately. This PR does not touch claim *numbers*, only metadata.
- **Reason-code uniqueness test** (audit §6.3) — orthogonal; separate PR.
- **ESLint flat-config migration** (audit §5.6) — Sprint 2.
- **DB integration test suite** (already in ACCEPTANCE.md "Open for next sprint follow-up") — Sprint 2.

## Hotfix exception

- [ ] Emergency hotfix (PCO review will follow within 2 business days)

Not a hotfix. Normal PCO review per CODEOWNERS. Low-risk data change, no runtime impact beyond what the harness already reports.
