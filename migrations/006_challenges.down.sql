-- Rollback for 006_challenges.sql

BEGIN;

DROP TRIGGER IF EXISTS challenges_version_guard_trg ON challenges;
DROP FUNCTION IF EXISTS challenges_block_post_open_version_update();
DROP INDEX IF EXISTS challenges_state_idx;
DROP TABLE IF EXISTS challenges;

DELETE FROM schema_migrations WHERE filename = '006_challenges.sql';

COMMIT;
