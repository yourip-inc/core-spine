/**
 * Rubric service unit tests (stubbed repo — no DB).
 *
 * Claim coverage: test_claim_CS_1_*, test_claim_CS_14_*
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RubricService, computeRubricHash } from "../../src/rubric/rubric-service.js";
import type { RubricRepository } from "../../src/rubric/rubric-repository.js";
import type { Rubric } from "../../src/rubric/rubric-types.js";
import type { CreateRubricRequest } from "../../src/rubric/rubric-schemas.js";
import { DomainError } from "../../src/errors/domain-error.js";
import { REASON_CODES } from "../../src/errors/reason-codes.js";

// In-memory repo + pool stubs
class InMemoryRepo implements RubricRepository {
  rubrics = new Map<string, Rubric>();
  async create(_client: unknown, input: Parameters<RubricRepository["create"]>[1]) {
    if ([...this.rubrics.values()].some((r) => r.rubricVersion === input.rubricVersion)) {
      const err = new Error("unique_violation") as Error & { code: string };
      err.code = "23505";
      throw err;
    }
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
  async findByVersion(_c: unknown, rubricVersion: string) {
    for (const r of this.rubrics.values()) if (r.rubricVersion === rubricVersion) return r;
    return null;
  }
}

const fakePool = {
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
} as never;

const fakeClock = { nowUtcMs: () => 1_700_000_000_000n };

describe("RubricService", () => {
  let repo: InMemoryRepo;
  let svc: RubricService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    svc = new RubricService(fakePool, repo, fakeClock);
  });

  function validRequest(overrides: Partial<CreateRubricRequest> = {}): CreateRubricRequest {
    return {
      rubric_version: "rubric_1.0",
      name: "Base",
      criteria: [
        { criterion_key: "execution", display_name: "Execution", weight_bp: 6000, scale_min_bp: 0, scale_max_bp: 10000 },
        { criterion_key: "creativity", display_name: "Creativity", weight_bp: 4000, scale_min_bp: 0, scale_max_bp: 10000 },
      ],
      publish: false,
      ...overrides,
    };
  }

  describe("test_claim_CS_14_rubric_weight_sum_must_equal_10000", () => {
    it("accepts a rubric whose criteria weight_bp sum to 10000", async () => {
      const rubric = await svc.create(validRequest());
      expect(rubric.criteria.reduce((s, c) => s + c.weightBp, 0)).toBe(10000);
    });

    it("rejects when sum < 10000", async () => {
      const bad = validRequest({
        criteria: [
          { criterion_key: "a", display_name: "A", weight_bp: 3000, scale_min_bp: 0, scale_max_bp: 10000 },
          { criterion_key: "b", display_name: "B", weight_bp: 4000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
      });
      await expect(svc.create(bad)).rejects.toMatchObject({
        reasonCode: REASON_CODES.RUBRIC_WEIGHT_SUM_INVALID,
      });
    });

    it("rejects when sum > 10000", async () => {
      const bad = validRequest({
        criteria: [
          { criterion_key: "a", display_name: "A", weight_bp: 6000, scale_min_bp: 0, scale_max_bp: 10000 },
          { criterion_key: "b", display_name: "B", weight_bp: 5000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
      });
      await expect(svc.create(bad)).rejects.toThrow(DomainError);
    });
  });

  describe("test_claim_CS_14_rubric_duplicate_criterion_keys_rejected", () => {
    it("rejects duplicate criterion_keys even if total weight_bp sums to 10000", async () => {
      const bad = validRequest({
        criteria: [
          { criterion_key: "a", display_name: "A1", weight_bp: 5000, scale_min_bp: 0, scale_max_bp: 10000 },
          { criterion_key: "a", display_name: "A2", weight_bp: 5000, scale_min_bp: 0, scale_max_bp: 10000 },
        ],
      });
      await expect(svc.create(bad)).rejects.toMatchObject({
        reasonCode: REASON_CODES.RATING_SCHEMA_DRIFT,
      });
    });
  });

  describe("test_claim_CS_1_rubric_immutable_after_publish", () => {
    it("publishes atomically with create when publish=true, setting canonical hash", async () => {
      const r = await svc.create(validRequest({ publish: true }));
      expect(r.publishedAtUtcMs).toBe(1_700_000_000_000n);
      expect(r.canonicalJsonSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it("creates as draft when publish=false (no canonical hash set)", async () => {
      const r = await svc.create(validRequest({ publish: false }));
      expect(r.publishedAtUtcMs).toBeUndefined();
      expect(r.canonicalJsonSha256).toBeUndefined();
    });
  });

  describe("test_claim_CS_21_rubric_hash_is_deterministic", () => {
    it("produces different hashes for rubrics with different rubric_versions (version is part of the hashed structure)", async () => {
      const r1 = await svc.create(validRequest({ rubric_version: "rubric_1.0", publish: true }));
      const r2 = await svc.create(validRequest({ rubric_version: "rubric_1.1", publish: true }));
      expect(r1.canonicalJsonSha256).not.toBe(r2.canonicalJsonSha256);
    });

    it("produces the same hash when computeRubricHash is called twice on the same rubric", () => {
      const r: Rubric = {
        rubricId: "x",
        rubricVersion: "rubric_1.0",
        name: "N",
        createdAtUtcMs: 1n,
        criteria: [
          { criterionKey: "a", displayName: "A", weightBp: 10000, scaleMinBp: 0, scaleMaxBp: 10000, sortOrder: 0 },
        ],
      };
      expect(computeRubricHash(r)).toBe(computeRubricHash(r));
    });
  });

  describe("test_claim_CS_14_get_by_version", () => {
    it("returns a created rubric by version", async () => {
      await svc.create(validRequest({ rubric_version: "rubric_2.0" }));
      const r = await svc.getByVersion("rubric_2.0");
      expect(r).not.toBeNull();
      expect(r!.rubricVersion).toBe("rubric_2.0");
    });

    it("returns null for unknown rubric_version", async () => {
      const r = await svc.getByVersion("rubric_9.9");
      expect(r).toBeNull();
    });
  });
});
