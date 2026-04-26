-- Rollback for 005_rater_event_weights.sql
-- Story: T1-S1-C-01

BEGIN;

DROP INDEX IF EXISTS rater_event_weights_scoring_version_idx;
DROP INDEX IF EXISTS rater_event_weights_rater_idx;
DROP TABLE IF EXISTS rater_event_weights;
DELETE FROM schema_migrations WHERE filename = '005_rater_event_weights.sql';

COMMIT;
