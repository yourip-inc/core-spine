/**
 * Bounded weight tests.
 *
 * Story: T1-S1-C-02.
 * Patent Claim CS-2: engagement-signal bounded weights.
 *
 * AC fixtures:
 *   - watch 0.8, freq 0.6, recency 0.4, equal signal weights → deterministic output
 *   - signals exceeding ceiling → clamps to 2.0 exactly
 *   - all zeros → 1.0 base weight
 *   - identical inputs on different runs → identical output
 */

import { describe, it, expect } from "vitest";
import {
  computeBoundedWeight,
  DEFAULT_MAX_WEIGHT_MULTIPLIER,
} from "../../../src/scoring/bounded-weight.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";

const d = (s: string): Decimal4 => Decimal4.parse(s);

describe("computeBoundedWeight (scoring_v1)", () => {
  describe("patent AC boundary cases", () => {
    it("test_claim_CS_2_bounded_engagement_weights_all_zeros_returns_base_weight_one", () => {
      const w = computeBoundedWeight({
        watchCompletion: Decimal4.ZERO,
        frequency: Decimal4.ZERO,
        recency: Decimal4.ZERO,
      });
      expect(w.toString()).toBe("1.0000");
    });

    it("test_claim_CS_2_bounded_engagement_weights_all_max_returns_max_weight_multiplier", () => {
      const w = computeBoundedWeight({
        watchCompletion: d("1.0"),
        frequency: d("1.0"),
        recency: d("1.0"),
      });
      expect(w.toString()).toBe("2.0000");
    });

    it("test_claim_CS_2_bounded_engagement_weights_default_max_multiplier_is_two", () => {
      expect(DEFAULT_MAX_WEIGHT_MULTIPLIER.toString()).toBe("2.0000");
    });
  });

  describe("AC fixture: watch 0.8, freq 0.6, recency 0.4", () => {
    it("test_claim_CS_2_bounded_engagement_weights_midpoints_produce_expected_value", () => {
      // Equal signal weights. Weighted mean = (0.8+0.6+0.4)/3 = 0.6.
      // Weight = 1 + 0.6*(2-1) = 1.6000
      const w = computeBoundedWeight({
        watchCompletion: d("0.8"),
        frequency: d("0.6"),
        recency: d("0.4"),
      });
      expect(w.toString()).toBe("1.6000");
    });
  });

  describe("clamping", () => {
    it("test_claim_CS_2_bounded_engagement_weights_clamped_at_upper_bound", () => {
      // Signals exceeding 1.0 get clamped to 1.0 before the weighted mean,
      // which caps the output weight at max_weight_multiplier (2.0).
      const w = computeBoundedWeight({
        watchCompletion: d("5.0"),
        frequency: d("5.0"),
        recency: d("5.0"),
      });
      expect(w.toString()).toBe("2.0000");
    });

    it("test_claim_CS_2_bounded_engagement_weights_negative_signals_clamped_to_zero", () => {
      // Negative signals aren't meaningful but we defensively clamp to 0,
      // which yields the base weight.
      const w = computeBoundedWeight({
        watchCompletion: d("-0.5"),
        frequency: d("0"),
        recency: d("0"),
      });
      expect(w.toString()).toBe("1.0000");
    });

    it("test_claim_CS_2_bounded_engagement_weights_custom_max_weight_multiplier", () => {
      // max = 3.0, all signals 1.0 → weight = 3.0
      const w = computeBoundedWeight(
        { watchCompletion: d("1.0"), frequency: d("1.0"), recency: d("1.0") },
        { maxWeightMultiplier: d("3.0") },
      );
      expect(w.toString()).toBe("3.0000");
    });

    it("test_claim_CS_2_bounded_engagement_weights_rejects_max_less_than_one", () => {
      expect(() =>
        computeBoundedWeight(
          { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
          { maxWeightMultiplier: d("0.5") },
        ),
      ).toThrow(/max_weight_multiplier must be >= 1.0/);
    });
  });

  describe("custom signal weights", () => {
    it("test_claim_CS_2_bounded_engagement_weights_signal_weights_are_relative", () => {
      // Equal weights {1,1,1} and {2,2,2} must produce identical output.
      const signals = {
        watchCompletion: d("0.8"),
        frequency: d("0.6"),
        recency: d("0.4"),
      };
      const a = computeBoundedWeight(signals, {
        signalWeights: {
          watchWeight: d("1"),
          frequencyWeight: d("1"),
          recencyWeight: d("1"),
        },
      });
      const b = computeBoundedWeight(signals, {
        signalWeights: {
          watchWeight: d("2"),
          frequencyWeight: d("2"),
          recencyWeight: d("2"),
        },
      });
      expect(a.raw).toBe(b.raw);
    });

    it("test_claim_CS_2_bounded_engagement_weights_signal_weights_rebalance_output", () => {
      // Double the recency weight: weighted mean = (0.8*1 + 0.6*1 + 0.4*2)/(1+1+2) = 2.2/4 = 0.55
      // Weight = 1 + 0.55*1 = 1.5500
      const w = computeBoundedWeight(
        { watchCompletion: d("0.8"), frequency: d("0.6"), recency: d("0.4") },
        {
          signalWeights: {
            watchWeight: d("1"),
            frequencyWeight: d("1"),
            recencyWeight: d("2"),
          },
        },
      );
      expect(w.toString()).toBe("1.5500");
    });

    it("test_claim_CS_2_bounded_engagement_weights_rejects_zero_signal_weights", () => {
      expect(() =>
        computeBoundedWeight(
          { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
          {
            signalWeights: {
              watchWeight: d("0"),
              frequencyWeight: d("0"),
              recencyWeight: d("0"),
            },
          },
        ),
      ).toThrow(/signal weights sum to zero/);
    });
  });

  describe("determinism", () => {
    it("test_claim_CS_2_bounded_engagement_weights_deterministic_across_runs", () => {
      const signals = {
        watchCompletion: d("0.8"),
        frequency: d("0.6"),
        recency: d("0.4"),
      };
      const a = computeBoundedWeight(signals);
      const b = computeBoundedWeight(signals);
      const c = computeBoundedWeight(signals);
      expect(a.raw).toBe(b.raw);
      expect(b.raw).toBe(c.raw);
    });
  });

  describe("version pinning", () => {
    it("test_claim_CS_2_bounded_engagement_weights_rejects_unknown_scoring_version", () => {
      expect(() =>
        computeBoundedWeight(
          { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
          { scoringVersion: "scoring_v99" },
        ),
      ).toThrow(/unknown scoring_version/);
    });
  });
});
