/**
 * Effective vote mass calculator.
 *
 * Story: T1-S1-B-02.
 * Patent Claim CS-3: "a score aggregate comprising … an effective vote mass
 * computed as the square of the sum of bounded weights divided by the sum of
 * squared bounded weights for the raters who rated the submission."
 *
 * n_eff = (sum_w)² / sum_w2
 *
 * All arithmetic runs on scaled BigInt (Decimal4). No IEEE-754 anywhere in
 * the computation path — this is mandatory for the hash chain to remain
 * valid across multi-process replay. See Engineering PRD §8.1 / Flag 3.
 */

import { Decimal4 } from "./decimal4.js";
import { REASON_CODES, type ReasonCode } from "../errors/reason-codes.js";

export interface EffectiveVoteMassResult {
  effectiveVoteMass: Decimal4;
  sumW: Decimal4;
  sumW2: Decimal4;
  raterCount: number;
  reasonCodes: ReasonCode[];
}

/**
 * Compute effective vote mass for a set of bounded rater weights.
 *
 * Deterministic: identical inputs → byte-identical Decimal4 output.
 * Empty rater set → n_eff = 0.0000 with EFFECTIVE_VOTE_MASS_ZERO_RATERS
 *   (informational — callers may still persist the aggregate row).
 */
export function computeEffectiveVoteMass(
  boundedWeights: readonly Decimal4[],
): EffectiveVoteMassResult {
  const raterCount = boundedWeights.length;

  if (raterCount === 0) {
    return {
      effectiveVoteMass: Decimal4.ZERO,
      sumW: Decimal4.ZERO,
      sumW2: Decimal4.ZERO,
      raterCount: 0,
      reasonCodes: [REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS],
    };
  }

  // Sort the weights before summing so that rater ordering does not affect
  // the output. Decimal4 addition is associative on exact integers (raw BigInt)
  // so ordering is mathematically irrelevant, BUT making ordering explicit
  // protects against accidental non-determinism if a future Decimal4 impl
  // introduces rounding on accumulation.
  const sorted = [...boundedWeights].sort((a, b) => {
    if (a.raw === b.raw) return 0;
    return a.raw < b.raw ? -1 : 1;
  });

  let sumW = Decimal4.ZERO;
  let sumW2 = Decimal4.ZERO;
  for (const w of sorted) {
    sumW = sumW.add(w);
    sumW2 = sumW2.add(w.mul(w));
  }

  // If every rater has weight 0, sum_w² = 0 and sum_w2 = 0 — division undefined.
  // Treat as the zero-raters case with an explicit reason code.
  if (sumW2.isZero()) {
    return {
      effectiveVoteMass: Decimal4.ZERO,
      sumW,
      sumW2,
      raterCount,
      reasonCodes: [REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS],
    };
  }

  const sumWSquared = sumW.mul(sumW);
  const nEff = sumWSquared.div(sumW2);

  return {
    effectiveVoteMass: nEff,
    sumW,
    sumW2,
    raterCount,
    reasonCodes: [],
  };
}
