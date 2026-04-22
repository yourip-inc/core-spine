/**
 * Engagement signal ingestion tests.
 *
 * Story: T1-S1-C-03.
 * Claims: 2 (engagement signals), 19 (per-challenge scoping).
 *
 * AC fixtures:
 *   - Run ingestion for active challenge and verify all three signals populated
 *   - Backfill for completed challenge and verify persistence
 *   - Signal for rater in challenge A must exclude events from challenge B
 *   - Re-run ingestion and verify no duplicates (idempotency)
 *   - Missing telemetry → zero-default signals, does not block
 */

import { describe, it, expect } from "vitest";
import {
  EngagementSignalIngestor,
  type TelemetrySource,
  type RaterSignalRecord,
} from "../../../src/scoring/signal-ingestion.js";
import { Decimal4 } from "../../../src/scoring/decimal4.js";
import { CURRENT_SCORING_VERSION } from "../../../src/scoring/stability-score.js";
import type { PgRaterWeightRepository } from "../../../src/scoring/rater-weight-repository.js";

class MemTelemetry implements TelemetrySource {
  constructor(private readonly byChallenge: Map<string, RaterSignalRecord[]>) {}
  async fetchSignalsForChallenge(challengeId: string): Promise<RaterSignalRecord[]> {
    return this.byChallenge.get(challengeId) ?? [];
  }
}

/**
 * In-memory stand-in for PgRaterWeightRepository. We don't actually hit the
 * real repo's interface — we only need the `upsertWeight` method here.
 * Typed as the full class for convenience (unsafe cast), but only the method
 * the ingestor calls is used.
 */
class MemRepo {
  rows: Array<{
    challengeId: string;
    raterId: string;
    boundedWeight: string;
    watchCompletionScore: string;
    frequencyScore: string;
    recencyScore: string;
    scoringVersion: string;
    computedAtUtcMs: bigint;
  }> = [];

  async upsertWeight(row: Parameters<PgRaterWeightRepository["upsertWeight"]>[0]) {
    // Simulate ON CONFLICT DO UPDATE — replace existing row with same key.
    const keyIdx = this.rows.findIndex(
      (r) => r.challengeId === row.challengeId && r.raterId === row.raterId,
    );
    const flat = {
      challengeId: row.challengeId,
      raterId: row.raterId,
      boundedWeight: row.boundedWeight.toString(),
      watchCompletionScore: row.watchCompletionScore.toString(),
      frequencyScore: row.frequencyScore.toString(),
      recencyScore: row.recencyScore.toString(),
      scoringVersion: row.scoringVersion,
      computedAtUtcMs: row.computedAtUtcMs,
    };
    if (keyIdx >= 0) this.rows[keyIdx] = flat;
    else this.rows.push(flat);
  }
}

const d = (s: string) => Decimal4.parse(s);
const clock = { nowUtcMs: () => 1_700_000_000_000n };

function makeIngestor(telemetryData: Map<string, RaterSignalRecord[]>) {
  const telemetry = new MemTelemetry(telemetryData);
  const repo = new MemRepo();
  const ingestor = new EngagementSignalIngestor(
    telemetry,
    repo as unknown as PgRaterWeightRepository,
    clock,
  );
  return { ingestor, repo };
}

describe("EngagementSignalIngestor", () => {
  describe("test_claim_2_ingestion_populates_all_three_signals", () => {
    it("persists watch, frequency, and recency for each rater", async () => {
      const { ingestor, repo } = makeIngestor(
        new Map([
          ["challenge-A", [
            {
              challengeId: "challenge-A",
              raterId: "r1",
              signals: { watchCompletion: d("0.8"), frequency: d("0.6"), recency: d("0.4") },
            },
          ]],
        ]),
      );
      const stats = await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      expect(stats.recordsUpserted).toBe(1);
      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0]!.watchCompletionScore).toBe("0.8000");
      expect(repo.rows[0]!.frequencyScore).toBe("0.6000");
      expect(repo.rows[0]!.recencyScore).toBe("0.4000");
      expect(repo.rows[0]!.boundedWeight).toBe("1.6000");
    });
  });

  describe("test_claim_19_ingestion_rejects_cross_challenge_telemetry", () => {
    it("refuses to persist a signal record whose challenge_id does not match the requested challenge", async () => {
      // Telemetry returns a record for challenge-B even though we asked for challenge-A.
      // This should throw — per Claim 19, weights must not cross challenge boundaries.
      const { ingestor } = makeIngestor(
        new Map([
          ["challenge-A", [
            {
              challengeId: "challenge-B", // wrong!
              raterId: "r1",
              signals: { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
            },
          ]],
        ]),
      );
      await expect(ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION))
        .rejects.toThrow(/Claim 19/);
    });
  });

  describe("test_claim_2_ingestion_is_idempotent", () => {
    it("re-running ingestion overwrites existing rows rather than creating duplicates", async () => {
      const { ingestor, repo } = makeIngestor(
        new Map([
          ["challenge-A", [
            {
              challengeId: "challenge-A",
              raterId: "r1",
              signals: { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
            },
          ]],
        ]),
      );
      await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      expect(repo.rows).toHaveLength(1);
    });
  });

  describe("test_claim_2_ingestion_missing_signals_default_to_zero", () => {
    it("a record with zero signals does not block computation; persists base weight 1.0", async () => {
      const { ingestor, repo } = makeIngestor(
        new Map([
          ["challenge-A", [
            {
              challengeId: "challenge-A",
              raterId: "r1",
              signals: { watchCompletion: Decimal4.ZERO, frequency: Decimal4.ZERO, recency: Decimal4.ZERO },
            },
          ]],
        ]),
      );
      await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      expect(repo.rows[0]!.boundedWeight).toBe("1.0000");
    });
  });

  describe("test_claim_19_ingestion_scopes_to_requested_challenge", () => {
    it("ingesting challenge-A does not touch rows from challenge-B", async () => {
      // Two challenges with overlapping rater_id "r1" — per Claim 19, these
      // are independent rows keyed by (challenge_id, rater_id).
      const { ingestor, repo } = makeIngestor(
        new Map([
          ["challenge-A", [
            {
              challengeId: "challenge-A",
              raterId: "r1",
              signals: { watchCompletion: d("1.0"), frequency: d("1.0"), recency: d("1.0") },
            },
          ]],
          ["challenge-B", [
            {
              challengeId: "challenge-B",
              raterId: "r1",
              signals: { watchCompletion: d("0.5"), frequency: d("0.5"), recency: d("0.5") },
            },
          ]],
        ]),
      );
      await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      await ingestor.ingestForChallenge("challenge-B", CURRENT_SCORING_VERSION);
      expect(repo.rows).toHaveLength(2);
      const aRow = repo.rows.find((r) => r.challengeId === "challenge-A")!;
      const bRow = repo.rows.find((r) => r.challengeId === "challenge-B")!;
      expect(aRow.boundedWeight).toBe("2.0000");
      expect(bRow.boundedWeight).toBe("1.5000");
      // Same rater_id, different weights because they're different challenges
      expect(aRow.raterId).toBe(bRow.raterId);
    });
  });

  describe("test_claim_2_ingestion_empty_telemetry_returns_zero_stats", () => {
    it("a challenge with no telemetry records produces zero upserts but does not throw", async () => {
      const { ingestor, repo } = makeIngestor(new Map([["challenge-A", []]]));
      const stats = await ingestor.ingestForChallenge("challenge-A", CURRENT_SCORING_VERSION);
      expect(stats.recordsRead).toBe(0);
      expect(stats.recordsUpserted).toBe(0);
      expect(repo.rows).toHaveLength(0);
    });
  });
});
