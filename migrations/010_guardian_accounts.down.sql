-- Rollback for 010_guardian_accounts.sql

BEGIN;

DROP INDEX IF EXISTS guardian_accounts_verification_state_idx;
DROP INDEX IF EXISTS guardian_accounts_contact_email_uniq;
DROP TABLE IF EXISTS guardian_accounts;

DELETE FROM schema_migrations WHERE filename = '010_guardian_accounts.sql';

COMMIT;
