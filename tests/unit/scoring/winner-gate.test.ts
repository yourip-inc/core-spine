/**
 * Winner gate tests.
 *
 * Story: T1-S1-B-04.
 * Patent Claim CS-1: requires "stability ranking based at least in part on the
 * effective vote mass and a minimum confidence-lower-bound threshold."
 * Claim CS-17: confidence-lower-bound threshold.
 * Claim CS-20A: reason code emission on gate failure.
 *
 * AC fixtures:
 *   - mean_bp 9000, stability 500  → FAIL with CONFIDENCE_LOWER_BOUND_FAIL
 *   - mean_bp 4000, stability 9000 → FAIL for low score
 *   - both passing                  → PASS
 *   - replay of failing fixture     → identical reason codes
 */

import { describe, it, expect } from "vitest";
import { evaluateWinnerGate } from "../../../src/scoring/winner-gate.js";
import { REASON_CODES } from "../../../src/errors/reason-codes.js";
import { CURRENT_SCORING_VERSION } from "../../../src/scoring/stability-score.js";

const thresholds = {
  scoreThresholdBp: 5000,
  stabilityThresholdBp: 3000,
  scoringVersion: CURRENT_SCORING_VERSION,
};

describe("evaluateWinnerGate (scoring_v1)", () => {
  describe("AC fixtures", () => {
    it("test_claim_CS_1_winner_gate_requires_both_thresholds_high_score_low_stability_fails", () => {
      const r = evaluateWinnerGate({ meanBp: 9000, stabilityScore: 500 }, thresholds);
      expect(r.status).toBe("FAIL");
      expect(r.reasonCodes).toContain(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
      expect(r.reasonCodes).toContain(REASON_CODES.STABILITY_SCORE_BELOW_THRESHOLD);
      expect(r.reasonCodes).not.toContain(REASON_CODES.SCORE_BELOW_THRESHOLD);
    });

    it("test_claim_CS_1_winner_gate_requires_both_thresholds_high_stability_low_score_fails", () => {
      const r = evaluateWinnerGate({ meanBp: 4000, stabilityScore: 9000 }, thresholds);
      expect(r.status).toBe("FAIL");
      expect(r.reasonCodes).toContain(REASON_CODES.SCORE_BELOW_THRESHOLD);
      expect(r.reasonCodes).not.toContain(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
      expect(r.reasonCodes).not.toContain(REASON_CODES.STABILITY_SCORE_BELOW_THRESHOLD);
    });

    it("test_claim_CS_1_winner_gate_requires_both_thresholds_both_passing_returns_pass", () => {
      const r = evaluateWinnerGate({ meanBp: 7500, stabilityScore: 6000 }, thresholds);
      expect(r.status).toBe("PASS");
      expect(r.reasonCodes).toEqual([]);
    });

    it("test_claim_CS_1_winner_gate_both_failing_emits_all_three_reason_codes", () => {
      const r = evaluateWinnerGate({ meanBp: 1000, stabilityScore: 500 }, thresholds);
      expect(r.status).toBe("FAIL");
      expect(r.reasonCodes).toEqual([
        REASON_CODES.SCORE_BELOW_THRESHOLD,
        REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL,
        REASON_CODES.STABILITY_SCORE_BELOW_THRESHOLD,
      ]);
    });

    it("test_claim_CS_20A_winner_gate_replay_produces_identical_reason_codes", () => {
      const input = { meanBp: 9000, stabilityScore: 500 };
      const a = evaluateWinnerGate(input, thresholds);
      const b = evaluateWinnerGate(input, thresholds);
      const c = evaluateWinnerGate(input, thresholds);
      expect(a.reasonCodes).toEqual(b.reasonCodes);
      expect(b.reasonCodes).toEqual(c.reasonCodes);
      expect(a.status).toBe(b.status);
    });
  });

  describe("boundary conditions", () => {
    it("test_claim_CS_17_winner_gate_exact_threshold_passes", () => {
      // Threshold is inclusive (>=) per B-04 spec.
      const r = evaluateWinnerGate(
        { meanBp: thresholds.scoreThresholdBp, stabilityScore: thresholds.stabilityThresholdBp },
        thresholds,
      );
      expect(r.status).toBe("PASS");
    });

    it("test_claim_CS_17_winner_gate_one_bp_below_score_threshold_fails", () => {
      const r = evaluateWinnerGate(
        { meanBp: thresholds.scoreThresholdBp - 1, stabilityScore: 9000 },
        thresholds,
      );
      expect(r.status).toBe("FAIL");
      expect(r.reasonCodes).toEqual([REASON_CODES.SCORE_BELOW_THRESHOLD]);
    });

    it("test_claim_CS_17_winner_gate_one_bp_below_stability_threshold_fails", () => {
      const r = evaluateWinnerGate(
        { meanBp: 9000, stabilityScore: thresholds.stabilityThresholdBp - 1 },
        thresholds,
      );
      expect(r.status).toBe("FAIL");
      expect(r.reasonCodes).toContain(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
    });
  });

  describe("input validation", () => {
    it("test_claim_CS_14_winner_gate_rejects_non_integer_mean_bp", () => {
      expect(() =>
        evaluateWinnerGate({ meanBp: 5000.5, stabilityScore: 5000 }, thresholds),
      ).toThrow(/integer/);
    });

    it("test_claim_CS_14_winner_gate_rejects_mean_bp_out_of_range", () => {
      expect(() =>
        evaluateWinnerGate({ meanBp: -1, stabilityScore: 5000 }, thresholds),
      ).toThrow(/out of range/);
      expect(() =>
        evaluateWinnerGate({ meanBp: 10001, stabilityScore: 5000 }, thresholds),
      ).toThrow(/out of range/);
    });

    it("test_claim_CS_14_winner_gate_rejects_stability_score_out_of_range", () => {
      expect(() =>
        evaluateWinnerGate({ meanBp: 5000, stabilityScore: -1 }, thresholds),
      ).toThrow(/out of range/);
      expect(() =>
        evaluateWinnerGate({ meanBp: 5000, stabilityScore: 10001 }, thresholds),
      ).toThrow(/out of range/);
    });
  });

  describe("version binding", () => {
    it("test_claim_CS_1_winner_gate_echoes_scoring_version_in_result_for_audit", () => {
      // The gate result includes scoring_version so it can be persisted onto
      // the aggregate row for audit-bundle replay (Claim CS-21, Claim CS-23).
      const r = evaluateWinnerGate({ meanBp: 7000, stabilityScore: 5000 }, thresholds);
      expect(r.scoringVersion).toBe(CURRENT_SCORING_VERSION);
      expect(r.scoreThresholdBp).toBe(thresholds.scoreThresholdBp);
      expect(r.stabilityThresholdBp).toBe(thresholds.stabilityThresholdBp);
    });
  });
});
