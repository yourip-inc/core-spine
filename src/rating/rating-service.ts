/**
 * Rating Service — MINIMAL WS-1A scaffold.
 *
 * Story T1-S1-A-05: Rating Service validates criteria_scores_bp keys against locked rubric.
 * Claims: CS-1, CS-14.
 *
 * Scope limits:
 *   - Full Rating Service (signed rating events, 8-step validation pipeline, quarantine)
 *     is WS-1B/1C/1E work. This file implements ONLY the schema-alignment check from A-05.
 *   - The 8-step pipeline (API Contract Flag 1) is deferred to WS-1B where hash + signature
 *     enter scope. When that lands, this function becomes one step of it.
 *
 * PATENT-CRITICAL: the reason codes emitted here (RUBRIC_CRITERION_UNKNOWN,
 * RUBRIC_CRITERION_MISSING, RATING_SCHEMA_DRIFT) are part of the locked
 * reason-code catalog — they can be added to but never renamed.
 */

import { RubricService } from "../rubric/rubric-service.js";
import { badRequest } from "../errors/domain-error.js";
import { REASON_CODES } from "../errors/reason-codes.js";

export interface RatingCriteriaCheckResult {
  ok: true;
  matchedCriterionCount: number;
}

export class RatingService {
  constructor(private readonly rubrics: RubricService) {}

  /**
   * Validate that a criteria_scores_bp map matches the locked rubric's criteria exactly.
   *   - Every key must be a known criterion_key in the rubric.
   *   - Every criterion_key in the rubric must be present in the map.
   *   - Every value must be an integer in [criterion.scale_min_bp, criterion.scale_max_bp].
   *
   * This is step 3 of the eventual 8-step validation pipeline (schema alignment). It runs
   * AFTER canonical-JSON parsing and BEFORE hash recomputation / signature verification.
   */
  async validateCriteriaScoresBp(
    rubricVersion: string,
    criteriaScoresBp: Record<string, number>,
  ): Promise<RatingCriteriaCheckResult> {
    const rubric = await this.rubrics.getByVersion(rubricVersion);
    if (!rubric || rubric.publishedAtUtcMs === undefined) {
      throw badRequest(
        REASON_CODES.RUBRIC_VERSION_MISMATCH,
        `rating event references unknown or unpublished rubric_version: ${rubricVersion}`,
        { rubric_version: rubricVersion },
      );
    }

    const expected = new Map<string, { min: number; max: number }>();
    for (const c of rubric.criteria) {
      expected.set(c.criterionKey, { min: c.scaleMinBp, max: c.scaleMaxBp });
    }

    // Unknown keys
    const unknownKeys: string[] = [];
    for (const k of Object.keys(criteriaScoresBp)) {
      if (!expected.has(k)) unknownKeys.push(k);
    }
    if (unknownKeys.length > 0) {
      throw badRequest(
        REASON_CODES.RUBRIC_CRITERION_UNKNOWN,
        `rating event references criterion_keys not in rubric ${rubricVersion}: ${unknownKeys.join(", ")}`,
        { unknown_keys: unknownKeys, rubric_version: rubricVersion },
      );
    }

    // Missing keys
    const missingKeys: string[] = [];
    for (const k of expected.keys()) {
      if (!(k in criteriaScoresBp)) missingKeys.push(k);
    }
    if (missingKeys.length > 0) {
      throw badRequest(
        REASON_CODES.RUBRIC_CRITERION_MISSING,
        `rating event missing criterion_keys required by rubric ${rubricVersion}: ${missingKeys.join(", ")}`,
        { missing_keys: missingKeys, rubric_version: rubricVersion },
      );
    }

    // Value validation: integers in range
    for (const [k, v] of Object.entries(criteriaScoresBp)) {
      const range = expected.get(k)!;
      if (!Number.isInteger(v)) {
        throw badRequest(
          REASON_CODES.RATING_SCHEMA_DRIFT,
          `criterion ${k}: value must be an integer, got ${v}`,
          { criterion_key: k, value: v },
        );
      }
      if (v < range.min || v > range.max) {
        throw badRequest(
          REASON_CODES.RATING_SCHEMA_DRIFT,
          `criterion ${k}: value ${v} out of range [${range.min}, ${range.max}]`,
          { criterion_key: k, value: v, min: range.min, max: range.max },
        );
      }
    }

    return { ok: true, matchedCriterionCount: rubric.criteria.length };
  }
}
