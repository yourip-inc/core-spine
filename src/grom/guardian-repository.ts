/**
 * Guardian persistence layer.
 *
 * Story T2-S1-A-01 — guardian_accounts table (migration 010).
 * Initial scope: create + find. Verification-state transition paths
 * (UPDATE) land in A-03.
 */

import type { PoolClient } from "pg";
import type { GuardianAccount, NewGuardianInput, VerificationState } from "./guardian-types.js";

export interface GuardianRepository {
  create(client: PoolClient, input: NewGuardianInput & {
    createdAtUtcMs: bigint;
  }): Promise<{ guardianId: string }>;

  findById(client: PoolClient, guardianId: string): Promise<GuardianAccount | null>;
  findByEmail(client: PoolClient, contactEmail: string): Promise<GuardianAccount | null>;
}

interface GuardianRow {
  guardian_id: string;
  contact_email: string;
  contact_phone_hash: string | null;
  guardian_verification_state: string;
  created_at_utc_ms: string;
  updated_at_utc_ms: string;
}

export class PgGuardianRepository implements GuardianRepository {
  async create(client: PoolClient, input: NewGuardianInput & {
    createdAtUtcMs: bigint;
  }): Promise<{ guardianId: string }> {
    const { rows } = await client.query<{ guardian_id: string }>(
      `INSERT INTO guardian_accounts
         (contact_email, contact_phone_hash, created_at_utc_ms, updated_at_utc_ms)
       VALUES ($1, $2, $3, $3)
       RETURNING guardian_id`,
      [
        input.contactEmail,
        input.contactPhoneHash ?? null,
        input.createdAtUtcMs.toString(),
      ],
    );
    return { guardianId: rows[0]!.guardian_id };
  }

  async findById(client: PoolClient, guardianId: string): Promise<GuardianAccount | null> {
    const { rows } = await client.query<GuardianRow>(
      `SELECT guardian_id, contact_email, contact_phone_hash,
              guardian_verification_state, created_at_utc_ms, updated_at_utc_ms
         FROM guardian_accounts
        WHERE guardian_id = $1`,
      [guardianId],
    );
    if (rows.length === 0) return null;
    return rowToDomain(rows[0]!);
  }

  async findByEmail(client: PoolClient, contactEmail: string): Promise<GuardianAccount | null> {
    const { rows } = await client.query<GuardianRow>(
      `SELECT guardian_id, contact_email, contact_phone_hash,
              guardian_verification_state, created_at_utc_ms, updated_at_utc_ms
         FROM guardian_accounts
        WHERE contact_email = $1`,
      [contactEmail],
    );
    if (rows.length === 0) return null;
    return rowToDomain(rows[0]!);
  }
}

function rowToDomain(r: GuardianRow): GuardianAccount {
  const result: GuardianAccount = {
    guardianId: r.guardian_id,
    contactEmail: r.contact_email,
    guardianVerificationState: r.guardian_verification_state as VerificationState,
    createdAtUtcMs: BigInt(r.created_at_utc_ms),
    updatedAtUtcMs: BigInt(r.updated_at_utc_ms),
  };
  if (r.contact_phone_hash !== null) result.contactPhoneHash = r.contact_phone_hash;
  return result;
}
