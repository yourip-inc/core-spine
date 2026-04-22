# Scoring Model Requirements (SMR)

Version-pinned specification of the deterministic scoring functions used by the Core Spine Score Aggregator.

**Current version:** `scoring_v1`
**Authored under:** T1-S1-B-03
**Authority:** This doc is the authoritative spec for Core Spine scoring functions. Any change to a formula here requires (a) a new `scoring_version` identifier, (b) PCO sign-off per T1-S1-G-02, and (c) a coordinated audit-bundle checksum bump. Silent changes are not permitted — they would break Claim 22 (payout verification) and Claim 23 (migration replay).

---

## 1. Effective vote mass (`n_eff`)

**Formula** (Claim 3, verbatim):

    n_eff = (sum_w)² / sum_w2

Where `sum_w` and `sum_w2` are computed over the `bounded_weight` values of the raters who rated the submission.

**Precision:** `numeric(14,4)` — 4 decimal places, truncated toward zero.

**Empty rater set:** Returns `0.0000` with reason code `EFFECTIVE_VOTE_MASS_ZERO_RATERS`.

**Implementation:** `src/scoring/effective-vote-mass.ts`, backed by `Decimal4` scaled-BigInt arithmetic in `src/scoring/decimal4.ts`. No IEEE-754 arithmetic anywhere in the computation path.

**Determinism:** Guaranteed by BigInt math. Weights are sorted by raw value before summation (belt-and-braces; addition is already associative on exact integers).

---

## 2. Stability score

**Formula** (`scoring_v1`):

    stability_score = clamp(min(effective_vote_mass × 100, confidence_lower_bound_bp), 0, 10000)

**Rationale:**
- `effective_vote_mass × 100` maps the count-like Decimal4 onto the same basis-point scale as `confidence_lower_bound_bp`.
- `min()` enforces Claim 14's requirement that stability depends on **both** effective vote mass and confidence lower bound. A submission with high mass but low confidence (volatile ratings) gets a low stability score; a submission with high confidence but low mass (few raters) also gets a low score.
- Clamp to `[0, 10000]` matches the `stability_score` column range and the winner-gate threshold domain.

**Inputs:**
- `effective_vote_mass`: `Decimal4` from Section 1. Non-negative.
- `confidence_lower_bound_bp`: Integer in `[0, 10000]`. Computed by the Score Aggregator from rating distribution (out of scope for this doc — see Score Aggregator spec).

**Output:** Integer in `[0, 10000]`, persisted to `score_aggregates.stability_score`.

**Implementation:** `src/scoring/stability-score.ts`.

**Edge cases:**
- `effective_vote_mass = 0` → stability_score = 0.
- `confidence_lower_bound_bp = 0` → stability_score = 0.
- `effective_vote_mass × 100 > 10000` (>100 effective raters) → clamped to 10000.

---

## 3. Winner gate

**Rule** (`scoring_v1`):

    PASS iff (mean_bp ≥ score_threshold_bp) AND (stability_score ≥ stability_threshold_bp)

Any failure emits reason codes; any PASS emits none. Gate logic is deterministic (same inputs → same output) and replayable.

**Default thresholds** (`scoring_v1`):
- `score_threshold_bp = 5000` — 50% of the rating scale. Tunable per challenge.
- `stability_threshold_bp = 3000` — 30% of the stability range. Tunable per challenge.

Per-challenge threshold overrides are part of the challenge lock record (not implemented in WS-1B; lands in WS-1D when challenge-lock-rubric extends to threshold pinning).

**Reason codes emitted on FAIL:**
| Axis fails | Codes |
|---|---|
| Score only | `SCORE_BELOW_THRESHOLD` |
| Stability only | `CONFIDENCE_LOWER_BOUND_FAIL`, `STABILITY_SCORE_BELOW_THRESHOLD` |
| Both | All three |

`CONFIDENCE_LOWER_BOUND_FAIL` is in the PRD §6.6 catalog and is required by B-04 AC. `STABILITY_SCORE_BELOW_THRESHOLD` is added in WS-1B as a more specific code for downstream consumers that want to distinguish "stability too low" from "confidence too low" as the system evolves.

**Implementation:** `src/scoring/winner-gate.ts`.

---

## 4. Version change control

Adding a new `scoring_version`:

1. Branch the SMR doc with the new version header (`scoring_v2`).
2. Document the formula delta against the previous version.
3. Add the new version identifier to `CURRENT_SCORING_VERSION` exports and update `deriveStabilityScore` / `evaluateWinnerGate` to dispatch on it.
4. Preserve the old version behavior behind the version dispatch so replay of old aggregates still produces byte-identical output (Claim 23).
5. PR requires PCO sign-off per T1-S1-G-02.
6. Coordinate the audit-bundle checksum bump across T1–T9.

Never modify a `scoring_v1` formula in place. Always version.

---

## 5. Traceability

| Section | Claim(s) | Story | Code | Tests |
|---|---|---|---|---|
| 1. Effective vote mass | 3 | T1-S1-B-02 | `src/scoring/effective-vote-mass.ts`, `src/scoring/decimal4.ts` | `tests/unit/scoring/effective-vote-mass.test.ts`, `tests/unit/scoring/decimal4.test.ts` |
| 2. Stability score | 1, 14 | T1-S1-B-03 | `src/scoring/stability-score.ts` | `tests/unit/scoring/stability-score.test.ts` |
| 3. Winner gate | 1, 17, 20, 20A | T1-S1-B-04 | `src/scoring/winner-gate.ts` | `tests/unit/scoring/winner-gate.test.ts` |
| 6. Engagement signals | 2, 19 | T1-S1-C-02, C-03 | `src/scoring/bounded-weight.ts`, `src/scoring/signal-ingestion.ts` | `tests/unit/scoring/bounded-weight.test.ts`, `tests/unit/scoring/signal-ingestion.test.ts` |

---

## 6. Engagement signal definitions and freshness SLA

**Added by:** T1-S1-C-02, T1-S1-C-03.
**Claims:** 2 (engagement-signal bounded weights), 19 (per-challenge non-persistence).

### 6.1 Signal definitions

All three signals are `Decimal4` values in `[0, 1.0000]` by convention. Values outside this range are clamped to `[0, 1]` before the weighted mean per `computeBoundedWeight`. Signal computation is scoped strictly within a single `challenge_id`; no cross-challenge state is permitted.

| Signal | Formula | Units | Source |
|---|---|---|---|
| `watch_completion_score` | mean fraction of submission duration watched across the rater's playback events for this challenge | fraction ∈ `[0, 1]` | `playback_events` table, filtered to `challenge_id` |
| `frequency_score` | number of ratings submitted by this rater in this challenge, normalized by the maximum rating count observed for any rater in the same challenge | fraction ∈ `[0, 1]` | `rating_events` table, aggregated per rater per challenge |
| `recency_score` | `1 - (hours_since_last_rating / challenge_duration_hours)`, floored at 0 | fraction ∈ `[0, 1]` | `rating_events.created_at_utc_ms` vs `challenges.ends_at_utc_ms` |

**Missing signal** → the zero value. A rater with watch-completion telemetry but no frequency or recency record receives `watchCompletion = <value>, frequency = 0, recency = 0` rather than being rejected. Partial credit is preserved.

**All-zero signals** → `bounded_weight = 1.0000` per the affine map. This is the base weight; a rater with no engagement data is still counted as one full rater.

### 6.2 Aggregation formula (pinned, scoring_v1)

```
signal = weighted_mean(watch, frequency, recency)        # weights from SignalWeights; default equal (1,1,1)
weight = clamp(1.0 + signal × (max_weight_multiplier - 1.0), 0, max_weight_multiplier)
```

Default `max_weight_multiplier = 2.0000` per the patent embodiment (Core Spine non-provisional paragraph 333). The affine map is the only monotone map sending `0 → 1` and `1 → max` for any `max ≥ 1`, and those two boundary cases are the C-02 AC pins.

**Custom signal weights** are relative, not absolute — `{1, 1, 1}` and `{2, 2, 2}` produce identical output. The service normalizes by the sum before applying.

### 6.3 Freshness SLA

**Target:** signals are refreshed within **15 minutes** of the underlying telemetry event landing in the warehouse.

- Batch-compatible ingestion is sufficient; real-time is not required.
- Re-ingestion is **idempotent** — `upsertWeight` uses `ON CONFLICT (challenge_id, rater_id) DO UPDATE`, so re-running ingestion for an active challenge replaces rows rather than duplicating them.
- **Backfill** is supported for challenges already in flight: the ingestor reads the full current telemetry for the challenge and overwrites existing weight rows with the latest values.

### 6.4 Claim 19 scoping enforcement

Claim 19 requires weights to be **per-challenge**. Three layers enforce this:

1. **Structural** (DB) — `rater_event_weights` has composite primary key `(challenge_id, rater_id)`. A rater in two challenges has two rows.
2. **Runtime** (ingestor) — `EngagementSignalIngestor.ingestForChallenge` throws if the telemetry source returns a record whose `challengeId` does not match the requested challenge.
3. **API** (provider) — `getWeightsForRaters(challengeId, raterIds, scoringVersion)` filters by `challenge_id`. A future bug returning cross-challenge rows would fail the SQL `WHERE` clause, not slip through silently.

### 6.5 Zero-weight rater handling

A rater with `bounded_weight = 0.0000` is an edge case. It can happen if:
- A future scoring version lowers the floor below 1.0.
- The configuration sets `max_weight_multiplier = 1.0` (disabling the engagement lift entirely) — not currently supported (rejected by C-02).

If it ever occurs, the effective-vote-mass formula's `sum_w2 = 0` guard treats the whole rater set as "empty" and emits `EFFECTIVE_VOTE_MASS_ZERO_RATERS`. This is the correct behavior — a set of zero-weight raters contributes no effective mass.
