/**
 * Engagement signal ingestion.
 *
 * Story: T1-S1-C-03.
 * Claims: CS-2 (engagement signals), CS-19 (per-challenge scoping).
 *
 * Sources three signals per (challenge_id, rater_id) from the playback-event
 * telemetry pipeline and upserts bounded_weight rows into rater_event_weights.
 *
 * Idempotency: safe to re-run. Each (challenge_id, rater_id) row is upserted
 * via ON CONFLICT; re-ingestion overwrites with the freshest signal values
 * and the latest scoring_version.
 *
 * Scoping: telemetry records must be scoped to within-challenge events. The
 * TelemetrySource interface requires a challenge_id argument and it MUST only
 * return events from that challenge. Cross-challenge aggregation would
 * violate Claim CS-19 and produces a broken audit record.
 *
 * Missing signals: a rater with partial telemetry (say, watch completion but
 * no frequency data) receives zero for the missing signals. Missing signals
 * default to zero, not to the overall base weight, so that a rater with some
 * engagement still gets partial credit.
 *
 * Freshness SLA: documented in docs/scoring-model-requirements.md §6.
 * Default: 15 minutes from telemetry event → rater_event_weights row.
 */

import { Decimal4 } from "./decimal4.js";
import { computeBoundedWeight, type EngagementSignals, type BoundedWeightOptions } from "./bounded-weight.js";
import type { PgRaterWeightRepository } from "./rater-weight-repository.js";

/**
 * Raw engagement signals sourced from the playback pipeline for one rater in
 * one challenge. All three scores are [0, 1]. Missing data → 0.
 */
export interface RaterSignalRecord {
  challengeId: string;
  raterId: string;
  signals: EngagementSignals;
}

/**
 * Abstraction over the playback telemetry pipeline. Production wires this to
 * the real events warehouse; tests pass an in-memory array.
 */
export interface TelemetrySource {
  /**
   * Fetch signal records for the given challenge. Must filter to
   * within-challenge events only — Claim CS-19 non-persistence requirement.
   */
  fetchSignalsForChallenge(challengeId: string): Promise<RaterSignalRecord[]>;
}

export interface IngestionStats {
  challengeId: string;
  recordsRead: number;
  recordsUpserted: number;
  scoringVersion: string;
}

export class EngagementSignalIngestor {
  constructor(
    private readonly telemetry: TelemetrySource,
    private readonly weights: PgRaterWeightRepository,
    private readonly clock: { nowUtcMs: () => bigint },
  ) {}

  /**
   * Ingest signals for a single challenge. Idempotent: re-running overwrites
   * existing rows with the latest computed bounded_weight.
   */
  async ingestForChallenge(
    challengeId: string,
    scoringVersion: string,
    opts: BoundedWeightOptions = {},
  ): Promise<IngestionStats> {
    const records = await this.telemetry.fetchSignalsForChallenge(challengeId);
    let upserted = 0;
    const now = this.clock.nowUtcMs();

    for (const record of records) {
      // Scoping safety net: telemetry source is trusted to pre-filter, but
      // we double-check here. A record for a different challenge is a
      // programming error upstream and we refuse to propagate it.
      if (record.challengeId !== challengeId) {
        throw new Error(
          `EngagementSignalIngestor: telemetry returned cross-challenge record ` +
          `(expected ${challengeId}, got ${record.challengeId}) for rater ${record.raterId}. ` +
          `This violates Claim CS-19.`,
        );
      }

      // Missing signals default to zero — the EngagementSignals type already
      // requires all three fields, so a missing-signal case at the source
      // would materialize as Decimal4.ZERO. We don't synthesize anything here.

      const bounded = computeBoundedWeight(record.signals, {
        ...opts,
        scoringVersion,
      });

      await this.weights.upsertWeight({
        challengeId,
        raterId: record.raterId,
        watchCompletionScore: record.signals.watchCompletion,
        frequencyScore:       record.signals.frequency,
        recencyScore:         record.signals.recency,
        boundedWeight:        bounded,
        scoringVersion,
        computedAtUtcMs:      now,
      });
      upserted++;
    }

    return {
      challengeId,
      recordsRead: records.length,
      recordsUpserted: upserted,
      scoringVersion,
    };
  }
}

/**
 * Convenience factory so callers can supply an empty signals record (no
 * engagement data yet) and get a Decimal4 for each field.
 */
export function emptySignals(): EngagementSignals {
  return {
    watchCompletion: Decimal4.ZERO,
    frequency:       Decimal4.ZERO,
    recency:         Decimal4.ZERO,
  };
}
