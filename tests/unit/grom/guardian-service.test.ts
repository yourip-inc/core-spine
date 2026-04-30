/**
 * Guardian service unit tests (stubbed repo — no DB).
 *
 * Story: T2-S1-A-01.
 * Claim: 14 (guardian-rooted account architecture).
 *
 * Mirrors tests/unit/rubric-service.test.ts: in-memory repo,
 * fake pool, fake clock, no real database. Tests the create
 * surface only; verification-state transitions land in
 * A-02/A-03 and have their own future tests.
 *
 * NOTE: The duplicate-contact_email path is gated on PCO-
 * approved reason code naming. Its test lands in a follow-up
 * commit on this branch after the next PCO sync.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GuardianService } from "../../../src/grom/guardian-service.js";
import type { GuardianRepository } from "../../../src/grom/guardian-repository.js";
import type { GuardianAccount, NewGuardianInput } from "../../../src/grom/guardian-types.js";
import { type CreateGuardianRequest, CreateGuardianSchema } from "../../../src/grom/guardian-schemas.js";

// In-memory repo + pool stubs (matches rubric-service test pattern).
class InMemoryRepo implements GuardianRepository {
  guardians = new Map<string, GuardianAccount>();

  async create(_client: unknown, input: NewGuardianInput & { createdAtUtcMs: bigint }) {
    if ([...this.guardians.values()].some((g) => g.contactEmail === input.contactEmail)) {
      const err = new Error("unique_violation") as Error & { code: string };
      err.code = "23505";
      throw err;
    }
    const id = `gid-${this.guardians.size}`;
    const guardian: GuardianAccount = {
      guardianId: id,
      contactEmail: input.contactEmail,
      guardianVerificationState: "UNVERIFIED",
      createdAtUtcMs: input.createdAtUtcMs,
      updatedAtUtcMs: input.createdAtUtcMs,
    };
    if (input.contactPhoneHash !== undefined) guardian.contactPhoneHash = input.contactPhoneHash;
    this.guardians.set(id, guardian);
    return { guardianId: id };
  }

  async findById(_c: unknown, guardianId: string) {
    return this.guardians.get(guardianId) ?? null;
  }

  async findByEmail(_c: unknown, contactEmail: string) {
    // Mirror PgGuardianRepository's case-insensitive contract:
    // canonical stored form is lowercase (per Zod transform + migration
    // 011), and the SQL WHERE uses LOWER() on both sides. Tests that
    // exercise mixed-case input rely on this stub matching the contract.
    const lookup = contactEmail.toLowerCase();
    for (const g of this.guardians.values()) {
      if (g.contactEmail.toLowerCase() === lookup) return g;
    }
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

describe("GuardianService", () => {
  let repo: InMemoryRepo;
  let svc: GuardianService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    svc = new GuardianService(fakePool, repo, fakeClock);
  });

  function validRequest(overrides: Partial<CreateGuardianRequest> = {}): CreateGuardianRequest {
    return {
      contact_email: "guardian@example.com",
      ...overrides,
    };
  }

  describe("test_claim_14_guardian_account_storage_shape", () => {
    it("test_claim_14_creates_guardian_with_unverified_default", async () => {
      const g = await svc.create(validRequest());
      expect(g.guardianVerificationState).toBe("UNVERIFIED");
    });

    it("test_claim_14_returns_guardian_id_assigned_by_repo", async () => {
      const g = await svc.create(validRequest());
      expect(g.guardianId).toMatch(/^gid-/);
    });

    it("test_claim_14_persists_contact_email", async () => {
      const g = await svc.create(validRequest({ contact_email: "parent@school.edu" }));
      expect(g.contactEmail).toBe("parent@school.edu");
    });

    it("test_claim_14_optional_contact_phone_hash_persists_when_provided", async () => {
      const phoneHash = "a".repeat(64);
      const g = await svc.create(validRequest({ contact_phone_hash: phoneHash }));
      expect(g.contactPhoneHash).toBe(phoneHash);
    });

    it("test_claim_14_optional_contact_phone_hash_omitted_when_not_provided", async () => {
      const g = await svc.create(validRequest());
      expect(g.contactPhoneHash).toBeUndefined();
    });

    it("test_claim_14_uses_clock_for_created_and_updated_timestamps", async () => {
      const g = await svc.create(validRequest());
      expect(g.createdAtUtcMs).toBe(1_700_000_000_000n);
      expect(g.updatedAtUtcMs).toBe(1_700_000_000_000n);
    });

    it("test_claim_14_canonicalizes_contact_email_to_lowercase_on_persist", async () => {
      // Code Review finding (PR #4): case-sensitive unique index
      // would bifurcate guardian roots by email casing. Schema layer
      // now canonicalizes to lowercase via Zod .transform(); this
      // test threads input through the schema (mirroring the route
      // layer) then through the service to assert the canonical
      // form reaches storage.
      const parsed = CreateGuardianSchema.parse({ contact_email: "Parent@Example.COM" });
      const g = await svc.create(parsed);
      expect(g.contactEmail).toBe("parent@example.com");
    });
  });

  describe("test_claim_14_guardian_lookups", () => {
    it("test_claim_14_find_by_email_after_create", async () => {
      await svc.create(validRequest({ contact_email: "lookup@example.com" }));
      // Service-layer find isn't exposed publicly — we exercise the repo
      // directly through the test seam to confirm the row landed correctly.
      const found = await repo.findByEmail(null as never, "lookup@example.com");
      expect(found).not.toBeNull();
      expect(found!.contactEmail).toBe("lookup@example.com");
      expect(found!.guardianVerificationState).toBe("UNVERIFIED");
    });

    it("test_claim_14_find_by_email_is_case_insensitive", async () => {
      // Code Review finding (PR #4 round 2): findByEmail must match
      // the storage layer's case-insensitive unique index. Callers
      // (admin tools, the upcoming A-04 hard-gate, etc.) may pass
      // mixed-case input; lookup must succeed regardless of casing.
      await svc.create(validRequest({ contact_email: "lookup@example.com" }));
      const variants = [
        "lookup@example.com",
        "Lookup@Example.com",
        "LOOKUP@EXAMPLE.COM",
        "lOoKuP@eXaMpLe.CoM",
      ];
      for (const variant of variants) {
        const found = await repo.findByEmail(null as never, variant);
        expect(found).not.toBeNull();
        expect(found!.contactEmail).toBe("lookup@example.com");
      }
    });
  });
});
