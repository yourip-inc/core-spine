/**
 * Submission HTTP routes.
 *
 * Story: T1-S1-E-03 (deprecated-alias normalization on POST /submissions).
 * Claim: CS-10 (vocabulary alignment).
 *
 * This file implements the input-normalization and deprecation-header flow for
 * the `submitter_role` field ONLY. The full Submission Registry (cryptographic
 * hashes, event_hash computation, role-aware contributor splits) is out of
 * scope for Sprint 1 and lands later per API Contract §3.
 *
 * What this route proves:
 *   1. POST /v1/challenges/:challengeId/submissions accepts FILMER as a
 *      deprecated alias and normalizes it to VIDEOGRAPHER before persist.
 *   2. Response body always returns the canonical VIDEOGRAPHER.
 *   3. Deprecation + Sunset headers are set on FILMER requests, absent on
 *      canonical VIDEOGRAPHER requests.
 *
 * It does NOT persist submissions — the repo-layer write happens in a later
 * sprint. A no-op "accepted" response is sufficient to validate the E-03 AC.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  normalizeContributorRole,
  CONTRIBUTOR_ROLES,
  DEPRECATED_ROLE_ALIASES,
} from "../submission/contributor-role.js";
import { applyFilmerDeprecationHeaders } from "./deprecation-headers.js";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Request body schema. `submitter_role` accepts canonical values AND deprecated
 * aliases at the zod layer; we let the alias map drive the allowed set.
 */
const CreateSubmissionBody = z.object({
  submission_id: z.string().regex(uuidRe).optional(),
  submitter_role: z.string().refine(
    (v) =>
      (CONTRIBUTOR_ROLES as readonly string[]).includes(v) ||
      Object.prototype.hasOwnProperty.call(DEPRECATED_ROLE_ALIASES, v),
    { message: "submitter_role must be a canonical ContributorRole or a deprecated alias" },
  ),
}).strict();

type CreateSubmissionRequest = z.infer<typeof CreateSubmissionBody>;

export function registerSubmissionRoutes(app: FastifyInstance): void {
  app.post<{
    Params: { challengeId: string };
    Body: unknown;
  }>("/v1/challenges/:challengeId/submissions", async (req, reply) => {
    if (!uuidRe.test(req.params.challengeId)) {
      return reply.code(400).send({
        reason_code: "SUBMISSION_SCHEMA_DRIFT",
        message: "challengeId must be a uuid",
      });
    }

    const parsed = CreateSubmissionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        reason_code: "SUBMISSION_SCHEMA_DRIFT",
        message: "invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const body: CreateSubmissionRequest = parsed.data;

    // E-03 core flow: normalize the role, set headers if deprecated.
    const normalized = normalizeContributorRole(body.submitter_role);
    if (normalized.wasDeprecated) {
      applyFilmerDeprecationHeaders(reply);
    }

    // Persistence is out of scope for Sprint 1; a no-op accepted response
    // carries the canonical role so callers see what would have been written.
    return reply.code(202).send({
      challenge_id: req.params.challengeId,
      submitter_role: normalized.role, // canonical — never the alias
    });
  });
}
