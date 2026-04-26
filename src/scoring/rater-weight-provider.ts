/**
 * Rater weight provider — interface between WS-1B/C and callers.
 *
 * WS-1B (previously shipped) consumes bounded_weight values via the legacy
 * `getBoundedWeights(submissionId, scoringVersion)` shape.
 * WS-1C (T1-S1-C-01 through C-04) adds:
 *   - The PG-backed implementation of this interface (via PgRaterWeightRepository).
 *   - The `getWeightsForRaters(challengeId, raterIds, scoringVersion)` shape
 *     used by the Score Aggregator for C-04 wiring. This returns weights for
 *     each requested rater_id, with explicit miss surfacing so the aggregator
 *     can emit RATER_WEIGHT_DEFAULTED for raters lacking a stored row.
 *
 * Contract:
 *   - bounded_weight is a Decimal4 in range [0, max_weight_multiplier].
 *     Default max_weight_multiplier is 2.0000 per the patent embodiment
 *     (paragraph 333 of the Core Spine non-provisional).
 *   - Claim 19: weights do not persist across challenges. Keys are
 *     (challenge_id, rater_id); the same rater_id in two challenges has
 *     two independent rows.
 */

import type { Decimal4 } from "./decimal4.js";

export interface RaterWeight {
  raterId: string;
  boundedWeight: Decimal4;
}

/**
 * Result of looking up weights for a specific set of raters on a challenge.
 * `hits` are raters that had a stored row; `misses` are raters the caller
 * asked about who do not yet have a computed weight row.
 */
export interface RaterWeightLookup {
  hits: RaterWeight[];
  misses: string[]; // rater_ids with no stored weight row
}

export interface RaterWeightProvider {
  /**
   * Legacy WS-1B shape: fetch bounded weights for all raters who rated
   * `submissionId` under `scoringVersion`.
   */
  getBoundedWeights(
    submissionId: string,
    scoringVersion: string,
  ): Promise<RaterWeight[]>;

  /**
   * C-04 shape: fetch weights for the given rater_ids within `challengeId`
   * under `scoringVersion`. Raters without a stored weight row are returned
   * in `misses`, not synthesized — the caller decides how to default
   * (Aggregator uses 1.0000 with RATER_WEIGHT_DEFAULTED).
   */
  getWeightsForRaters(
    challengeId: string,
    raterIds: readonly string[],
    scoringVersion: string,
  ): Promise<RaterWeightLookup>;
}
