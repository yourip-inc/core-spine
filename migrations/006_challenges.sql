-- Migration: 006_challenges.sql
-- Greenfield prerequisite for WS-1D.
--
-- WS-1D stories (T1-S1-D-01..D-03) reference the `challenges` table and an
-- "existing post-open mutation guard." Neither exists in this greenfield repo.
-- This migration creates a minimal Challenge table + the guard so WS-1D can
-- satisfy its full acceptance criteria.
--
-- The full Challenge Service (version pinning, ruleset lock, rubric lock, etc.)
-- is WS-1D+ / WS-2 territory. This is intentionally the minimal shape:
--   - challenge_id PK
--   - ruleset_version + rubric_version + payout_ruleset_version (the three
--     "pinned version" columns that should never be mutated directly after
--     a challenge opens — Claim 11 requires migrations go through the
--     challenge_migrations table, not direct UPDATE).
--   - opens_at_utc_ms / closes_at_utc_ms
--   - state: DRAFT | OPEN | CLOSED
--
-- The guard at the bottom fires on any direct UPDATE of the three version
-- columns once a challenge has transitioned out of DRAFT. This is the
-- "existing post-open mutation guard" the D-03 AC refers to — we install it
-- here so later stories can take it for granted.

BEGIN;

CREATE TABLE challenges (
    challenge_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     TEXT NOT NULL,

    -- The three pinned versions. Once opens_at_utc_ms is in the past, these
    -- cannot be mutated directly; only through a challenge_migrations record.
    ruleset_version          TEXT NOT NULL,
    rubric_version           TEXT NOT NULL,
    payout_ruleset_version   TEXT NOT NULL,

    state                    TEXT NOT NULL DEFAULT 'DRAFT',

    opens_at_utc_ms          BIGINT,
    closes_at_utc_ms         BIGINT,

    created_at_utc_ms        BIGINT NOT NULL,

    CONSTRAINT challenges_state_enum
        CHECK (state IN ('DRAFT', 'OPEN', 'CLOSED'))
);

CREATE INDEX challenges_state_idx ON challenges(state);

-- Post-open mutation guard.
-- Any UPDATE that changes any of the three version columns while the challenge
-- is NOT in DRAFT state is rejected. The only legitimate way to change a
-- version post-open is through the challenge_migrations table (migration 007).
--
-- Rationale: Claim 11 defines the migration record as the one-and-only
-- mechanism for mid-challenge ruleset changes. A direct UPDATE would bypass
-- the audit trail and break replay.
CREATE OR REPLACE FUNCTION challenges_block_post_open_version_update()
    RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state = 'DRAFT' THEN
        RETURN NEW;
    END IF;
    IF NEW.ruleset_version IS DISTINCT FROM OLD.ruleset_version OR
       NEW.rubric_version IS DISTINCT FROM OLD.rubric_version OR
       NEW.payout_ruleset_version IS DISTINCT FROM OLD.payout_ruleset_version THEN
        RAISE EXCEPTION
            'direct UPDATE of version columns blocked post-open (Claim 11); use /v1/challenges/%/migrations',
            OLD.challenge_id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER challenges_version_guard_trg
    BEFORE UPDATE ON challenges
    FOR EACH ROW
    EXECUTE FUNCTION challenges_block_post_open_version_update();

COMMIT;
