/**
 * Wire-format validation schemas for Guardian endpoints.
 *
 * Story T2-S1-A-01 — POST /v1/grom/guardians.
 * Strict mode by default — unknown fields are rejected. Email pattern
 * is conservative, not full RFC 5322 (that regex is a horror show).
 * Anything weirder than this regex accepts is rejected; user retries.
 */

import { z } from "zod";

const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const phoneHashRe = /^[a-f0-9]{64}$/;  // sha256 hex

export const CreateGuardianSchema = z.object({
  contact_email: z.string().regex(emailRe, "must be a valid email").max(254),
  contact_phone_hash: z.string().regex(phoneHashRe, "must be 64-hex-char sha256").optional(),
}).strict();

export type CreateGuardianRequest = z.infer<typeof CreateGuardianSchema>;
