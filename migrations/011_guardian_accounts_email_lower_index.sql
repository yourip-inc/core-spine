-- migrations/011_guardian_accounts_email_lower_index.sql
-- T2-S1-A-01 follow-up — Address Code Review 🔴 finding on PR #4.
--
-- The original migration 010 declared the unique index on the raw
-- contact_email TEXT column, which permits a single human to register
-- multiple guardian roots by varying email casing. This breaks claim
-- 14's "one canonical guardian per subordinate minor profile"
-- premise, and would silently bypass the planned 409
-- GUARDIAN_DUPLICATE_CONTACT path.
--
-- Fix: drop the case-sensitive unique index and recreate it on
-- LOWER(contact_email). Application layer (Zod schema) is updated
-- in parallel to canonicalize input to lowercase before persist.
--
-- Story: T2-S1-A-01 (Code Review follow-up)
-- Patent claim: 14
--
-- OPERATOR NOTE — Recovery from collision failure:
--   This migration assumes no two existing rows have emails that
--   differ only in case (e.g., 'Parent@example.com' vs
--   'parent@example.com'). If such rows exist, the UPDATE below
--   will lowercase them to byte-identical values, which violates
--   the still-active case-sensitive unique index from migration
--   010. The transaction will rollback atomically.
--
--   To recover, an operator must:
--     1. Identify collision groups:
--          SELECT contact_email, COUNT(*)
--            FROM guardian_accounts
--           GROUP BY LOWER(contact_email)
--          HAVING COUNT(*) > 1;
--     2. Resolve each collision (typically by deleting the row
--        with the later created_at_utc_ms, preserving the earliest
--        registration).
--     3. Re-run this migration.
--
--   This scenario is unreachable in environments that apply 010
--   and 011 together (this PR's chunked landing). It is reachable
--   only in environments where 010 was applied earlier with mixed-
--   case test data inserted before 011 landed.

BEGIN;

-- Canonicalize any existing data. Safe & idempotent if no rows exist
-- (which is the expected state at this branch's local-dev maturity).
UPDATE guardian_accounts SET contact_email = LOWER(contact_email);

DROP INDEX guardian_accounts_contact_email_uniq;

CREATE UNIQUE INDEX guardian_accounts_contact_email_uniq
    ON guardian_accounts(LOWER(contact_email));

COMMIT;
