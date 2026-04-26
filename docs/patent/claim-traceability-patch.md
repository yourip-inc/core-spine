# Patch: Claim 17 title correction in claim-traceability.md

**Audit finding:** §5.4 — traceability doc gives Claim 17 the wrong title.

## Edit

In `docs/patent/claim-traceability.md`, in the "Tier 2: Implemented non-gate claims" table, change:

```diff
-| 17 | Canonical JSON hash for score aggregate | implemented | `tests/unit/canonical-json.test.ts`, `score-aggregator-service.test.ts` | `src/canonical/canonical-json.ts`, `event-hash.ts` |
+| 17 | Confidence lower bound gate | implemented | `tests/unit/scoring/winner-gate.test.ts` | `src/scoring/winner-gate.ts` |
```

## Rationale

The registry (`claim_registry.yaml`), the test names (`test_claim_17_winner_gate_*` in `winner-gate.test.ts`), and the code (`src/scoring/winner-gate.ts`) all agree: Claim 17 is the confidence-lower-bound winner gate. The traceability doc was the only artifact with the wrong title. This also means the test-file and code-artifact columns were citing the wrong files (canonical-json / event-hash) — those belong to Claim 14 (canonical hashing).

## Verification

Run `grep -n "test_claim_17_" tests/` — all matches should be in `winner-gate.test.ts`. There are no `test_claim_17_*` names in `canonical-json.test.ts`, which is by itself enough to confirm the old title was wrong.
