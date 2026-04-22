/**
 * Rubric HTTP routes.
 * Story T1-S1-A-03: POST /v1/rubrics and GET /v1/rubrics/{rubric_version}.
 */

import type { FastifyInstance } from "fastify";
import { CreateRubricSchema } from "../rubric/rubric-schemas.js";
import { RubricService } from "../rubric/rubric-service.js";
import { REASON_CODES } from "../errors/reason-codes.js";
import type { Rubric } from "../rubric/rubric-types.js";

export function registerRubricRoutes(app: FastifyInstance, svc: RubricService): void {
  app.post("/v1/rubrics", async (req, reply) => {
    const parsed = CreateRubricSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        reason_code: REASON_CODES.RATING_SCHEMA_DRIFT,
        message: "invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const rubric = await svc.create(parsed.data);
    return reply.code(201).send(toWire(rubric));
  });

  app.get<{ Params: { rubric_version: string } }>(
    "/v1/rubrics/:rubric_version",
    async (req, reply) => {
      const r = await svc.getByVersion(req.params.rubric_version);
      if (!r) {
        return reply.code(404).send({
          reason_code: REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE,
          message: `rubric_version not found: ${req.params.rubric_version}`,
        });
      }
      return reply.code(200).send(toWire(r));
    },
  );
}

/**
 * Domain → wire representation. BigInts become strings (JSON can't carry BigInt).
 * Field names convert camelCase → snake_case to match the API contract.
 */
function toWire(r: Rubric): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    rubric_id: r.rubricId,
    rubric_version: r.rubricVersion,
    name: r.name,
    created_at_utc_ms: r.createdAtUtcMs.toString(),
    criteria: [...r.criteria]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        criterion_key: c.criterionKey,
        display_name: c.displayName,
        weight_bp: c.weightBp,
        scale_min_bp: c.scaleMinBp,
        scale_max_bp: c.scaleMaxBp,
        sort_order: c.sortOrder,
      })),
  };
  if (r.description !== undefined) obj.description = r.description;
  if (r.publishedAtUtcMs !== undefined) obj.published_at_utc_ms = r.publishedAtUtcMs.toString();
  if (r.canonicalJsonSha256 !== undefined) obj.canonical_json_sha256 = r.canonicalJsonSha256;
  return obj;
}
