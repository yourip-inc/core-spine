/**
 * Core Spine HTTP server bootstrap.
 */

import Fastify from "fastify";
import pg from "pg";
import { RubricService } from "../rubric/rubric-service.js";
import { PgRubricRepository } from "../rubric/rubric-repository.js";
import { registerRubricRoutes } from "./rubric-routes.js";
import { registerSubmissionRoutes } from "./submission-routes.js";
import {
  MigrationRecordService,
  InMemoryAuditEventSink,
  type AuditEventSink,
} from "../migration/migration-service.js";
import { PgMigrationRecordRepository } from "../migration/migration-repository.js";
import { registerMigrationRoutes } from "./migration-routes.js";
import { DomainError } from "../errors/domain-error.js";

// Critical: return BIGINT (OID 20 = int8) as string, not number. Node-postgres
// defaults to number for BIGINT, which silently loses precision past 2^53.
// We always convert to BigInt in the repository layer. This override is
// module-level and affects every Pool/Client in this process.
pg.types.setTypeParser(20, (val: string) => val);

export function buildServer(opts: {
  pool: pg.Pool;
  auditSink?: AuditEventSink;
}) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Reject requests > 1MB; rubric payloads are small by construction.
    bodyLimit: 1_048_576,
  });

  const clock = { nowUtcMs: () => BigInt(Date.now()) };
  const auditSink = opts.auditSink ?? new InMemoryAuditEventSink();

  const rubricRepo = new PgRubricRepository();
  const rubricService = new RubricService(opts.pool, rubricRepo, clock);

  const migrationRepo = new PgMigrationRecordRepository(opts.pool);
  const migrationService = new MigrationRecordService(
    opts.pool,
    migrationRepo,
    clock,
    auditSink,
  );

  registerRubricRoutes(app, rubricService);
  registerMigrationRoutes(app, migrationService);
  registerSubmissionRoutes(app);

  app.get("/healthz", async () => ({ ok: true }));

  // Centralized DomainError → reason-code envelope.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.httpStatus).send({
        reason_code: err.reasonCode,
        message: err.message,
        details: err.details,
      });
    }
    app.log.error({ err }, "unhandled error");
    return reply.code(500).send({
      reason_code: "INTERNAL_ERROR",
      message: "internal error",
    });
  });

  return app;
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const app = buildServer({ pool });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ host: "0.0.0.0", port });
}

// Only run if invoked as the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
