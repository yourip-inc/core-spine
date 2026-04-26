-- Migration: 003_score_aggregates.sql
-- Greenfield prerequisite for T1-S1-B-01. The B-01 story assumes score_aggregates
-- already exists (its migration is numbered 012 in the original plan implying
-- eleven prior migrations). In this repo we number sequentially; base table here,
-- B-01 columns in 004.
--
-- Claims: 1, 14, 21.
--
-- Design:
--   - One row per (submission_id, scoring_version). This is the authoritative
--     aggregate; recomputation replaces the row atomically in a single UPDATE.
--   - All numeric aggregate fields are integer basis points (bp) where applicable,
--     or NUMERIC(14,4) for floating-ish fields that need determinism.
--   - scoring_version is the pinned scoring ruleset id (separate from rubric_version).
--   - winner_gate_status starts NULL and is populated by Score Aggregator.
--   - Canonical hash of the aggregate row is computed at commit time and stored
--     for audit-bundle inclusion (Claim 21).

BEGIN;

CREATE TABLE score_aggregates (
    score_aggregate_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id             UUID NOT NULL,
    scoring_version           TEXT NOT NULL,

    -- Central tendency + confidence (Claims 1, 14)
    mean_bp                   INTEGER NOT NULL DEFAULT 0,
    median_bp                 INTEGER NOT NULL DEFAULT 0,
    trimmed_mean_bp           INTEGER NOT NULL DEFAULT 0,
    confidence_lower_bound_bp INTEGER NOT NULL DEFAULT 0,
    confidence_upper_bound_bp INTEGER NOT NULL DEFAULT 0,

    -- Weight accumulators (Claim 3 inputs)
    sum_w                     NUMERIC(14,4) NOT NULL DEFAULT 0,
    sum_w2                    NUMERIC(14,4) NOT NULL DEFAULT 0,
    rater_count               INTEGER NOT NULL DEFAULT 0,

    -- Winner gate + reason codes (Claims 1, 20)
    winner_gate_status        TEXT,                          -- NULL | 'PASS' | 'FAIL'
    reason_codes              TEXT[] NOT NULL DEFAULT '{}',

    -- Canonical hash over the aggregate row for audit-bundle inclusion (Claim 21)
    canonical_json_sha256     CHAR(64),

    computed_at_utc_ms        BIGINT NOT NULL,

    -- One aggregate per (submission, scoring_version)
    UNIQUE (submission_id, scoring_version),

    CONSTRAINT bp_ranges CHECK (
        mean_bp BETWEEN 0 AND 10000
        AND median_bp BETWEEN 0 AND 10000
        AND trimmed_mean_bp BETWEEN 0 AND 10000
        AND confidence_lower_bound_bp BETWEEN 0 AND 10000
        AND confidence_upper_bound_bp BETWEEN 0 AND 10000
    ),
    CONSTRAINT winner_gate_status_enum CHECK (
        winner_gate_status IS NULL
        OR winner_gate_status IN ('PASS', 'FAIL')
    ),
    CONSTRAINT bounds_ordered CHECK (confidence_lower_bound_bp <= confidence_upper_bound_bp),
    CONSTRAINT rater_count_nonneg CHECK (rater_count >= 0),
    CONSTRAINT weights_nonneg CHECK (sum_w >= 0 AND sum_w2 >= 0)
);

CREATE INDEX score_aggregates_submission_idx ON score_aggregates(submission_id);

COMMIT;
