-- Rollback for 009_videographer_enum.sql
-- Story: T1-S1-E-01 AC: "Rollback restores FILMER as canonical"
--
-- IMPORTANT LIMITATION: Postgres does NOT support removing a value from an
-- enum type. "DROP VALUE" is not a valid ALTER TYPE clause as of PG 16.
-- What this rollback CAN do is:
--   - Revert all rows using VIDEOGRAPHER back to FILMER.
-- What it CANNOT do:
--   - Remove VIDEOGRAPHER from the enum definition itself.
--   - Drop the submission_contributors / submissions tables (they may have
--     been referenced by other migrations by the time rollback runs).
--
-- A full rollback that removes VIDEOGRAPHER from the enum requires:
--   1. Create a new enum contributor_role_v2 with only FILMER.
--   2. ALTER TABLE ... ALTER COLUMN ... TYPE contributor_role_v2 USING ...
--      on every column using the old type.
--   3. DROP TYPE contributor_role; ALTER TYPE contributor_role_v2 RENAME TO contributor_role;
--
-- That's invasive and not reversible-safe, so we keep this rollback narrow.
-- If a true rollback is required, run the above sequence manually as a
-- separate migration.

BEGIN;

UPDATE submission_contributors
   SET role = 'FILMER'
 WHERE role = 'VIDEOGRAPHER';

UPDATE submissions
   SET submitter_role = 'FILMER'
 WHERE submitter_role = 'VIDEOGRAPHER';

DELETE FROM schema_migrations WHERE filename = '009_videographer_enum.sql';

COMMIT;
