/**
 * Migration Record Service.
 *
 * Stories: T1-S1-D-02 (checksum computation), T1-S1-D-03 (HTTP create path).
 * Claims: CS-11 (migration record), CS-22 (replay inputs), CS-23 (replay branching).
 *
 * Responsibilities:
 *   - Compute migration_checksum from core fields (D-02).
 *   - Reject any client-supplied checksum (D-03 AC: "POST rejects attempt to
 *     supply pre-computed checksum (server computes)").
 *   - Persist via the repository.
 *   - Emit the challenge.migration.created audit event.
 *   - Verify a stored row's checksum by recomputation (tamper detection).
 */

import type { Pool } from "pg";
import {
  computeMigrationChecksum,
  verifyMigrationChecksum,
  type MigrationRecord,
  type MigrationRecordCore,
} from "./migration-record.js";
import type { MigrationRecordRepository } from "./migration-repository.js";
import { badRequest, conflict } from "../errors/domain-error.js";
import { REASON_CODES } from "../errors/reason-codes.js";

export interface Clock {
  nowUtcMs(): bigint;
}

export interface AuditEventSink {
  emit(event: {
    type: "challenge.migration.created";
    migrationId: string;
    challengeId: string;
    priorRulesetVersion: string;
    newRulesetVersion: string;
    effectiveAtUtcMs: bigint;
    emittedAtUtcMs: bigint;
  }): Promise<void>;
}

/** Memory-only audit sink; production wires a durable log. */
export class InMemoryAuditEventSink implements AuditEventSink {
  readonly events: Array<Parameters<AuditEventSink["emit"]>[0]> = [];
  async emit(event: Parameters<AuditEventSink["emit"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

export class MigrationRecordService {
  constructor(
    private readonly pool: Pool,
    private readonly repo: MigrationRecordRepository,
    private readonly clock: Clock,
    private readonly auditSink: AuditEventSink,
  ) {}

  /**
   * Create a migration record. Server computes migration_checksum from the
   * Seven Claim CS-11 fields; any client-supplied checksum is rejected with
   * MIGRATION_CLIENT_CHECKSUM_REJECTED (D-03 AC).
   */
  async create(
    core: MigrationRecordCore,
    opts: { clientSuppliedChecksum?: string | null } = {},
  ): Promise<MigrationRecord> {
    // D-03: reject a client-supplied checksum. This is a belt-and-braces check;
    // the HTTP layer's zod schema rejects the field earlier.
    if (opts.clientSuppliedChecksum !== undefined && opts.clientSuppliedChecksum !== null) {
      throw badRequest(
        REASON_CODES.MIGRATION_CLIENT_CHECKSUM_REJECTED,
        "migration_checksum is server-computed; clients must not supply it",
      );
    }

    // Validate structural invariants before hashing.
    if (core.priorRulesetVersion === core.newRulesetVersion) {
      throw badRequest(
        REASON_CODES.MIGRATION_PRIOR_EQUALS_NEW,
        "prior_ruleset_version and new_ruleset_version must differ",
        {
          prior_ruleset_version: core.priorRulesetVersion,
          new_ruleset_version: core.newRulesetVersion,
        },
      );
    }
    if (core.migrationReason.trim().length === 0) {
      throw badRequest(
        REASON_CODES.MIGRATION_REASON_EMPTY,
        "migration_reason must be non-empty",
      );
    }

    const checksum = computeMigrationChecksum(core);
    const createdAtUtcMs = this.clock.nowUtcMs();

    const client = await this.pool.connect();
    let committed = false;
    let inserted: MigrationRecord;
    try {
      await client.query("BEGIN");
      try {
        inserted = await this.repo.insert(client, {
          ...core,
          migrationChecksum: checksum,
          createdAtUtcMs,
        });
      } catch (err: unknown) {
        // Foreign-key violation (challenge_id → challenges) comes back as 23503.
        if (isPgError(err) && err.code === "23503") {
          throw conflict(
            REASON_CODES.CHALLENGE_ID_UNRESOLVABLE,
            `challenge_id does not reference an existing challenge: ${core.challengeId}`,
            { challenge_id: core.challengeId },
          );
        }
        throw err;
      }
      await client.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) {
        await client.query("ROLLBACK").catch(() => { /* secondary; ignore */ });
      }
      client.release();
    }

    // Emit audit event AFTER successful commit. Failure here is logged but does
    // not roll back the migration (the row is real; the audit is best-effort).
    await this.auditSink.emit({
      type: "challenge.migration.created",
      migrationId: inserted.migrationId,
      challengeId: inserted.challengeId,
      priorRulesetVersion: inserted.priorRulesetVersion,
      newRulesetVersion: inserted.newRulesetVersion,
      effectiveAtUtcMs: inserted.effectiveAtUtcMs,
      emittedAtUtcMs: this.clock.nowUtcMs(),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[audit] emit failed for challenge.migration.created:", err);
    });

    return inserted;
  }

  /**
   * Verify a stored migration's checksum by recomputation. Used by the
   * replay pre-check. Returns true iff the row is untampered.
   */
  async verify(migrationId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const row = await this.repo.findById(client, migrationId);
      if (row === null) return false;
      return verifyMigrationChecksum(row);
    } finally {
      client.release();
    }
  }

  /**
   * List migrations for a challenge in effective order. Used by replay to
   * walk the migration chain.
   */
  async listByChallenge(
    challengeId: string,
    opts: { asOfUtcMs?: bigint } = {},
  ): Promise<MigrationRecord[]> {
    const client = await this.pool.connect();
    try {
      return await this.repo.listByChallenge(client, challengeId, opts);
    } finally {
      client.release();
    }
  }
}

interface PgError { code?: string }
function isPgError(e: unknown): e is PgError {
  return typeof e === "object" && e !== null && "code" in e;
}
