-- Rollback for 007_challenge_migrations_reconstruction.sql
-- Story: T1-S1-D-01 AC: "Rollback migration restores legacy structure"

BEGIN;

DROP FUNCTION IF EXISTS verify_migration_checksum(UUID);
DROP FUNCTION IF EXISTS compute_migration_checksum(UUID, TEXT, TEXT, TEXT, UUID, BIGINT, JSONB);

DROP INDEX IF EXISTS challenge_migrations_challenge_effective_idx;
DROP TABLE IF EXISTS challenge_migrations;

-- Restore legacy structure if we had preserved it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema()
           AND table_name = 'challenge_migrations_legacy'
    ) THEN
        CREATE TABLE challenge_migrations (LIKE challenge_migrations_legacy INCLUDING ALL);
        INSERT INTO challenge_migrations SELECT * FROM challenge_migrations_legacy;
        DROP TABLE challenge_migrations_legacy;
    END IF;
END$$;

DELETE FROM schema_migrations WHERE filename = '007_challenge_migrations_reconstruction.sql';

COMMIT;
