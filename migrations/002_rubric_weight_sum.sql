-- Migration: 002_rubric_weight_sum.sql
-- Story: T1-S1-A-02 (Enforce rubric weight sum equals 10000)
-- Claims: 1, 14, 21
--
-- The weight-sum constraint is enforced at TWO layers:
--   1. Application layer (RubricService.create) — rejects bad input early with a
--      clean 400 response and reason code RUBRIC_WEIGHT_SUM_INVALID.
--   2. This DB-level trigger — a deferred backstop so that even a misbehaving
--      direct DB write (operator console, migration script, ORM lapse) cannot
--      produce a published rubric with a weight sum != 10000.
--
-- The trigger fires at TRANSACTION COMMIT (DEFERRABLE INITIALLY DEFERRED), so
-- a transaction can INSERT criteria one row at a time and they only have to sum
-- correctly at the end. This is how the application layer inserts criteria.

BEGIN;

CREATE OR REPLACE FUNCTION rubric_weight_sum_equals_10000()
    RETURNS TRIGGER AS $$
DECLARE
    total INTEGER;
    rid   UUID;
BEGIN
    rid := COALESCE(NEW.rubric_id, OLD.rubric_id);
    SELECT COALESCE(SUM(weight_bp), 0) INTO total
        FROM rubric_criteria WHERE rubric_id = rid;

    IF total <> 10000 THEN
        RAISE EXCEPTION
            'rubric weight_bp sum for rubric_id=% is %, must be 10000 (REQ-T1-F-A-02)',
            rid, total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER rubric_weight_sum_trg
    AFTER INSERT OR UPDATE OR DELETE ON rubric_criteria
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION rubric_weight_sum_equals_10000();

COMMIT;
