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

BEGIN;

-- Canonicalize any existing data. Safe & idempotent if no rows exist
-- (which is the expected state at this branch's local-dev maturity).
UPDATE guardian_accounts SET contact_email = LOWER(contact_email);

DROP INDEX guardian_accounts_contact_email_uniq;

CREATE UNIQUE INDEX guardian_accounts_contact_email_uniq
    ON guardian_accounts(LOWER(contact_email));

COMMIT;
