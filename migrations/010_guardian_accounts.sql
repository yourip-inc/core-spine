-- migrations/010_guardian_accounts.sql
-- T2-S1-A-01 — Guardian Root storage. Patent claim 14 anchor.
--
-- Subordinate minor profiles cannot exist independently of a verified
-- guardian account (claim 14: "...wherein each subordinate minor
-- profile is linked to a verified guardian account and cannot exist
-- independently of the verified guardian account..."). This migration
-- ships the *storage* for guardian roots; verification-state transitions
-- land in A-03, and the profile-creation gate that consumes
-- guardian_verification_state lands in A-04.
--
-- Story: T2-S1-A-01 — Create GuardianAccount table and POST /v1/grom/guardians

BEGIN;

CREATE TABLE guardian_accounts (
    guardian_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_email                  TEXT NOT NULL,
    contact_phone_hash             TEXT,
    guardian_verification_state    TEXT NOT NULL DEFAULT 'UNVERIFIED',
    created_at_utc_ms              BIGINT NOT NULL,
    updated_at_utc_ms              BIGINT NOT NULL,

    CONSTRAINT guardian_accounts_verification_state_enum
        CHECK (guardian_verification_state IN
            ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED'))
);

CREATE UNIQUE INDEX guardian_accounts_contact_email_uniq
    ON guardian_accounts(contact_email);

CREATE INDEX guardian_accounts_verification_state_idx
    ON guardian_accounts(guardian_verification_state);

COMMIT;
