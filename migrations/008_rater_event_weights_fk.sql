-- Migration: 008_rater_event_weights_fk.sql
-- Closes the TODO left by migration 005 once the `challenges` table landed in 006.
-- Adds the FOREIGN KEY on rater_event_weights.challenge_id → challenges.challenge_id
-- with ON DELETE CASCADE, satisfying the T1-S1-C-01 AC: "Foreign key on
-- challenge_id with cascade delete".

BEGIN;

ALTER TABLE rater_event_weights
    ADD CONSTRAINT rater_event_weights_challenge_fk
        FOREIGN KEY (challenge_id)
        REFERENCES challenges(challenge_id)
        ON DELETE CASCADE;

COMMIT;
