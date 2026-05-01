/**
 * Submission route / E-03 deprecation alias flow tests.
 *
 * Story: T1-S1-E-03.
 * Claim: CS-10 (vocabulary alignment).
 *
 * Uses `fastify.inject()` to exercise the full route without starting a
 * real HTTP server. This also exercises the ESLint rule (the route references
 * "FILMER" only inside the alias-layer import, not directly).
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerSubmissionRoutes } from "../../../src/http/submission-routes.js";

const CHALLENGE_ID = "11111111-1111-1111-1111-111111111111";

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  registerSubmissionRoutes(app);
  await app.ready();
});

async function post(body: unknown) {
  return app.inject({
    method: "POST",
    url: `/v1/challenges/${CHALLENGE_ID}/submissions`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
}

describe("POST /v1/challenges/:challengeId/submissions — E-03", () => {
  describe("canonical VIDEOGRAPHER input", () => {
    it("test_claim_CS_10_canonical_role_persists_as_videographer", async () => {
      const res = await post({ submitter_role: "VIDEOGRAPHER" });
      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.payload)).toMatchObject({
        challenge_id: CHALLENGE_ID,
        submitter_role: "VIDEOGRAPHER",
      });
    });

    it("test_claim_CS_10_canonical_request_has_no_deprecation_header", async () => {
      const res = await post({ submitter_role: "VIDEOGRAPHER" });
      expect(res.headers.deprecation).toBeUndefined();
      expect(res.headers.sunset).toBeUndefined();
    });

    it("test_claim_CS_10_other_canonical_roles_also_have_no_deprecation_header", async () => {
      for (const role of ["EDITOR", "PERFORMER", "RIGHTSHOLDER"]) {
        const res = await post({ submitter_role: role });
        expect(res.statusCode).toBe(202);
        expect(res.headers.deprecation).toBeUndefined();
      }
    });
  });

  describe("deprecated FILMER input", () => {
    it("test_claim_CS_10_filmer_input_normalizes_to_videographer_in_response", async () => {
      const res = await post({ submitter_role: "FILMER" });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.payload);
      // Body ALWAYS carries canonical value, regardless of input.
      expect(body.submitter_role).toBe("VIDEOGRAPHER");
    });

    it("test_claim_CS_10_filmer_input_emits_deprecation_header", async () => {
      const res = await post({ submitter_role: "FILMER" });
      expect(res.headers.deprecation).toBe("true");
    });

    it("test_claim_CS_10_filmer_input_emits_sunset_header", async () => {
      const res = await post({ submitter_role: "FILMER" });
      expect(res.headers.sunset).toBeDefined();
      // RFC 7231 IMF-fixdate shape: "Wed, 01 Oct 2026 00:00:00 GMT".
      expect(res.headers.sunset).toMatch(
        /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
      );
    });

    it("test_claim_CS_10_filmer_input_emits_link_header_pointing_to_sunset_doc", async () => {
      const res = await post({ submitter_role: "FILMER" });
      expect(res.headers.link).toMatch(/vocabulary-deprecations/);
      expect(res.headers.link).toMatch(/rel="sunset"/);
    });
  });

  describe("input validation", () => {
    it("test_claim_CS_10_unknown_role_rejected_with_400", async () => {
      const res = await post({ submitter_role: "DIRECTOR" });
      expect(res.statusCode).toBe(400);
    });

    it("test_claim_CS_10_lowercase_role_rejected_with_400", async () => {
      const res = await post({ submitter_role: "videographer" });
      expect(res.statusCode).toBe(400);
    });

    it("test_claim_CS_10_invalid_challenge_id_rejected_with_400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/challenges/not-a-uuid/submissions",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ submitter_role: "VIDEOGRAPHER" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("test_claim_CS_10_missing_submitter_role_rejected_with_400", async () => {
      const res = await post({});
      expect(res.statusCode).toBe(400);
    });
  });
});
