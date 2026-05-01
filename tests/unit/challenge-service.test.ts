/**
 * Challenge Service unit tests.
 *
 * Story T1-S1-A-04: Challenge Service rejects lock when rubric_version unresolvable.
 * Claim coverage: test_claim_CS_1_*, test_claim_CS_14_*
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ChallengeService } from "../../src/challenge/challenge-service.js";
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

describe("ChallengeService.resolveLockableRubric", () => {
  let rubricSvc: RubricService;
  let challengeSvc: ChallengeService;

  beforeEach(() => {
    const repo = new InMemoryRepo();
    rubricSvc = new RubricService(fakePool, repo, fakeClock);
    challengeSvc = new ChallengeService(rubricSvc);
  });

  describe("test_claim_CS_1_lock_rejects_unknown_rubric_version", () => {
    it("rejects lock when rubric_version does not exist", async () => {
      await expect(
        challengeSvc.resolveLockableRubric("rubric_9.9", 1_700_000_100_000n),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE });
    });
  });

  describe("test_claim_CS_1_lock_rejects_draft_rubric", () => {
    it("rejects lock when rubric exists but is still draft (not published)", async () => {
      await rubricSvc.create({
        rubric_version: "rubric_draft.1",
        name: "Draft",
        criteria: [
          { criterion_key: "x", display_name: "X", weight_bp: 10000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
        publish: false,
      });
      await expect(
        challengeSvc.resolveLockableRubric("rubric_draft.1", 1_700_000_100_000n),
      ).rejects.toMatchObject({ reasonCode: REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE });
    });
  });

  describe("test_claim_CS_1_lock_succeeds_on_published_rubric", () => {
    it("returns the locked rubric hash on a published rubric", async () => {
      await rubricSvc.create({
        rubric_version: "rubric_1.0",
        name: "Base",
        criteria: [
          { criterion_key: "execution", display_name: "Execution", weight_bp: 6000, scale_min_bp: 0, scale_max_bp: 10000 },
          { criterion_key: "creativity", display_name: "Creativity", weight_bp: 4000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
        publish: true,
      });
      const r = await challengeSvc.resolveLockableRubric("rubric_1.0", 1_700_000_100_000n);
      expect(r.rubricVersion).toBe("rubric_1.0");
      expect(r.rubricCanonicalJsonSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.lockedAtUtcMs).toBe(1_700_000_100_000n);
    });
  });
});
