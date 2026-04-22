/**
 * Winner gate.
 *
 * Story: T1-S1-B-04.
 * Patent Claim 1: "a stability ranking based at least in part on the effective
 * vote mass and a minimum confidence-lower-bound threshold." Claim 17 makes
 * the confidence-lower-bound threshold explicit.
 *
 * Rule (scoring_v1):
 *   PASS iff (mean_bp >= score_threshold_bp) AND (stability_score >= stability_threshold_bp)
 *
 * Thresholds are version-bound to scoring_version. Any change is a new
 * scoring_version + new audit-bundle checksum.
 *
 * Reason codes on failure (both emitted if both fail):
 *   - SCORE_BELOW_THRESHOLD              — mean_bp failed
 *   - CONFIDENCE_LOWER_BOUND_FAIL +
 *     STABILITY_SCORE_BELOW_THRESHOLD    — stability_score failed
 *
 * The CONFIDENCE_LOWER_BOUND_FAIL code is from the pre-existing catalog (PRD §6.6)
 * and is required by the B-04 AC; we emit STABILITY_SCORE_BELOW_THRESHOLD alongside
 * it for downstream consumers that want the specific scoring axis.
 */

import { REASON_CODES, type ReasonCode } from "../errors/reason-codes.js";

export type WinnerGateStatus = "PASS" | "FAIL";

export interface WinnerGateThresholds {
  scoreThresholdBp: number;       // minimum mean_bp to pass
  stabilityThresholdBp: number;   // minimum stability_score to pass
  scoringVersion: string;         // version-bound; e.g. "scoring_v1"
}

export interface WinnerGateInput {
  meanBp: number;                 // integer basis points in [0, 10000]
  stabilityScore: number;         // integer basis points in [0, 10000]
}

export interface WinnerGateResult {
  status: WinnerGateStatus;
  reasonCodes: ReasonCode[];
  // Echo inputs/thresholds back for audit-bundle inclusion.
  meanBp: number;
  stabilityScore: number;
  scoreThresholdBp: number;
  stabilityThresholdBp: number;
  scoringVersion: string;
}

/**
 * Evaluate the winner gate against score + stability thresholds.
 * Returns PASS only when both thresholds are met. Emits reason codes on FAIL.
 */
export function evaluateWinnerGate(
  input: WinnerGateInput,
  thresholds: WinnerGateThresholds,
): WinnerGateResult {
  if (!Number.isInteger(input.meanBp)) {
    throw new Error(`evaluateWinnerGate: mean_bp must be integer, got ${input.meanBp}`);
  }
  if (!Number.isInteger(input.stabilityScore)) {
    throw new Error(`evaluateWinnerGate: stability_score must be integer, got ${input.stabilityScore}`);
  }
  if (input.meanBp < 0 || input.meanBp > 10000) {
    throw new Error(`evaluateWinnerGate: mean_bp out of range [0, 10000]: ${input.meanBp}`);
  }
  if (input.stabilityScore < 0 || input.stabilityScore > 10000) {
    throw new Error(`evaluateWinnerGate: stability_score out of range [0, 10000]: ${input.stabilityScore}`);
  }

  const reasonCodes: ReasonCode[] = [];
  if (input.meanBp < thresholds.scoreThresholdBp) {
    reasonCodes.push(REASON_CODES.SCORE_BELOW_THRESHOLD);
  }
  if (input.stabilityScore < thresholds.stabilityThresholdBp) {
    // Emit both: the legacy catalog code (required by AC) and the specific one.
    reasonCodes.push(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
    reasonCodes.push(REASON_CODES.STABILITY_SCORE_BELOW_THRESHOLD);
  }

  return {
    status: reasonCodes.length === 0 ? "PASS" : "FAIL",
    reasonCodes,
    meanBp: input.meanBp,
    stabilityScore: input.stabilityScore,
    scoreThresholdBp: thresholds.scoreThresholdBp,
    stabilityThresholdBp: thresholds.stabilityThresholdBp,
    scoringVersion: thresholds.scoringVersion,
  };
}
