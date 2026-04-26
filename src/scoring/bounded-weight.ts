/**
 * Bounded engagement weight computation.
 *
 * Story: T1-S1-C-02.
 * Patent Claim 2: "a score aggregate … wherein the weight of each rater is a
 * bounded function of engagement signals associated with that rater's recent
 * participation in the challenge."
 *
 * Formula (scoring_v1):
 *   signal = weighted_mean(watch, frequency, recency)
 *   weight = clamp(1.0 + signal × (max_weight_multiplier - 1.0), 0, max_weight_multiplier)
 *
 * Boundary properties (required by C-02 AC):
 *   - signals all zero           → weight = 1.0000 (base weight)
 *   - signals all at max (1.0)   → weight = max_weight_multiplier (default 2.0)
 *   - signals out of [0, 1] range → clamped into range before weighted mean
 *
 * The affine map `1 + s(max-1)` is the only monotone map that sends 0→1
 * and 1→max for any max, so these two AC boundary cases uniquely pin the
 * formula shape.
 *
 * Deterministic: all arithmetic is Decimal4 / BigInt. No IEEE-754.
 * Version-bound to scoring_version; any change is a new version.
 */

import { Decimal4 } from "./decimal4.js";
import { CURRENT_SCORING_VERSION } from "./stability-score.js";

/** Default max weight multiplier per the patent embodiment (paragraph 333). */
export const DEFAULT_MAX_WEIGHT_MULTIPLIER = Decimal4.parse("2.0");

/**
 * Signal weights for the weighted-mean aggregator. Sum is ignored (we normalize
 * internally by the sum), so these are effectively relative contributions.
 * Defaults: equal weight across all three signals.
 */
export interface SignalWeights {
  watchWeight: Decimal4;
  frequencyWeight: Decimal4;
  recencyWeight: Decimal4;
}

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  watchWeight:     Decimal4.parse("1.0"),
  frequencyWeight: Decimal4.parse("1.0"),
  recencyWeight:   Decimal4.parse("1.0"),
};

export interface EngagementSignals {
  watchCompletion: Decimal4; // [0, 1] by convention
  frequency: Decimal4;       // [0, 1]
  recency: Decimal4;         // [0, 1]
}

export interface BoundedWeightOptions {
  maxWeightMultiplier?: Decimal4;
  signalWeights?: SignalWeights;
  scoringVersion?: string;
}

/**
 * Compute bounded engagement weight from the three signals.
 *
 * Signal values outside [0, 1] are clamped before the weighted mean.
 * The three signal-weight parameters are relative contributions; the function
 * normalizes them internally so `signalWeights = {1, 1, 1}` and
 * `signalWeights = {2, 2, 2}` produce identical output.
 */
export function computeBoundedWeight(
  signals: EngagementSignals,
  opts: BoundedWeightOptions = {},
): Decimal4 {
  const scoringVersion = opts.scoringVersion ?? CURRENT_SCORING_VERSION;
  if (scoringVersion !== CURRENT_SCORING_VERSION) {
    throw new Error(
      `computeBoundedWeight: unknown scoring_version ${scoringVersion}; only ${CURRENT_SCORING_VERSION} is implemented`,
    );
  }

  const maxMult = opts.maxWeightMultiplier ?? DEFAULT_MAX_WEIGHT_MULTIPLIER;
  if (maxMult.lt(Decimal4.parse("1.0"))) {
    // If max < 1, the affine map becomes non-monotone / flips sign. Reject at
    // the boundary — if a future scoring_version needs max < 1 we'll re-derive.
    throw new Error(
      `computeBoundedWeight: max_weight_multiplier must be >= 1.0, got ${maxMult.toString()}`,
    );
  }

  const weights = opts.signalWeights ?? DEFAULT_SIGNAL_WEIGHTS;
  const weightSum = weights.watchWeight.add(weights.frequencyWeight).add(weights.recencyWeight);
  if (weightSum.isZero()) {
    throw new Error("computeBoundedWeight: signal weights sum to zero");
  }

  // Clamp each signal to [0, 1] before aggregation.
  const one = Decimal4.parse("1.0");
  const zero = Decimal4.ZERO;
  const w  = clamp(signals.watchCompletion, zero, one);
  const f  = clamp(signals.frequency,        zero, one);
  const r  = clamp(signals.recency,          zero, one);

  // Weighted mean: (w·W + f·F + r·R) / (W + F + R)
  const numerator = w.mul(weights.watchWeight)
    .add(f.mul(weights.frequencyWeight))
    .add(r.mul(weights.recencyWeight));
  const signal = numerator.div(weightSum);

  // Affine map signal∈[0,1] → weight∈[1, maxMult]:
  //   weight = 1 + signal * (maxMult - 1)
  const slope = maxMult.sub(one);
  const rawWeight = one.add(signal.mul(slope));

  // Final clamp — defensive. The affine math produces values in [1, maxMult]
  // for signal in [0, 1], but numeric-4 truncation in `div` can nudge by up
  // to ±0.0001 on non-exact fractions. Clamping catches that and also covers
  // any future formula change that might extend range.
  return clamp(rawWeight, zero, maxMult);
}

function clamp(value: Decimal4, min: Decimal4, max: Decimal4): Decimal4 {
  if (value.lt(min)) return min;
  if (value.gt(max)) return max;
  return value;
}
