/**
 * Guardian Profile domain types.
 *
 * Story T2-S1-A-01 — guardian-rooted account model (claim 14).
 * Shapes in this file are the source of truth for WS-2A. Subordinate
 * minor profiles (WS-2B) link to GuardianAccount via guardian_id and
 * cannot exist when guardian_verification_state != 'VERIFIED'.
 */

export type VerificationState =
  | "UNVERIFIED"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "REVOKED";

export interface GuardianAccount {
  guardianId: string;                            // UUID
  contactEmail: string;
  contactPhoneHash?: string;                     // hash, never plaintext
  guardianVerificationState: VerificationState;  // starts UNVERIFIED
  createdAtUtcMs: bigint;
  updatedAtUtcMs: bigint;
}

export interface NewGuardianInput {
  contactEmail: string;
  contactPhoneHash?: string;
}
