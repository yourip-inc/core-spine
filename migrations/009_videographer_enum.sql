-- Migration: 009_videographer_enum.sql
-- Story: T1-S1-E-01
-- Claims: 10 (role-aware contributor splits / contributor_role vocabulary)
--
-- Greenfield note:
--   The AC was written for an existing codebase that already had a
--   contributor_role enum with FILMER and submission_contributors /
--   submissions tables. This greenfield repo has none of those yet. We:
--     1. CREATE the enum with FILMER + VIDEOGRAPHER on first run, or
--        ADD VIDEOGRAPHER to an existing enum.
--     2. CREATE minimal submission_contributors and submissions tables
--        if they don't exist (so E-03 alias normalization has something
--        to persist to). These are intentionally minimal — full Submission
--        Registry lands in a later sprint per API Contract §3.
--     3. Backfill any existing FILMER rows to VIDEOGRAPHER (no-op on
--        greenfield).
--     4. FILMER is retained in the enum as deprecated.

BEGIN;

-- Step 1 — enum type with canonical roles + deprecated FILMER. Idempotent.
--
-- Canonical roles (per src/submission/contributor-role.ts CONTRIBUTOR_ROLES):
--   VIDEOGRAPHER, EDITOR, PERFORMER, RIGHTSHOLDER
-- Deprecated alias retained for one release cycle: FILMER
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contributor_role') THEN
        CREATE TYPE contributor_role AS ENUM (
            'VIDEOGRAPHER', 'EDITOR', 'PERFORMER', 'RIGHTSHOLDER', 'FILMER'
        );
    ELSE
        -- Enum already exists (reapplying, or legacy). Add any missing values.
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'contributor_role' AND e.enumlabel = 'VIDEOGRAPHER') THEN
            ALTER TYPE contributor_role ADD VALUE 'VIDEOGRAPHER';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'contributor_role' AND e.enumlabel = 'EDITOR') THEN
            ALTER TYPE contributor_role ADD VALUE 'EDITOR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'contributor_role' AND e.enumlabel = 'PERFORMER') THEN
            ALTER TYPE contributor_role ADD VALUE 'PERFORMER';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'contributor_role' AND e.enumlabel = 'RIGHTSHOLDER') THEN
            ALTER TYPE contributor_role ADD VALUE 'RIGHTSHOLDER';
        END IF;
    END IF;
END$$;

-- ALTER TYPE ... ADD VALUE cannot be used inside a transaction that also
-- uses the new value, on pre-12 Postgres. On 12+ it's fine. We split any
-- downstream usage into a separate statement block via this commit +
-- begin to be safe across versions.
COMMIT;
BEGIN;

-- Step 2 — create the minimal submission tables if absent. These are stubs
-- for WS-1E; the full Submission Registry (Claims 1, 14, per REQ-T1-F-06..08)
-- ships later.
CREATE TABLE IF NOT EXISTS submissions (
    submission_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id        UUID NOT NULL REFERENCES challenges(challenge_id) ON DELETE RESTRICT,
    submitter_role      contributor_role NOT NULL DEFAULT 'VIDEOGRAPHER',
    submitted_at_utc_ms BIGINT NOT NULL
    -- Full shape lands later; this is enough for E-03.
);

CREATE TABLE IF NOT EXISTS submission_contributors (
    contributor_row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id      UUID NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    contributor_id     UUID NOT NULL,
    role               contributor_role NOT NULL,
    UNIQUE (submission_id, contributor_id, role)
);

CREATE INDEX IF NOT EXISTS submissions_challenge_idx
    ON submissions(challenge_id);
CREATE INDEX IF NOT EXISTS submission_contributors_submission_idx
    ON submission_contributors(submission_id);

-- Step 3 — backfill FILMER → VIDEOGRAPHER. No-op on greenfield (table just created).
UPDATE submissions
   SET submitter_role = 'VIDEOGRAPHER'
 WHERE submitter_role = 'FILMER';

UPDATE submission_contributors
   SET role = 'VIDEOGRAPHER'
 WHERE role = 'FILMER';

COMMIT;
