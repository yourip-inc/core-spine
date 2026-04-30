-- migrations/011_guardian_accounts_email_lower_index.down.sql
-- Reverses 011: restores case-sensitive unique index from migration 010.
-- Note: this rollback does NOT un-lowercase data that was canonicalized
-- by 011's UPDATE. Casing of original input is unrecoverable once
-- canonicalized. This is acceptable: rollback is for emergency, and
-- the non-canonicalized form was demonstrably wrong.

BEGIN;

DROP INDEX guardian_accounts_contact_email_uniq;

CREATE UNIQUE INDEX guardian_accounts_contact_email_uniq
    ON guardian_accounts(contact_email);

DELETE FROM schema_migrations
 WHERE filename = '011_guardian_accounts_email_lower_index.sql';

COMMIT;
