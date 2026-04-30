/**
 * Guardian route tests (Fastify inject — no DB, no real service).
 *
 * Story: T2-S1-A-01.
 * Claim: 14 (guardian-rooted account architecture).
 *
 * Mirrors tests/unit/submission/submission-routes.test.ts:
 * Fastify({ logger: false }) + registerGuardianRoutes(app, stubService)
 * + app.inject(). Tests behaviors only visible at the HTTP boundary:
 *   - 201 happy path returns snake_case wire format with all expected fields.
 *   - 400 GUARDIAN_PAYLOAD_INVALID for malformed payloads (Zod strict-mode).
 *   - 400 for unknown extra fields (strict-mode rejection).
 *
 * NOTE: The 409 duplicate-contact_email test lands in a follow-up commit
 * on this branch after the next PCO sync. The DomainError → HTTP error
 * handler is registered in server.ts, not here, so this test fixture
 * does not exercise DomainError-translated responses.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerGuardianRoutes } from "../../../src/http/guardian-routes.js";
import { GuardianService } from "../../../src/grom/guardian-service.js";
import type { GuardianAccount } from "../../../src/grom/guardian-types.js";

// Stub guardian service. Only the create() method is exercised by the
// route. Returns a known shape so we can assert the wire format.
function makeStubService(returned: GuardianAccount): GuardianService {
  return {
    create: async () => returned,
  } as unknown as GuardianService;
}

const SAMPLE_GUARDIAN: GuardianAccount = {
  guardianId: "11111111-1111-1111-1111-111111111111",
  contactEmail: "parent@example.com",
  guardianVerificationState: "UNVERIFIED",
  createdAtUtcMs: 1_700_000_000_000n,
  updatedAtUtcMs: 1_700_000_000_000n,
};

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  registerGuardianRoutes(app, makeStubService(SAMPLE_GUARDIAN));
  await app.ready();
});

async function post(body: unknown) {
  return app.inject({
    method: "POST",
    url: "/v1/grom/guardians",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
}

describe("POST /v1/grom/guardians — T2-S1-A-01", () => {
  describe("test_claim_14_guardian_create_201_happy_path", () => {
    it("test_claim_14_returns_201_for_valid_minimal_payload", async () => {
      const res = await post({ contact_email: "parent@example.com" });
      expect(res.statusCode).toBe(201);
    });

    it("test_claim_14_response_has_snake_case_field_names", async () => {
      const res = await post({ contact_email: "parent@example.com" });
      const body = res.json();
      expect(body).toHaveProperty("guardian_id");
      expect(body).toHaveProperty("contact_email");
      expect(body).toHaveProperty("guardian_verification_state");
      expect(body).toHaveProperty("created_at_utc_ms");
      expect(body).toHaveProperty("updated_at_utc_ms");
      // Confirm camelCase variants are NOT present
      expect(body).not.toHaveProperty("guardianId");
      expect(body).not.toHaveProperty("contactEmail");
    });

    it("test_claim_14_bigint_timestamps_serialized_as_decimal_strings", async () => {
      const res = await post({ contact_email: "parent@example.com" });
      const body = res.json();
      expect(typeof body.created_at_utc_ms).toBe("string");
      expect(body.created_at_utc_ms).toBe("1700000000000");
      expect(typeof body.updated_at_utc_ms).toBe("string");
    });

    it("test_claim_14_verification_state_returned_as_unverified", async () => {
      const res = await post({ contact_email: "parent@example.com" });
      expect(res.json().guardian_verification_state).toBe("UNVERIFIED");
    });
  });

  describe("test_claim_14_guardian_payload_invalid_400_path", () => {
    it("test_claim_14_rejects_missing_contact_email", async () => {
      const res = await post({});
      expect(res.statusCode).toBe(400);
      expect(res.json().reason_code).toBe("GUARDIAN_PAYLOAD_INVALID");
    });

    it("test_claim_14_rejects_malformed_contact_email", async () => {
      const res = await post({ contact_email: "not-an-email" });
      expect(res.statusCode).toBe(400);
      expect(res.json().reason_code).toBe("GUARDIAN_PAYLOAD_INVALID");
    });

    it("test_claim_14_rejects_unknown_extra_fields_strict_mode", async () => {
      const res = await post({
        contact_email: "parent@example.com",
        unexpected_field: "should be rejected",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().reason_code).toBe("GUARDIAN_PAYLOAD_INVALID");
    });

    it("test_claim_14_rejects_invalid_phone_hash_format", async () => {
      const res = await post({
        contact_email: "parent@example.com",
        contact_phone_hash: "not-a-sha256-hash",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().reason_code).toBe("GUARDIAN_PAYLOAD_INVALID");
    });

    it("test_claim_14_400_response_has_details_with_zod_flatten", async () => {
      const res = await post({});
      expect(res.json().details).toBeDefined();
    });
  });
});
