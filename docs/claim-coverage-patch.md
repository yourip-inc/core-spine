# Patch: claim-coverage.md §F-03 and §F-04 updates

**Audit finding:** §5.3 — `docs/claim-coverage.md §F-03` reports stale counts
(4/7/15) that haven't been updated since the seed registry. Every other
document reports 11/7/8. After this PR's registry edits, the correct counts
are **12/6/8**.

## Edit 1 — §F-03 breakdown table

Replace lines 44–50:

```diff
-Current breakdown:
-
-| Status | Count | Claim IDs |
-|---|---|---|
-| implemented | 4 | 1, 13A, 13B, 14 |
-| legacy | 7 | 6, 7, 8, 9, 16, 18, 21 |
-| placeholder | 15 | 2, 3, 4, 5, 10, 11, 12, 13, 15, 17, 19, 20, 20A, 22, 23 |
+Current breakdown (post-Sprint 1 registry hygiene):
+
+| Status | Count | Claim IDs |
+|---|---|---|
+| implemented | 12 | 1, 3, 10, 11, 13A, 13B, 14, 17, 19, 20A, 21, 23 |
+| legacy | 6 | 6, 7, 8, 9, 16, 18 |
+| placeholder | 8 | 2, 4, 5, 12, 13, 15, 20, 22 |
```

## Edit 2 — §F-04 greenfield-legacy note

Line 58 currently lists seven legacy claims including Claim 21. Claim 21
has been promoted to `implemented` by this PR (it has five `test_claim_21_*`
`describe()` names across four test files, discoverable post-§4.2 harness fix).
Update to six claims:

```diff
-1. **For every future story that implements a legacy-tagged claim (6, 7, 8, 9, 16, 18, 21),** write the test with the `test_claim_N_*` name from day one and update the registry entry from `legacy` to `implemented`.
-2. **Legacy entries currently render yellow** in the report until that happens.
+1. **For every future story that implements a legacy-tagged claim (6, 7, 8, 9, 16, 18),** write the test with the `test_claim_N_*` name from day one and update the registry entry from `legacy` to `implemented`. (Claim 21 completed this transition as part of the Sprint 1 registry-hygiene PR.)
+2. **Legacy entries render red_missing** in the report — the harness (post-audit §4.3 fix) no longer credits phantom `tests/legacy/*.test.ts` paths as coverage. The `rename_target` and `rename_story` fields remain as forward-looking placeholders; `test_files` lists are empty until real tests land.
```

## Rationale

The color change (yellow → red_missing) is real: after the §4.3 harness fix,
phantom paths no longer render yellow with made-up coverage evidence; they
render red_missing with a clear diagnostic. The doc should reflect that so
a future reader isn't confused when they see red where the doc promised
yellow.

The Claim 21 promotion parenthetical serves as a breadcrumb: the audit trail
for "why is Claim 21 implemented when the greenfield note only lists six
legacy claims" leads back to this sprint's work.
