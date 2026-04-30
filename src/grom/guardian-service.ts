/**
 * Guardian Service.
 *
 * Stories:
 *   T2-S1-A-01  Create guardian_accounts table and POST /v1/grom/guardians
 *
 * Claims: 14.
 *
 * Subordinate minor profiles (WS-2B) cannot exist independently of a
 * verified guardian account (claim 14). This service ships only the
 * creation surface for guardian roots; verification-state transitions
 * land in A-02/A-03. The hard-gate that blocks profile creation when
 * guardian_verification_state != 'VERIFIED' lands in A-04.
 */

import type { Pool } from "pg";
import type { CreateGuardianRequest } from "./guardian-schemas.js";
import type { GuardianAccount } from "./guardian-types.js";
import type { GuardianRepository } from "./guardian-repository.js";

export interface Clock {
  nowUtcMs(): bigint;
}

export class GuardianService {
  constructor(
    private readonly pool: Pool,
    private readonly repo: GuardianRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Create a new GuardianAccount. Returns the created account in
   * verification_state UNVERIFIED.
   *
   * Verification-state transitions (UNVERIFIED → PENDING_REVIEW etc.)
   * land in A-02/A-03 and are NOT in scope here.
   *
   * TODO(PCO-pending): the duplicate-contact_email path returns 409.
   * The PCO-approved reason code for that path lands in a follow-up
   * commit on this branch after the next PCO sync. See PR #4 description
   * and T2-S1-A-01 acceptance criteria. Until that lands, a duplicate
   * insert raises Postgres 23505 which surfaces as a 500 — this is
   * intentional during the PCO-gate window, not a bug.
   */
  async create(req: CreateGuardianRequest): Promise<GuardianAccount> {
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");

      const { guardianId } = await this.repo.create(client, {
        contactEmail: req.contact_email,
        ...(req.contact_phone_hash !== undefined ? { contactPhoneHash: req.contact_phone_hash } : {}),
        createdAtUtcMs: this.clock.nowUtcMs(),
      });

      await client.query("COMMIT");
      committed = true;

      const created = await this.repo.findById(client, guardianId);
      if (!created) throw new Error("internal: guardian disappeared mid-transaction");
      return created;
    } finally {
      if (!committed) {
        await client.query("ROLLBACK").catch(() => { /* secondary; ignore */ });
      }
      client.release();
    }
  }
}
