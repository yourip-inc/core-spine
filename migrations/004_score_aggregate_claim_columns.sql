-- Migration: 004_score_aggregate_claim_columns.sql
-- Story: T1-S1-B-01
-- Claims: 1 (integrated score aggregate), 3 (effective vote mass storage), 14 (stability)
--
-- Adds two claim-critical columns to score_aggregates:
--   - effective_vote_mass NUMERIC(14,4) NOT NULL DEFAULT 0  — storage half of Claim 3
--   - stability_score     INTEGER       NOT NULL DEFAULT 0  — Claim 14 stability ranking input
--
-- Existing rows backfill to 0 via the DEFAULT; the subsequent ALTER adds
-- NOT NULL once defaults have materialized.
--
-- Rollback: see 004_score_aggregate_claim_columns.down.sql. To reverse:
--   psql -f migrations/004_score_aggregate_claim_columns.down.sql

BEGIN;

ALTER TABLE score_aggregates
    ADD COLUMN effective_vote_mass NUMERIC(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN stability_score     INTEGER       NOT NULL DEFAULT 0;

ALTER TABLE score_aggregates
    ADD CONSTRAINT effective_vote_mass_nonneg CHECK (effective_vote_mass >= 0),
    ADD CONSTRAINT stability_score_range      CHECK (stability_score BETWEEN 0 AND 10000);

COMMIT;
