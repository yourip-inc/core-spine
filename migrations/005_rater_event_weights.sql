-- Migration: 005_rater_event_weights.sql
-- Story: T1-S1-C-01
-- Claims: 2 (engagement-signal bounded weights), 19 (per-challenge non-persistence)
--
-- Design:
--   - Composite PRIMARY KEY (challenge_id, rater_id) is the structural
--     enforcement of Claim 19: a rater who rates two challenges gets two rows.
--     There is no cross-challenge singleton for a rater's weight.
--   - Engagement signals are NUMERIC(6,4): four decimal places, range [-9.9999, 9.9999].
--     In practice each signal is a score in [0, 1.0000] by convention, but the
--     column type is permissive so a future scoring_version can extend range.
--   - bounded_weight is NUMERIC(14,4) matching the precision of Decimal4 used
--     throughout the scoring pipeline.
--   - computed_at_utc_ms is bigint (not timestamp) for canonical-JSON compatibility.
--
-- The `challenges` table doesn't exist yet in this repo (full Challenge Service
-- lands in WS-1D). Until then the foreign key cannot reference a real table,
-- so we document the intended cascade here and add the FK in a follow-up
-- migration when `challenges` lands. C-01 AC requires a cascade-delete test;
-- that test lives in the DB integration pass, which runs after WS-1D merges.

BEGIN;

CREATE TABLE rater_event_weights (
    challenge_id            UUID NOT NULL,
    rater_id                UUID NOT NULL,

    -- Engagement signals in [0, 1.0000] by convention (not enforced beyond >= 0).
    watch_completion_score  NUMERIC(6,4) NOT NULL DEFAULT 0,
    frequency_score         NUMERIC(6,4) NOT NULL DEFAULT 0,
    recency_score           NUMERIC(6,4) NOT NULL DEFAULT 0,

    -- Output of the C-02 bounded-weight computation.
    bounded_weight          NUMERIC(14,4) NOT NULL DEFAULT 1.0000,

    -- scoring_version that produced this weight (for version-aware replay).
    scoring_version         TEXT NOT NULL,

    computed_at_utc_ms      BIGINT NOT NULL,

    PRIMARY KEY (challenge_id, rater_id),

    CONSTRAINT signals_nonneg CHECK (
        watch_completion_score >= 0 AND
        frequency_score >= 0 AND
        recency_score >= 0
    ),
    CONSTRAINT bounded_weight_nonneg CHECK (bounded_weight >= 0)
    -- TODO(WS-1D): add FOREIGN KEY (challenge_id) REFERENCES challenges(challenge_id)
    --              ON DELETE CASCADE  once the challenges table lands.
);

CREATE INDEX rater_event_weights_rater_idx ON rater_event_weights(rater_id);
CREATE INDEX rater_event_weights_scoring_version_idx ON rater_event_weights(scoring_version);

COMMIT;
