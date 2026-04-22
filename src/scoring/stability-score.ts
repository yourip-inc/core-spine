/**
 * Stability score derivation.
 *
 * Story: T1-S1-B-03.
 * Patent Claim 14: "stability ranking based at least in part on the effective
 * vote mass and a minimum confidence-lower-bound threshold."
 *
 * The exact function is a documented engineering decision in
 * docs/scoring-model-requirements.md. The function signature is pinned and
 * version-bound to `scoring_version`; any change to the derivation is a new
 * scoring_version and a new audit-bundle checksum.
 *
 * Current version: scoring_v1 (the only version).
 *
 * Formula (scoring_v1):
 *   stability_score = clamp(min(effective_vote_mass * 100, confidence_lower_bound_bp), 0, 10000)
 *
 * Rationale (from the SMR doc):
 *   - effective_vote_mass is a count-like quantity (number of effective raters).
 *     Multiplying by 100 maps it onto the same basis-point scale as confidence.
 *   - min() means stability is bottlenecked by whichever is worse — low mass
 *     OR low confidence. This matches the patent's requirement that both
 *     contribute.
 *   - Clamp to [0, 10000] bounds the output to the integer range used by
 *     downstream winner-gate thresholds and the score_aggregates column.
 */

import { Decimal4 } from "./decimal4.js";

export const CURRENT_SCORING_VERSION = "scoring_v1";

/**
 * Derive stability_score from effective vote mass and confidence lower bound.
 * Output is an integer in [0, 10000] suitable for score_aggregates.stability_score.
 *
 * @param effectiveVoteMass  Decimal4 count-like quantity (from B-02).
 * @param confidenceLowerBoundBp  Integer basis points in [0, 10000].
 * @param scoringVersion  For version pinning. Only "scoring_v1" is implemented.
 */
export function deriveStabilityScore(
  effectiveVoteMass: Decimal4,
  confidenceLowerBoundBp: number,
  scoringVersion: string = CURRENT_SCORING_VERSION,
): number {
  if (scoringVersion !== CURRENT_SCORING_VERSION) {
    throw new Error(
      `deriveStabilityScore: unknown scoring_version ${scoringVersion}; only ${CURRENT_SCORING_VERSION} is implemented`,
    );
  }
  if (!Number.isInteger(confidenceLowerBoundBp)) {
    throw new Error(`deriveStabilityScore: confidence_lower_bound_bp must be integer, got ${confidenceLowerBoundBp}`);
  }
  if (confidenceLowerBoundBp < 0 || confidenceLowerBoundBp > 10000) {
    throw new Error(`deriveStabilityScore: confidence_lower_bound_bp out of range [0, 10000]: ${confidenceLowerBoundBp}`);
  }

  // effective_vote_mass * 100 → Decimal4 at the same scale as bp
  const massAsBp = effectiveVoteMass.mulInteger(100);

  // Truncate to an integer for comparison against the bp value
  const massAsBpInt = Number(massAsBp.toTruncatedInteger());

  const stability = Math.min(massAsBpInt, confidenceLowerBoundBp);

  // Clamp defensively — massAsBpInt could exceed 10000 if effective_vote_mass
  // is extremely high (e.g., >100 effective raters).
  return Math.max(0, Math.min(10000, stability));
}
