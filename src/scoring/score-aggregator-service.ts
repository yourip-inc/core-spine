/**
 * Score Aggregator Service.
 *
 * Stitches the three WS-1B pieces together:
 *   1. Fetch bounded rater weights (via RaterWeightProvider).
 *   2. Compute effective vote mass.
 *   3. Derive stability score from effective vote mass + confidence lower bound.
 *   4. Evaluate winner gate from mean + stability against thresholds.
 *   5. Compute canonical hash of the aggregate for audit-bundle inclusion.
 *
 * The `confidence_lower_bound_bp`, `mean_bp`, and other bp-valued fields come
 * in as inputs from upstream scoring components (the raw rating math lives in
 * future stories — this service consumes pre-computed bp values).
 *
 * PATENT-CRITICAL:
 *   - All arithmetic is Decimal4 / BigInt / integer. No IEEE-754.
 *   - Aggregate canonical hash is computed over the canonical-JSON
 *     representation of the aggregate fields that affect downstream state.
 *   - The service is DETERMINISTIC: same inputs → byte-identical aggregate row.
 */

import { canonicalBytes, type CanonicalValue } from "../canonical/canonical-json.js";
import { sha256 } from "@noble/hashes/sha256";
import { Decimal4 } from "./decimal4.js";
import { computeEffectiveVoteMass } from "./effective-vote-mass.js";
import { deriveStabilityScore, CURRENT_SCORING_VERSION } from "./stability-score.js";
import { evaluateWinnerGate, type WinnerGateThresholds, type WinnerGateStatus } from "./winner-gate.js";
import type { RaterWeightProvider } from "./rater-weight-provider.js";
import { REASON_CODES, type ReasonCode } from "../errors/reason-codes.js";

export interface AggregateComputeInput {
  submissionId: string;
  /**
   * T1-S1-C-04: the aggregator now uses (challengeId, acceptedRaterIds) to
   * look up bounded_weight values directly from rater_event_weights. This
   * replaces the WS-1B-era reliance on provider.getBoundedWeights(submissionId).
   *
   * For WS-1B-era callers that don't yet know the accepted rater_ids (because
   * the Rating Service persistence isn't here yet), these fields are optional.
   * When absent, the aggregator falls back to the legacy getBoundedWeights
   * path. At least one of {challengeId+acceptedRaterIds, legacy path} must be
   * usable — the aggregator throws if neither is populated.
   */
  challengeId?: string;
  acceptedRaterIds?: readonly string[];

  scoringVersion: string;

  // These bp values are produced by upstream scoring components and are inputs
  // to the aggregator. The aggregator doesn't recompute them; it composes them
  // with effective vote mass + stability into the persisted aggregate row.
  meanBp: number;
  medianBp: number;
  trimmedMeanBp: number;
  confidenceLowerBoundBp: number;
  confidenceUpperBoundBp: number;

  thresholds: WinnerGateThresholds;
  computedAtUtcMs: bigint;
}

export interface AggregateComputeResult {
  submissionId: string;
  scoringVersion: string;

  meanBp: number;
  medianBp: number;
  trimmedMeanBp: number;
  confidenceLowerBoundBp: number;
  confidenceUpperBoundBp: number;

  // Outputs from the three computations
  sumW: Decimal4;
  sumW2: Decimal4;
  raterCount: number;
  effectiveVoteMass: Decimal4;
  stabilityScore: number;

  winnerGateStatus: WinnerGateStatus;
  reasonCodes: ReasonCode[];

  canonicalJsonSha256: string;
  computedAtUtcMs: bigint;
}

export class ScoreAggregatorService {
  constructor(
    private readonly raterWeights: RaterWeightProvider,
  ) {}

  async compute(input: AggregateComputeInput): Promise<AggregateComputeResult> {
    if (input.thresholds.scoringVersion !== input.scoringVersion) {
      throw new Error(
        `ScoreAggregator: scoring_version mismatch between input (${input.scoringVersion}) and thresholds (${input.thresholds.scoringVersion})`,
      );
    }

    // Step 1 — bounded rater weights (C-04 path when possible, legacy fallback otherwise)
    const defaultWeight = Decimal4.parse("1.0");
    let boundedValues: Decimal4[];
    const extraReasonCodes: ReasonCode[] = [];

    if (input.challengeId !== undefined && input.acceptedRaterIds !== undefined) {
      // C-04 path: look up each accepted rater by id. Missing weight rows
      // default to 1.0 and emit RATER_WEIGHT_DEFAULTED once.
      const lookup = await this.raterWeights.getWeightsForRaters(
        input.challengeId,
        input.acceptedRaterIds,
        input.scoringVersion,
      );
      boundedValues = [
        ...lookup.hits.map((h) => h.boundedWeight),
        ...lookup.misses.map(() => defaultWeight),
      ];
      if (lookup.misses.length > 0) {
        extraReasonCodes.push(REASON_CODES.RATER_WEIGHT_DEFAULTED);
      }
    } else {
      // Legacy WS-1B path. Kept for tests and for the (increasingly
      // hypothetical) caller that only knows the submission id.
      const weights = await this.raterWeights.getBoundedWeights(
        input.submissionId,
        input.scoringVersion,
      );
      boundedValues = weights.map((w) => w.boundedWeight);
    }

    // Step 2 — effective vote mass
    const evm = computeEffectiveVoteMass(boundedValues);

    // Step 3 — stability
    const stabilityScore = deriveStabilityScore(
      evm.effectiveVoteMass,
      input.confidenceLowerBoundBp,
      input.scoringVersion,
    );

    // Step 4 — winner gate
    const gate = evaluateWinnerGate(
      { meanBp: input.meanBp, stabilityScore },
      input.thresholds,
    );

    // Merge reason codes: defaulted weights (C-04) + EVM info codes + gate failure codes.
    const reasonCodes: ReasonCode[] = [
      ...extraReasonCodes,
      ...evm.reasonCodes,
      ...gate.reasonCodes,
    ];

    // Step 5 — canonical hash over the aggregate fields.
    // Hash input intentionally excludes non-deterministic bookkeeping
    // (score_aggregate_id, computed_at_utc_ms) per canonical-JSON spec.
    const hashInput: CanonicalValue = {
      confidence_lower_bound_bp: input.confidenceLowerBoundBp,
      confidence_upper_bound_bp: input.confidenceUpperBoundBp,
      effective_vote_mass: evm.effectiveVoteMass.toString(),
      mean_bp: input.meanBp,
      median_bp: input.medianBp,
      rater_count: evm.raterCount,
      reason_codes: [...reasonCodes].sort(), // stable order
      scoring_version: input.scoringVersion,
      stability_score: stabilityScore,
      submission_id: input.submissionId,
      sum_w: evm.sumW.toString(),
      sum_w2: evm.sumW2.toString(),
      trimmed_mean_bp: input.trimmedMeanBp,
      winner_gate_status: gate.status,
    };
    const digest = sha256(canonicalBytes(hashInput));
    let hex = "";
    for (const b of digest) hex += b.toString(16).padStart(2, "0");

    return {
      submissionId: input.submissionId,
      scoringVersion: input.scoringVersion,
      meanBp: input.meanBp,
      medianBp: input.medianBp,
      trimmedMeanBp: input.trimmedMeanBp,
      confidenceLowerBoundBp: input.confidenceLowerBoundBp,
      confidenceUpperBoundBp: input.confidenceUpperBoundBp,
      sumW: evm.sumW,
      sumW2: evm.sumW2,
      raterCount: evm.raterCount,
      effectiveVoteMass: evm.effectiveVoteMass,
      stabilityScore,
      winnerGateStatus: gate.status,
      reasonCodes,
      canonicalJsonSha256: hex,
      computedAtUtcMs: input.computedAtUtcMs,
    };
  }
}

export { CURRENT_SCORING_VERSION };
