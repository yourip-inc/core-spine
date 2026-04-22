-- Migration: 001_rubrics.sql
-- Story: T1-S1-A-01 (Create rubrics and rubric_criteria tables)
-- Claims: 1, 14, 21 (rubric lock / multi-criteria rubric / rubric version identifier)
--
-- Design notes:
--   - `rubric_version` is the external, human-pinnable identifier (e.g., "rubric_1.0").
--     It is the identifier that appears in challenge lock records and rating events.
--     See API Contract §3 and PRD REQ-T1-F-04.
--   - `weight_bp` is in integer basis points (1 bp = 0.01%). Sum across a rubric's
--     criteria MUST equal 10000 (enforced in application layer per T1-S1-A-02
--     AND in SQL via a deferrable constraint trigger — see migration 002).
--   - Append-only semantics: rubrics are never UPDATEd after `published_at` is set.
--     A new rubric_version is a new row. See REQ-T1-F-05.

BEGIN;

CREATE TABLE rubrics (
    rubric_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_version        TEXT NOT NULL UNIQUE,       -- e.g. "rubric_1.0"
    name                  TEXT NOT NULL,
    description           TEXT,
    created_at_utc_ms     BIGINT NOT NULL,            -- integer ms, never TIMESTAMP (canonical JSON rule)
    published_at_utc_ms   BIGINT,                     -- NULL until published; once set, rubric is immutable
    canonical_json_sha256 CHAR(64),                   -- hex; event_hash of the rubric definition at publish time
    CONSTRAINT rubric_version_format
        CHECK (rubric_version ~ '^rubric_[0-9]+\.[0-9]+(\.[0-9]+)?$'),
    CONSTRAINT published_hash_pair
        CHECK (
            (published_at_utc_ms IS NULL AND canonical_json_sha256 IS NULL) OR
            (published_at_utc_ms IS NOT NULL AND canonical_json_sha256 IS NOT NULL)
        )
);

CREATE TABLE rubric_criteria (
    criterion_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id             UUID NOT NULL REFERENCES rubrics(rubric_id) ON DELETE RESTRICT,
    criterion_key         TEXT NOT NULL,              -- stable key used in criteria_scores_bp, e.g. "technical_execution"
    display_name          TEXT NOT NULL,
    weight_bp             INTEGER NOT NULL,           -- basis points; sum per rubric = 10000
    scale_min_bp          INTEGER NOT NULL DEFAULT 0,
    scale_max_bp          INTEGER NOT NULL DEFAULT 10000,
    sort_order            INTEGER NOT NULL,
    CONSTRAINT weight_bp_range   CHECK (weight_bp >= 0 AND weight_bp <= 10000),
    CONSTRAINT scale_range       CHECK (scale_min_bp >= 0 AND scale_max_bp > scale_min_bp),
    CONSTRAINT criterion_key_fmt CHECK (criterion_key ~ '^[a-z][a-z0-9_]{1,63}$'),
    UNIQUE (rubric_id, criterion_key),
    UNIQUE (rubric_id, sort_order)
);

CREATE INDEX rubric_criteria_rubric_id_idx ON rubric_criteria(rubric_id);

-- Prevent any UPDATE after a rubric has been published. DELETE is never allowed
-- on published rubrics and is also disallowed on draft rubrics with criteria
-- (safety net; application layer enforces too).
CREATE OR REPLACE FUNCTION rubrics_no_update_after_publish() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.published_at_utc_ms IS NOT NULL THEN
        RAISE EXCEPTION 'rubric % is published and immutable (REQ-T1-F-05)', OLD.rubric_version
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rubrics_no_update_after_publish_trg
    BEFORE UPDATE ON rubrics
    FOR EACH ROW
    EXECUTE FUNCTION rubrics_no_update_after_publish();

CREATE OR REPLACE FUNCTION rubric_criteria_no_mutation_after_publish() RETURNS TRIGGER AS $$
DECLARE
    pub BIGINT;
BEGIN
    SELECT published_at_utc_ms INTO pub FROM rubrics
        WHERE rubric_id = COALESCE(NEW.rubric_id, OLD.rubric_id);
    IF pub IS NOT NULL THEN
        RAISE EXCEPTION 'rubric_criteria for published rubric are immutable (REQ-T1-F-05)'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rubric_criteria_no_mutation_trg
    BEFORE INSERT OR UPDATE OR DELETE ON rubric_criteria
    FOR EACH ROW
    EXECUTE FUNCTION rubric_criteria_no_mutation_after_publish();

COMMIT;
