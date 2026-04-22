/**
 * Stability score tests.
 *
 * Story: T1-S1-B-03.
 * Patent claims: 1 (stability ranking), 14 (stability component of winner gate).
 *
 * AC fixtures:
 *   - high effective_vote_mass + high confidence → high stability
 *   - high effective_vote_mass + low  confidence → low  stability (bottlenecked)
 *   - zero effective_vote_mass                    → zero stability
 *
 * Formula (scoring_v1):
 *   stability_score = clamp(min(eff_vote_mass × 100, conf_lb_bp), 0, 10000)
 */

import { describe, it, expect } from "vitest";
import { deriveStabilityScore, CURRENT_SCORING_VERSION } from "../../../src/scoring/stability-score.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";

describe("deriveStabilityScore (scoring_v1)", () => {
  describe("AC fixtures", () => {
    it("test_claim_14_stability_score_high_mass_and_high_confidence_yields_high_stability", () => {
      // eff_mass = 50, conf_lb_bp = 9000. mass*100 = 5000. min(5000, 9000) = 5000.
      const s = deriveStabilityScore(Decimal4.parse("50"), 9000);
      expect(s).toBe(5000);
    });

    it("test_claim_14_stability_score_high_mass_but_low_confidence_bottlenecks_on_confidence", () => {
      // eff_mass = 100, conf_lb_bp = 1000. mass*100 = 10000. min(10000, 1000) = 1000.
      const s = deriveStabilityScore(Decimal4.parse("100"), 1000);
      expect(s).toBe(1000);
    });

    it("test_claim_14_stability_score_high_confidence_but_low_mass_bottlenecks_on_mass", () => {
      // eff_mass = 5, conf_lb_bp = 9500. mass*100 = 500. min(500, 9500) = 500.
      const s = deriveStabilityScore(Decimal4.parse("5"), 9500);
      expect(s).toBe(500);
    });

    it("test_claim_14_stability_score_zero_mass_yields_zero", () => {
      const s = deriveStabilityScore(Decimal4.ZERO, 9500);
      expect(s).toBe(0);
    });

    it("test_claim_14_stability_score_zero_confidence_yields_zero", () => {
      const s = deriveStabilityScore(Decimal4.parse("50"), 0);
      expect(s).toBe(0);
    });
  });

  describe("clamping and range validation", () => {
    it("test_claim_14_stability_score_clamps_to_upper_bound_10000", () => {
      // eff_mass = 150, conf_lb_bp = 10000. mass*100 = 15000 → clamped to 10000.
      const s = deriveStabilityScore(Decimal4.parse("150"), 10000);
      expect(s).toBe(10000);
    });

    it("test_claim_14_stability_score_at_upper_boundary_exact", () => {
      // eff_mass = 100, conf_lb_bp = 10000. mass*100 = 10000. min = 10000.
      const s = deriveStabilityScore(Decimal4.parse("100"), 10000);
      expect(s).toBe(10000);
    });

    it("test_claim_14_stability_score_rejects_confidence_out_of_range", () => {
      expect(() => deriveStabilityScore(Decimal4.parse("1"), -1)).toThrow(/out of range/);
      expect(() => deriveStabilityScore(Decimal4.parse("1"), 10001)).toThrow(/out of range/);
    });

    it("test_claim_14_stability_score_rejects_non_integer_confidence", () => {
      expect(() => deriveStabilityScore(Decimal4.parse("1"), 5000.5)).toThrow(/integer/);
    });
  });

  describe("fractional mass truncation", () => {
    it("test_claim_14_stability_score_truncates_fractional_mass_toward_zero", () => {
      // eff_mass = 2.6666, mass*100 = 266.6600, truncated to 266.
      // min(266, 9000) = 266.
      const s = deriveStabilityScore(Decimal4.parse("2.6666"), 9000);
      expect(s).toBe(266);
    });

    it("test_claim_14_stability_score_tiny_mass_is_still_representable", () => {
      // eff_mass = 0.0100, mass*100 = 1.0000, truncated to 1.
      const s = deriveStabilityScore(Decimal4.parse("0.01"), 9000);
      expect(s).toBe(1);
    });
  });

  describe("version pinning", () => {
    it("test_claim_14_stability_score_accepts_current_scoring_version_explicitly", () => {
      const s = deriveStabilityScore(Decimal4.parse("10"), 5000, CURRENT_SCORING_VERSION);
      expect(s).toBe(1000);
    });

    it("test_claim_14_stability_score_rejects_unknown_scoring_version", () => {
      expect(() => deriveStabilityScore(Decimal4.parse("10"), 5000, "scoring_v99"))
        .toThrow(/unknown scoring_version/);
    });

    it("test_claim_14_stability_score_is_deterministic_across_repeated_calls", () => {
      const args: [Decimal4, number] = [Decimal4.parse("7.3456"), 4321];
      const a = deriveStabilityScore(...args);
      const b = deriveStabilityScore(...args);
      const c = deriveStabilityScore(...args);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });
  });
});
