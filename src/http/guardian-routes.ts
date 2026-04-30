/**
 * Guardian HTTP routes.
 *
 * Story T2-S1-A-01: POST /v1/grom/guardians.
 *
 * The 409 (duplicate contact_email) path is enforced at the service
 * layer in a follow-up commit on this branch after PCO returns the
 * reason code name. The 400 (malformed payload) path is enforced
 * here via Zod strict-mode parsing with reason code
 * GUARDIAN_PAYLOAD_INVALID.
 *
 * The DomainError → HTTP error handler is registered centrally in
 * src/http/server.ts (app.setErrorHandler). We do not register a
 * route-local handler here.
 */

import type { FastifyInstance } from "fastify";
import { CreateGuardianSchema } from "../grom/guardian-schemas.js";
import { GuardianService } from "../grom/guardian-service.js";
import { REASON_CODES } from "../errors/reason-codes.js";
import type { GuardianAccount } from "../grom/guardian-types.js";

export function registerGuardianRoutes(app: FastifyInstance, svc: GuardianService): void {
  app.post("/v1/grom/guardians", async (req, reply) => {
    const parsed = CreateGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        reason_code: REASON_CODES.GUARDIAN_PAYLOAD_INVALID,
        message: "invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const guardian = await svc.create(parsed.data);
    return reply.code(201).send(toWire(guardian));
  });
}

/**
 * Domain → wire representation. BigInts become strings; field names
 * convert camelCase → snake_case to match the API contract.
 */
function toWire(g: GuardianAccount): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    guardian_id: g.guardianId,
    contact_email: g.contactEmail,
    guardian_verification_state: g.guardianVerificationState,
    created_at_utc_ms: g.createdAtUtcMs.toString(),
    updated_at_utc_ms: g.updatedAtUtcMs.toString(),
  };
  if (g.contactPhoneHash !== undefined) obj.contact_phone_hash = g.contactPhoneHash;
  return obj;
}
