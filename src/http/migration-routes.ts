/**
 * Migration HTTP routes.
 * Story: T1-S1-D-03.
 *
 * POST /v1/challenges/:challengeId/migrations
 *   Request body: seven Claim-11 fields (NO migration_checksum — server computes).
 *     Additional fields rejected by zod .strict().
 *   Response: 201 Created with the stored Migration record (including server-computed checksum).
 *
 * Body validation:
 *   - migration_checksum present in body → 400 MIGRATION_CLIENT_CHECKSUM_REJECTED.
 *   - Missing required field → 400 (zod).
 *   - All seven required. `challenge_id` comes from the URL, not the body, to
 *     prevent request-body-vs-URL confusion.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MigrationRecordService } from "../migration/migration-service.js";
import type { MigrationRecord } from "../migration/migration-record.js";
import { REASON_CODES } from "../errors/reason-codes.js";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zod schema for POST body. We deliberately do NOT include migration_checksum;
 * zod's .strict() means any extra field (including migration_checksum) yields
 * a 400. This gives us the "client can't supply checksum" AC at the transport
 * layer; the service layer has a second check for callers that bypass HTTP.
 */
const CreateMigrationBody = z.object({
  prior_ruleset_version: z.string().min(1).max(200),
  new_ruleset_version:   z.string().min(1).max(200),
  migration_reason:      z.string().min(1).max(2000),
  approver_id:           z.string().regex(uuidRe, "approver_id must be a uuid"),
  effective_at_utc_ms:   z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/, "effective_at_utc_ms must be a non-negative integer string"),
  ]),
  affected_event_ids:    z.array(z.string().min(1).max(200)).min(0).max(100_000),
}).strict();

type CreateMigrationRequest = z.infer<typeof CreateMigrationBody>;

export function registerMigrationRoutes(app: FastifyInstance, svc: MigrationRecordService): void {
  app.post<{
    Params: { challengeId: string };
    Body: unknown;
  }>("/v1/challenges/:challengeId/migrations", async (req, reply) => {
    // Early detection of client-supplied checksum for a clean reason code.
    // .strict() would reject it too but with a generic zod error.
    if (
      typeof req.body === "object" &&
      req.body !== null &&
      "migration_checksum" in req.body
    ) {
      return reply.code(400).send({
        reason_code: REASON_CODES.MIGRATION_CLIENT_CHECKSUM_REJECTED,
        message: "migration_checksum is server-computed; clients must not supply it",
      });
    }

    const parsed = CreateMigrationBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        reason_code: "MIGRATION_SCHEMA_DRIFT",
        message: "invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const body: CreateMigrationRequest = parsed.data;

    // Validate challengeId param as UUID.
    if (!uuidRe.test(req.params.challengeId)) {
      return reply.code(400).send({
        reason_code: "MIGRATION_SCHEMA_DRIFT",
        message: "challengeId must be a uuid",
      });
    }

    const effectiveAtUtcMs =
      typeof body.effective_at_utc_ms === "number"
        ? BigInt(body.effective_at_utc_ms)
        : BigInt(body.effective_at_utc_ms);

    const record = await svc.create({
      challengeId: req.params.challengeId,
      priorRulesetVersion: body.prior_ruleset_version,
      newRulesetVersion: body.new_ruleset_version,
      migrationReason: body.migration_reason,
      approverId: body.approver_id,
      effectiveAtUtcMs,
      affectedEventIds: body.affected_event_ids,
    });

    return reply.code(201).send(toWire(record));
  });
}

function toWire(r: MigrationRecord): Record<string, unknown> {
  return {
    migration_id: r.migrationId,
    challenge_id: r.challengeId,
    prior_ruleset_version: r.priorRulesetVersion,
    new_ruleset_version: r.newRulesetVersion,
    migration_reason: r.migrationReason,
    approver_id: r.approverId,
    effective_at_utc_ms: r.effectiveAtUtcMs.toString(),
    affected_event_ids: r.affectedEventIds,
    migration_checksum: r.migrationChecksum,
    created_at_utc_ms: r.createdAtUtcMs.toString(),
  };
}
