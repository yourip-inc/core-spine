/**
 * PG repository for challenge_migrations.
 *
 * Append-only. The service layer computes migration_checksum before calling
 * insert(); this repo does not know about canonicalization.
 */

import type { Pool, PoolClient } from "pg";
import type { MigrationRecord, MigrationRecordCore } from "./migration-record.js";

export interface MigrationRecordRepository {
  insert(
    client: PoolClient,
    input: MigrationRecordCore & {
      migrationChecksum: string;
      createdAtUtcMs: bigint;
    },
  ): Promise<MigrationRecord>;

  findById(client: PoolClient, migrationId: string): Promise<MigrationRecord | null>;

  listByChallenge(
    client: PoolClient,
    challengeId: string,
    opts?: { asOfUtcMs?: bigint },
  ): Promise<MigrationRecord[]>;
}

export class PgMigrationRecordRepository implements MigrationRecordRepository {
  constructor(private readonly pool: Pool) {}

  async insert(
    client: PoolClient,
    input: MigrationRecordCore & {
      migrationChecksum: string;
      createdAtUtcMs: bigint;
    },
  ): Promise<MigrationRecord> {
    const { rows } = await client.query<{ migration_id: string }>(
      `INSERT INTO challenge_migrations
         (challenge_id, prior_ruleset_version, new_ruleset_version,
          migration_reason, approver_id, effective_at_utc_ms,
          affected_event_ids, migration_checksum, created_at_utc_ms)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7::jsonb, $8, $9)
       RETURNING migration_id`,
      [
        input.challengeId,
        input.priorRulesetVersion,
        input.newRulesetVersion,
        input.migrationReason,
        input.approverId,
        input.effectiveAtUtcMs.toString(),
        JSON.stringify([...input.affectedEventIds]),
        input.migrationChecksum,
        input.createdAtUtcMs.toString(),
      ],
    );
    return {
      migrationId: rows[0]!.migration_id,
      challengeId: input.challengeId,
      priorRulesetVersion: input.priorRulesetVersion,
      newRulesetVersion: input.newRulesetVersion,
      migrationReason: input.migrationReason,
      approverId: input.approverId,
      effectiveAtUtcMs: input.effectiveAtUtcMs,
      affectedEventIds: [...input.affectedEventIds],
      migrationChecksum: input.migrationChecksum,
      createdAtUtcMs: input.createdAtUtcMs,
    };
  }

  async findById(client: PoolClient, migrationId: string): Promise<MigrationRecord | null> {
    const { rows } = await client.query<DbRow>(
      `SELECT migration_id, challenge_id, prior_ruleset_version, new_ruleset_version,
              migration_reason, approver_id, effective_at_utc_ms, affected_event_ids,
              migration_checksum, created_at_utc_ms
         FROM challenge_migrations
        WHERE migration_id = $1::uuid`,
      [migrationId],
    );
    if (rows.length === 0) return null;
    return toDomain(rows[0]!);
  }

  async listByChallenge(
    client: PoolClient,
    challengeId: string,
    opts: { asOfUtcMs?: bigint } = {},
  ): Promise<MigrationRecord[]> {
    const params: unknown[] = [challengeId];
    let sql =
      `SELECT migration_id, challenge_id, prior_ruleset_version, new_ruleset_version,
              migration_reason, approver_id, effective_at_utc_ms, affected_event_ids,
              migration_checksum, created_at_utc_ms
         FROM challenge_migrations
        WHERE challenge_id = $1::uuid`;
    if (opts.asOfUtcMs !== undefined) {
      params.push(opts.asOfUtcMs.toString());
      sql += ` AND effective_at_utc_ms <= $${params.length}`;
    }
    sql += ` ORDER BY effective_at_utc_ms ASC, migration_id ASC`;
    const { rows } = await client.query<DbRow>(sql, params);
    return rows.map(toDomain);
  }
}

interface DbRow {
  migration_id: string;
  challenge_id: string;
  prior_ruleset_version: string;
  new_ruleset_version: string;
  migration_reason: string;
  approver_id: string;
  effective_at_utc_ms: string;  // BIGINT → string due to pg.types.setTypeParser(20)
  affected_event_ids: unknown;  // JSONB
  migration_checksum: string;
  created_at_utc_ms: string;
}

function toDomain(r: DbRow): MigrationRecord {
  const rawEvents = r.affected_event_ids;
  if (!Array.isArray(rawEvents)) {
    throw new Error(`migration_record: affected_event_ids is not an array: ${typeof rawEvents}`);
  }
  const events: string[] = [];
  for (const e of rawEvents) {
    if (typeof e !== "string") {
      throw new Error(`migration_record: affected_event_ids element is not a string: ${typeof e}`);
    }
    events.push(e);
  }
  return {
    migrationId: r.migration_id,
    challengeId: r.challenge_id,
    priorRulesetVersion: r.prior_ruleset_version,
    newRulesetVersion: r.new_ruleset_version,
    migrationReason: r.migration_reason,
    approverId: r.approver_id,
    effectiveAtUtcMs: BigInt(r.effective_at_utc_ms),
    affectedEventIds: events,
    migrationChecksum: r.migration_checksum,
    createdAtUtcMs: BigInt(r.created_at_utc_ms),
  };
}
