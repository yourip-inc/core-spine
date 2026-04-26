/**
 * WS-1C (T1-S1-C-04) — Score Aggregator wiring via rater_event_weights.
 *
 * AC fixtures:
 *   - 3 raters weighted [1.0, 1.5, 0.8] → sum_w = 3.3 and sum_w2 = 3.89
 *   - Missing weight row → 1.0 default with RATER_WEIGHT_DEFAULTED reason code
 *   - Replay produces byte-identical aggregate hash
 */

import { describe, it, expect } from "vitest";
import { ScoreAggregatorService } from "../../../src/scoring/score-aggregator-service.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";
import { CURRENT_SCORING_VERSION } from "../../../src/scoring/stability-score.js";
import type {
  RaterWeight,
  RaterWeightLookup,
  RaterWeightProvider,
} from "../../../src/scoring/rater-weight-provider.js";
import { REASON_CODES } from "../../../src/errors/reason-codes.js";

class LookupStub implements RaterWeightProvider {
  constructor(private readonly byRater: Map<string, Decimal4>) {}
  async getBoundedWeights() {
    throw new Error("legacy path not used in C-04 tests");
  }
  async getWeightsForRaters(
    _challengeId: string,
    raterIds: readonly string[],
    _scoringVersion: string,
  ): Promise<RaterWeightLookup> {
    const hits: RaterWeight[] = [];
    const misses: string[] = [];
    for (const id of raterIds) {
      const w = this.byRater.get(id);
      if (w !== undefined) hits.push({ raterId: id, boundedWeight: w });
      else misses.push(id);
    }
    return { hits, misses };
  }
}

const thresholds = {
  scoreThresholdBp: 5000,
  stabilityThresholdBp: 3000,
  scoringVersion: CURRENT_SCORING_VERSION,
};

const d = (s: string): Decimal4 => Decimal4.parse(s);

function baseInput(overrides: Partial<{ challengeId: string; acceptedRaterIds: string[] }>) {
  return {
    submissionId: "sub-1",
    scoringVersion: CURRENT_SCORING_VERSION,
    meanBp: 7500,
    medianBp: 7500,
    trimmedMeanBp: 7500,
    confidenceLowerBoundBp: 9000,
    confidenceUpperBoundBp: 9500,
    thresholds,
    computedAtUtcMs: 1_700_000_000_000n,
    challengeId: "chal-1",
    acceptedRaterIds: ["r1", "r2", "r3"],
    ...overrides,
  };
}

describe("ScoreAggregator WS-1C wiring", () => {
  describe("test_claim_3_effective_vote_mass_formula_with_real_weights", () => {
    it("produces sum_w = 3.3 and sum_w2 = 3.89 for AC fixture [1.0, 1.5, 0.8]", async () => {
      const provider = new LookupStub(
        new Map([
          ["r1", d("1.0")],
          ["r2", d("1.5")],
          ["r3", d("0.8")],
        ]),
      );
      const svc = new ScoreAggregatorService(provider);
      const result = await svc.compute(baseInput({}));

      expect(result.sumW.toString()).toBe("3.3000");
      expect(result.sumW2.toString()).toBe("3.8900");
      // effective_vote_mass = 3.3² / 3.89 = 10.89 / 3.89 = 2.7994 (truncated to 4dp)
      expect(result.effectiveVoteMass.toString()).toBe("2.7994");
      expect(result.raterCount).toBe(3);
      // Should NOT contain RATER_WEIGHT_DEFAULTED — all raters had rows.
      expect(result.reasonCodes).not.toContain(REASON_CODES.RATER_WEIGHT_DEFAULTED);
    });
  });

  describe("test_claim_3_effective_vote_mass_missing_weight_defaults_to_one", () => {
    it("emits RATER_WEIGHT_DEFAULTED when an accepted rater has no stored weight row", async () => {
      // r2 has a stored row; r1 and r3 do not.
      const provider = new LookupStub(new Map([["r2", d("1.5")]]));
      const svc = new ScoreAggregatorService(provider);
      const result = await svc.compute(baseInput({}));

      expect(result.reasonCodes).toContain(REASON_CODES.RATER_WEIGHT_DEFAULTED);
      // Weights used: [1.5 (r2), 1.0 (r1 default), 1.0 (r3 default)]
      // sum_w = 3.5, sum_w2 = 2.25 + 1 + 1 = 4.25
      expect(result.sumW.toString()).toBe("3.5000");
      expect(result.sumW2.toString()).toBe("4.2500");
      expect(result.raterCount).toBe(3);
    });

    it("emits a single RATER_WEIGHT_DEFAULTED even when multiple raters are missing", async () => {
      const provider = new LookupStub(new Map()); // no stored rows
      const svc = new ScoreAggregatorService(provider);
      const result = await svc.compute(baseInput({}));

      const defaultedCount = result.reasonCodes.filter(
        (c) => c === REASON_CODES.RATER_WEIGHT_DEFAULTED,
      ).length;
      expect(defaultedCount).toBe(1);
      // All three defaulted to 1.0 → sum_w = 3, sum_w2 = 3 → n_eff = 3.0000
      expect(result.effectiveVoteMass.toString()).toBe("3.0000");
    });
  });

  describe("test_claim_21_aggregate_replay_byte_identical", () => {
    it("two calls with identical inputs produce identical canonical_json_sha256", async () => {
      const provider = new LookupStub(
        new Map([
          ["r1", d("1.0")],
          ["r2", d("1.5")],
          ["r3", d("0.8")],
        ]),
      );
      const svc = new ScoreAggregatorService(provider);
      const a = await svc.compute(baseInput({}));
      const b = await svc.compute(baseInput({}));
      expect(a.canonicalJsonSha256).toBe(b.canonicalJsonSha256);
    });

    it("rater ORDER in acceptedRaterIds does not affect the hash", async () => {
      const provider = new LookupStub(
        new Map([
          ["r1", d("1.0")],
          ["r2", d("1.5")],
          ["r3", d("0.8")],
        ]),
      );
      const svc = new ScoreAggregatorService(provider);
      const a = await svc.compute(baseInput({ acceptedRaterIds: ["r1", "r2", "r3"] }));
      const b = await svc.compute(baseInput({ acceptedRaterIds: ["r3", "r1", "r2"] }));
      // sum_w / sum_w2 are order-independent; effective_vote_mass, stability,
      // and the rest of the hash input should all match.
      expect(a.canonicalJsonSha256).toBe(b.canonicalJsonSha256);
    });
  });

  describe("test_claim_1_aggregator_accepts_empty_rater_list", () => {
    it("empty acceptedRaterIds → zero-raters reason code, no defaulted code", async () => {
      const provider = new LookupStub(new Map());
      const svc = new ScoreAggregatorService(provider);
      const result = await svc.compute(baseInput({ acceptedRaterIds: [] }));

      expect(result.raterCount).toBe(0);
      expect(result.effectiveVoteMass.toString()).toBe("0.0000");
      expect(result.reasonCodes).toContain(REASON_CODES.EFFECTIVE_VOTE_MASS_ZERO_RATERS);
      expect(result.reasonCodes).not.toContain(REASON_CODES.RATER_WEIGHT_DEFAULTED);
    });
  });
});
