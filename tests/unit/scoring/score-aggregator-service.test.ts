/**
 * Score Aggregator integration test.
 *
 * Story: WS-1B end-to-end — exercises T1-S1-B-02, B-03, B-04 together.
 * Claims: CS-1, CS-3, CS-14, CS-17, CS-20A, CS-21.
 */

import { describe, it, expect } from "vitest";
import { ScoreAggregatorService } from "../../../src/scoring/score-aggregator-service.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";
import { CURRENT_SCORING_VERSION } from "../../../src/scoring/stability-score.js";
import type { RaterWeightProvider, RaterWeight } from "../../../src/scoring/rater-weight-provider.js";
import { REASON_CODES } from "../../../src/errors/reason-codes.js";

/**
 * In-memory provider used by WS-1B tests. WS-1C will ship a PG-backed impl
 * with the same interface.
 */
class StubProvider implements RaterWeightProvider {
  constructor(private readonly weights: RaterWeight[]) {}
  async getBoundedWeights(_s: string, _v: string): Promise<RaterWeight[]> {
    return [...this.weights];
  }
  async getWeightsForRaters(_cid: string, raterIds: readonly string[], _v: string) {
    const byId = new Map(this.weights.map((w) => [w.raterId, w]));
    const hits: RaterWeight[] = [];
    const misses: string[] = [];
    for (const id of raterIds) {
      const w = byId.get(id);
      if (w) hits.push(w); else misses.push(id);
    }
    return { hits, misses };
  }
}

const thresholds = {
  scoreThresholdBp: 5000,
  stabilityThresholdBp: 3000,
  scoringVersion: CURRENT_SCORING_VERSION,
};

describe("ScoreAggregatorService", () => {
  describe("test_claim_CS_1_score_aggregator_end_to_end", () => {
    it("passes raters through to compute aggregate and evaluates gate (5 raters fails stability)", async () => {
      const provider = new StubProvider([
        { raterId: "r1", boundedWeight: Decimal4.parse("1.0") },
        { raterId: "r2", boundedWeight: Decimal4.parse("1.0") },
        { raterId: "r3", boundedWeight: Decimal4.parse("1.0") },
        { raterId: "r4", boundedWeight: Decimal4.parse("1.0") },
        { raterId: "r5", boundedWeight: Decimal4.parse("1.0") },
      ]);
      const svc = new ScoreAggregatorService(provider);

      const result = await svc.compute({
        submissionId: "sub-1",
        scoringVersion: CURRENT_SCORING_VERSION,
        meanBp: 7500,
        medianBp: 7600,
        trimmedMeanBp: 7400,
        confidenceLowerBoundBp: 7000,
        confidenceUpperBoundBp: 8000,
        thresholds,
        computedAtUtcMs: 1_700_000_000_000n,
      });

      expect(result.raterCount).toBe(5);
      expect(result.effectiveVoteMass.toString()).toBe("5.0000");
      // mass*100 = 500, min(500, 7000) = 500. Below stability threshold (3000)!
      expect(result.stabilityScore).toBe(500);
      expect(result.winnerGateStatus).toBe("FAIL");
      expect(result.reasonCodes).toContain(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
    });
  });

  describe("test_claim_CS_1_score_aggregator_pass_scenario_needs_enough_raters", () => {
    it("a submission with 30 equally-weighted raters passes both gates", async () => {
      // eff_mass = 30. mass*100 = 3000. min(3000, 9000) = 3000. Exactly at threshold.
      const provider = new StubProvider(
        Array.from({ length: 30 }, (_, i) => ({
          raterId: `r${i}`,
          boundedWeight: Decimal4.parse("1.0"),
        })),
      );
      const svc = new ScoreAggregatorService(provider);

      const result = await svc.compute({
        submissionId: "sub-big",
        scoringVersion: CURRENT_SCORING_VERSION,
        meanBp: 7500,
        medianBp: 7500,
        trimmedMeanBp: 7500,
        confidenceLowerBoundBp: 9000,
        confidenceUpperBoundBp: 9500,
        thresholds,
        computedAtUtcMs: 1_700_000_000_000n,
      });

      expect(result.effectiveVoteMass.toString()).toBe("30.0000");
      expect(result.stabilityScore).toBe(3000);
      expect(result.winnerGateStatus).toBe("PASS");
      expect(result.reasonCodes).toEqual([]);
    });
  });

  describe("test_claim_CS_1_score_aggregator_empty_rater_set", () => {
    it("emits zero-raters reason code and fails the winner gate", async () => {
      const svc = new ScoreAggregatorService(new StubProvider([]));
      const result = await svc.compute({
        submissionId: "sub-empty",
        scoringVersion: CURRENT_SCORING_VERSION,
        meanBp: 9000,
        medianBp: 9000,
        trimmedMeanBp: 9000,
        confidenceLowerBoundBp: 9000,
        confidenceUpperBoundBp: 9500,
        thresholds,
        computedAtUtcMs: 1_700_000_000_000n,
      });
      expect(result.raterCount).toBe(0);
      expect(result.effectiveVoteMass.toString()).toBe("0.0000");
      expect(result.stabilityScore).toBe(0);
      expect(result.winnerGateStatus).toBe("FAIL");
      expect(result.reasonCodes).toContain(REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS);
      expect(result.reasonCodes).toContain(REASON_CODES.CONFIDENCE_LOWER_BOUND_FAIL);
    });
  });

  describe("test_claim_CS_21_score_aggregator_canonical_hash_is_deterministic", () => {
    it("identical inputs produce identical canonical_json_sha256", async () => {
      const weights = [
        { raterId: "r1", boundedWeight: Decimal4.parse("1.5") },
        { raterId: "r2", boundedWeight: Decimal4.parse("0.8") },
        { raterId: "r3", boundedWeight: Decimal4.parse("1.2") },
      ];
      const input = {
        submissionId: "sub-hash-test",
        scoringVersion: CURRENT_SCORING_VERSION,
        meanBp: 7500,
        medianBp: 7500,
        trimmedMeanBp: 7500,
        confidenceLowerBoundBp: 9000,
        confidenceUpperBoundBp: 9500,
        thresholds,
        computedAtUtcMs: 1_700_000_000_000n,
      };

      const svc1 = new ScoreAggregatorService(new StubProvider(weights));
      const svc2 = new ScoreAggregatorService(new StubProvider([...weights].reverse()));

      const r1 = await svc1.compute(input);
      const r2 = await svc2.compute(input);

      // Hash must match despite different rater ORDER in the provider.
      expect(r1.canonicalJsonSha256).toBe(r2.canonicalJsonSha256);
      expect(r1.canonicalJsonSha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("test_claim_CS_14_score_aggregator_rejects_scoring_version_mismatch", () => {
    it("throws when input scoring_version differs from thresholds.scoring_version", async () => {
      const svc = new ScoreAggregatorService(new StubProvider([]));
      await expect(svc.compute({
        submissionId: "sub-x",
        scoringVersion: "scoring_v2",
        meanBp: 5000,
        medianBp: 5000,
        trimmedMeanBp: 5000,
        confidenceLowerBoundBp: 5000,
        confidenceUpperBoundBp: 6000,
        thresholds, // scoring_v1
        computedAtUtcMs: 0n,
      })).rejects.toThrow(/scoring_version mismatch/);
    });
  });
});
