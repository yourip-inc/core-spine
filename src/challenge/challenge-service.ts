/**
 * Challenge Service — MINIMAL WS-1A scaffold.
 *
 * Story T1-S1-A-04: Challenge Service rejects lock when rubric_version unresolvable.
 *
 * This file intentionally implements only the rubric-lock contract path needed for
 * WS-1A acceptance. Full Challenge Service (version pinning, migration records,
 * full challenge lifecycle) is WS-1D and beyond. Do not expand this file without
 * a corresponding PRD reference.
 */

import { RubricService } from "../rubric/rubric-service.js";
import { badRequest } from "../errors/domain-error.js";
import { REASON_CODES } from "../errors/reason-codes.js";

export interface LockRubricResult {
  rubricVersion: string;
  rubricCanonicalJsonSha256: string;
  lockedAtUtcMs: bigint;
}

export class ChallengeService {
  constructor(private readonly rubrics: RubricService) {}

  /**
   * Resolve + validate a rubric_version for locking against a challenge.
   * Returns the canonical hash that a caller can persist as part of its
   * own challenge record.
   *
   * Rejects with RUBRIC_VERSION_UNRESOLVABLE if the version doesn't exist
   * or has not been published.
   */
  async resolveLockableRubric(rubricVersion: string, nowUtcMs: bigint): Promise<LockRubricResult> {
    const r = await this.rubrics.getByVersion(rubricVersion);
    if (!r) {
      throw badRequest(
        REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE,
        `cannot lock challenge: rubric_version does not exist: ${rubricVersion}`,
        { rubric_version: rubricVersion },
      );
    }
    if (r.publishedAtUtcMs === undefined || r.canonicalJsonSha256 === undefined) {
      throw badRequest(
        REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE,
        `cannot lock challenge: rubric_version is draft (not published): ${rubricVersion}`,
        { rubric_version: rubricVersion, state: "draft" },
      );
    }
    return {
      rubricVersion: r.rubricVersion,
      rubricCanonicalJsonSha256: r.canonicalJsonSha256,
      lockedAtUtcMs: nowUtcMs,
    };
  }
}
