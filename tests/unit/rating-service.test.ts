/**
 * Rating Service unit tests.
 *
 * Story T1-S1-A-05: Rating Service validates criteria_scores_bp keys against locked rubric.
 * Claim coverage: test_claim_CS_1_*, test_claim_CS_14_*
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RatingService } from "../../src/rating/rating-service.js";
import { RubricService } from "../../src/rubric/rubric-service.js";
import type { RubricRepository } from "../../src/rubric/rubric-repository.js";
import type { Rubric } from "../../src/rubric/rubric-types.js";
import { REASON_CODES } from "../../src/errors/reason-codes.js";

class InMemoryRepo implements RubricRepository {
  rubrics = new Map<string, Rubric>();
  async create(_c: unknown, input: Parameters<RubricRepository["create"]>[1]) {
    const id = `rid-${this.rubrics.size}`;
    this.rubrics.set(id, {
      rubricId: id,
      rubricVersion: input.rubricVersion,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAtUtcMs: input.createdAtUtcMs,
      criteria: input.criteria.map((c, i) => ({
        criterionKey: c.criterionKey,
        displayName: c.displayName,
        weightBp: c.weightBp,
        scaleMinBp: c.scaleMinBp,
        scaleMaxBp: c.scaleMaxBp,
        sortOrder: c.sortOrder ?? i,
      })),
    });
    return { rubricId: id };
  }
  async markPublished(_c: unknown, rubricId: string, params: { publishedAtUtcMs: bigint; canonicalJsonSha256: string }) {
    const r = this.rubrics.get(rubricId);
    if (r) {
      r.publishedAtUtcMs = params.publishedAtUtcMs;
      r.canonicalJsonSha256 = params.canonicalJsonSha256;
    }
  }
  async findByVersion(_c: unknown, v: string) {
    for (const r of this.rubrics.values()) if (r.rubricVersion === v) return r;
    return null;
  }
}

const fakePool = { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) } as never;
const fakeClock = { nowUtcMs: () => 1_700_000_000_000n };

async function seedPublishedRubric(rubricSvc: RubricService) {
  return rubricSvc.create({
    rubric_version: "rubric_1.0",
    name: "Base",
    criteria: [
      { criterion_key: "execution", display_name: "Execution", weight_bp: 6000, scale_min_bp: 0, scale_max_bp: 10000 },
      { criterion_key: "creativity", display_name: "Creativity", weight_bp: 4000, scale_min_bp: 0, scale_max_bp: 10000 },
    ],
    publish: true,
  });
}

describe("RatingService.validateCriteriaScoresBp", () => {
  let rubricSvc: RubricService;
  let ratingSvc: RatingService;

  beforeEach(async () => {
    const repo = new InMemoryRepo();
    rubricSvc = new RubricService(fakePool, repo, fakeClock);
    ratingSvc = new RatingService(rubricSvc);
    await seedPublishedRubric(rubricSvc);
  });

  describe("test_claim_CS_1_rating_schema_aligned_with_rubric", () => {
    it("accepts a rating whose keys exactly match the rubric's criterion_keys", async () => {
      const res = await ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
        execution: 8000,
        creativity: 5000,
      });
      expect(res.ok).toBe(true);
      expect(res.matchedCriterionCount).toBe(2);
    });

    it("accepts boundary values at scale_min_bp and scale_max_bp", async () => {
      const res = await ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
        execution: 0,
        creativity: 10000,
      });
      expect(res.ok).toBe(true);
    });
  });

  describe("test_claim_CS_1_rating_unknown_key_rejected", () => {
    it("rejects keys not present in the rubric", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
          execution: 5000,
          creativity: 5000,
          imagination: 5000, // unknown
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_CRITERION_UNKNOWN });
    });
  });

  describe("test_claim_CS_1_rating_missing_key_rejected", () => {
    it("rejects payloads missing required criterion_keys", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
          execution: 8000, // creativity missing
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_CRITERION_MISSING });
    });
  });

  describe("test_claim_CS_14_rating_value_must_be_integer_in_range", () => {
    it("rejects float values (canonical JSON integer-only rule)", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
          execution: 8000.5 as number,
          creativity: 5000,
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RATING_SCHEMA_DRIFT });
    });

    it("rejects values below scale_min_bp", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
          execution: -1,
          creativity: 5000,
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RATING_SCHEMA_DRIFT });
    });

    it("rejects values above scale_max_bp", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_1.0", {
          execution: 10001,
          creativity: 5000,
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RATING_SCHEMA_DRIFT });
    });
  });

  describe("test_claim_CS_1_rating_references_unpublished_rubric_rejected", () => {
    it("rejects when rubric_version is unknown", async () => {
      await expect(
        ratingSvc.validateCriteriaScoresBp("rubric_9.9", {
          execution: 5000,
          creativity: 5000,
        }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_VERSION_MISMATCH });
    });

    it("rejects when rubric is draft (not published)", async () => {
      const freshRepo = new InMemoryRepo();
      const freshRubricSvc = new RubricService(fakePool, freshRepo, fakeClock);
      const freshRating = new RatingService(freshRubricSvc);
      await freshRubricSvc.create({
        rubric_version: "rubric_draft.1",
        name: "Draft",
        criteria: [
          { criterion_key: "x", display_name: "X", weight_bp: 10000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
        publish: false,
      });
      await expect(
        freshRating.validateCriteriaScoresBp("rubric_draft.1", { x: 5000 }),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_VERSION_MISMATCH });
    });
  });
});
