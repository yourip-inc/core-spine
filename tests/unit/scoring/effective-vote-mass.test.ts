/**
 * Effective vote mass tests.
 *
 * Story: T1-S1-B-02.
 * Patent Claim 3: effective vote mass = (sum_w)² / sum_w2.
 *
 * Covers every AC fixture from T1-S1-B-02:
 *   - weights [1.0, 1.0, 1.0] → n_eff = 3.0000
 *   - weights [2.0, 1.0, 1.0] → n_eff = 2.6666 (truncated to 4dp)
 *   - single weight [2.0]      → n_eff = 1.0000
 *   - empty set                → n_eff = 0.0000 with reason code
 *   - same fixture, 3 runs     → byte-identical output
 */

import { describe, it, expect } from "vitest";
import { computeEffectiveVoteMass } from "../../../src/scoring/effective-vote-mass.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";
import { REASON_CODES } from "../../../src/errors/reason-codes.js";

const d = (s: string): Decimal4 => Decimal4.parse(s);

describe("computeEffectiveVoteMass", () => {
  describe("patent AC fixtures", () => {
    it("test_claim_3_effective_vote_mass_formula_three_equal_weights", () => {
      const r = computeEffectiveVoteMass([d("1.0"), d("1.0"), d("1.0")]);
      expect(r.effectiveVoteMass.toString()).toBe("3.0000");
      expect(r.sumW.toString()).toBe("3.0000");
      expect(r.sumW2.toString()).toBe("3.0000");
      expect(r.raterCount).toBe(3);
      expect(r.reasonCodes).toEqual([]);
    });

    it("test_claim_3_effective_vote_mass_formula_uneven_weights", () => {
      // [2.0, 1.0, 1.0]: sum_w = 4, sum_w2 = 4+1+1 = 6, n_eff = 16/6 = 2.6666...
      // truncated to 4dp per B-02 AC → 2.6666
      const r = computeEffectiveVoteMass([d("2.0"), d("1.0"), d("1.0")]);
      expect(r.effectiveVoteMass.toString()).toBe("2.6666");
      expect(r.sumW.toString()).toBe("4.0000");
      expect(r.sumW2.toString()).toBe("6.0000");
      expect(r.raterCount).toBe(3);
      expect(r.reasonCodes).toEqual([]);
    });

    it("test_claim_3_effective_vote_mass_single_rater_returns_one", () => {
      // [2.0]: sum_w = 2, sum_w2 = 4, (sum_w)² = 4, n_eff = 4/4 = 1.0000
      // This AC case shows the formula's expected behavior: a single rater has
      // effective mass 1 regardless of their bounded_weight.
      const r = computeEffectiveVoteMass([d("2.0")]);
      expect(r.effectiveVoteMass.toString()).toBe("1.0000");
      expect(r.raterCount).toBe(1);
      expect(r.reasonCodes).toEqual([]);
    });

    it("test_claim_3_effective_vote_mass_empty_set_returns_zero_with_reason", () => {
      const r = computeEffectiveVoteMass([]);
      expect(r.effectiveVoteMass.toString()).toBe("0.0000");
      expect(r.sumW.toString()).toBe("0.0000");
      expect(r.sumW2.toString()).toBe("0.0000");
      expect(r.raterCount).toBe(0);
      expect(r.reasonCodes).toEqual([REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS]);
    });
  });

  describe("determinism", () => {
    it("test_claim_3_effective_vote_mass_three_runs_produce_identical_output", () => {
      const weights = [d("1.5"), d("0.75"), d("1.8234"), d("0.5"), d("2.0")];
      const a = computeEffectiveVoteMass(weights);
      const b = computeEffectiveVoteMass(weights);
      const c = computeEffectiveVoteMass(weights);
      expect(a.effectiveVoteMass.toString()).toBe(b.effectiveVoteMass.toString());
      expect(b.effectiveVoteMass.toString()).toBe(c.effectiveVoteMass.toString());
      // And the raw BigInt must match too — string comparison could mask a
      // hypothetical formatting bug.
      expect(a.effectiveVoteMass.raw).toBe(b.effectiveVoteMass.raw);
    });

    it("test_claim_3_effective_vote_mass_is_order_independent", () => {
      const a = computeEffectiveVoteMass([d("2.0"), d("1.0"), d("1.0")]);
      const b = computeEffectiveVoteMass([d("1.0"), d("2.0"), d("1.0")]);
      const c = computeEffectiveVoteMass([d("1.0"), d("1.0"), d("2.0")]);
      expect(a.effectiveVoteMass.raw).toBe(b.effectiveVoteMass.raw);
      expect(b.effectiveVoteMass.raw).toBe(c.effectiveVoteMass.raw);
    });
  });

  describe("edge cases", () => {
    it("test_claim_3_effective_vote_mass_all_zero_weights_returns_zero_with_reason", () => {
      // sum_w2 = 0 when all weights are zero → treated as the zero-raters case.
      const r = computeEffectiveVoteMass([d("0"), d("0"), d("0")]);
      expect(r.effectiveVoteMass.toString()).toBe("0.0000");
      expect(r.raterCount).toBe(3);
      expect(r.reasonCodes).toEqual([REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS]);
    });

    it("test_claim_3_effective_vote_mass_large_rater_set", () => {
      // 100 raters all with weight 1.0:
      //   sum_w = 100, sum_w2 = 100, n_eff = 10000/100 = 100.0000
      const weights = Array.from({ length: 100 }, () => d("1.0"));
      const r = computeEffectiveVoteMass(weights);
      expect(r.effectiveVoteMass.toString()).toBe("100.0000");
      expect(r.raterCount).toBe(100);
    });

    it("test_claim_3_effective_vote_mass_respects_fractional_weights", () => {
      // [0.5, 0.5]: sum_w = 1, sum_w2 = 0.5, n_eff = 1/0.5 = 2.0000
      const r = computeEffectiveVoteMass([d("0.5"), d("0.5")]);
      expect(r.effectiveVoteMass.toString()).toBe("2.0000");
    });

    it("test_claim_3_effective_vote_mass_at_max_weight_multiplier", () => {
      // [2.0, 2.0, 2.0]: sum_w = 6, sum_w2 = 12, n_eff = 36/12 = 3.0000
      // Three raters all at max_weight_multiplier still have n_eff = 3 (same
      // as three raters at weight 1). This is the expected formula behavior.
      const r = computeEffectiveVoteMass([d("2.0"), d("2.0"), d("2.0")]);
      expect(r.effectiveVoteMass.toString()).toBe("3.0000");
    });
  });
});
