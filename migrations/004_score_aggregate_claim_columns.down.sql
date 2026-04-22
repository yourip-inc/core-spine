-- Rollback for 004_score_aggregate_claim_columns.sql
-- Story: T1-S1-B-01
--
-- This file is NOT auto-applied by src/db/migrate.ts. Operators run it
-- manually if the 004 migration must be reversed. The schema_migrations
-- bookkeeping row for 004_score_aggregate_claim_columns.sql must also be
-- deleted so the forward migration re-applies cleanly on next run.

BEGIN;

ALTER TABLE score_aggregates
    DROP CONSTRAINT IF EXISTS effective_vote_mass_nonneg,
    DROP CONSTRAINT IF EXISTS stability_score_range,
    DROP COLUMN IF EXISTS effective_vote_mass,
    DROP COLUMN IF EXISTS stability_score;

DELETE FROM schema_migrations WHERE filename = '004_score_aggregate_claim_columns.sql';

COMMIT;
