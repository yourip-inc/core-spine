/**
 * PG-backed RaterWeightProvider.
 *
 * Story: T1-S1-C-01 wiring. Implements both the legacy WS-1B shape
 * (getBoundedWeights by submission_id) and the WS-1C shape
 * (getWeightsForRaters by challenge_id + rater_ids).
 *
 * The legacy shape's submission→rater resolution lives in the Rating Service
 * and is not implemented here yet. Until WS-1B's Rating Service persistence
 * lands (it's a stub today), this method throws — production code paths
 * currently use getWeightsForRaters.
 */

import type { Pool } from "pg";
import { Decimal4 } from "./decimal4.js";
import type { RaterWeight, RaterWeightLookup, RaterWeightProvider } from "./rater-weight-provider.js";

export class PgRaterWeightRepository implements RaterWeightProvider {
  constructor(private readonly pool: Pool) {}

  async getBoundedWeights(_submissionId: string, _scoringVersion: string): Promise<RaterWeight[]> {
    // Legacy shape. Requires resolving submissionId → accepted rater_ids →
    // challenge_id, which lives in the Rating Service. The Rating Service
    // persistence layer doesn't exist yet. Callers on the WS-1B path should
    // migrate to getWeightsForRaters.
    throw new Error(
      "PgRaterWeightRepository.getBoundedWeights: not yet implemented; callers should use getWeightsForRaters(challengeId, raterIds, scoringVersion)",
    );
  }

  async getWeightsForRaters(
    challengeId: string,
    raterIds: readonly string[],
    scoringVersion: string,
  ): Promise<RaterWeightLookup> {
    if (raterIds.length === 0) {
      return { hits: [], misses: [] };
    }
    const client = await this.pool.connect();
    try {
      // Parameterize the rater_ids list as a TEXT[] to avoid per-call IN list
      // SQL construction. Postgres handles `= ANY($2::uuid[])` efficiently.
      const { rows } = await client.query<{
        rater_id: string;
        bounded_weight: string; // NUMERIC returns as string (we don't override the oid)
      }>(
        `SELECT rater_id, bounded_weight
           FROM rater_event_weights
          WHERE challenge_id = $1::uuid
            AND scoring_version = $2
            AND rater_id = ANY($3::uuid[])`,
        [challengeId, scoringVersion, [...raterIds]],
      );

      const byId = new Map<string, Decimal4>();
      for (const r of rows) {
        byId.set(r.rater_id, Decimal4.parse(r.bounded_weight));
      }

      const hits: RaterWeight[] = [];
      const misses: string[] = [];
      for (const id of raterIds) {
        const w = byId.get(id);
        if (w !== undefined) {
          hits.push({ raterId: id, boundedWeight: w });
        } else {
          misses.push(id);
        }
      }
      return { hits, misses };
    } finally {
      client.release();
    }
  }

  /**
   * Upsert a computed bounded_weight row. Used by C-02 after computing weights
   * from engagement signals. Idempotent on (challenge_id, rater_id).
   */
  async upsertWeight(row: {
    challengeId: string;
    raterId: string;
    watchCompletionScore: Decimal4;
    frequencyScore: Decimal4;
    recencyScore: Decimal4;
    boundedWeight: Decimal4;
    scoringVersion: string;
    computedAtUtcMs: bigint;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO rater_event_weights
           (challenge_id, rater_id, watch_completion_score, frequency_score,
            recency_score, bounded_weight, scoring_version, computed_at_utc_ms)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (challenge_id, rater_id) DO UPDATE
           SET watch_completion_score = EXCLUDED.watch_completion_score,
               frequency_score        = EXCLUDED.frequency_score,
               recency_score          = EXCLUDED.recency_score,
               bounded_weight         = EXCLUDED.bounded_weight,
               scoring_version        = EXCLUDED.scoring_version,
               computed_at_utc_ms     = EXCLUDED.computed_at_utc_ms`,
        [
          row.challengeId,
          row.raterId,
          row.watchCompletionScore.toString(),
          row.frequencyScore.toString(),
          row.recencyScore.toString(),
          row.boundedWeight.toString(),
          row.scoringVersion,
          row.computedAtUtcMs.toString(),
        ],
      );
    } finally {
      client.release();
    }
  }
}
