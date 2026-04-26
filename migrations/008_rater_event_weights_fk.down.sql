-- Rollback for 008_rater_event_weights_fk.sql

BEGIN;

ALTER TABLE rater_event_weights
    DROP CONSTRAINT IF EXISTS rater_event_weights_challenge_fk;

DELETE FROM schema_migrations WHERE filename = '008_rater_event_weights_fk.sql';

COMMIT;
