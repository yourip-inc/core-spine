/**
 * Deprecation header helpers per RFC 8594.
 *
 * Story: T1-S1-E-03.
 * Claim: 10 (vocabulary alignment — FILMER alias normalization).
 *
 * When a request uses a deprecated vocabulary (currently: FILMER contributor
 * role), the server responds with:
 *   - `Deprecation: true` per RFC 8594 §2 — indicates the resource or input
 *     shape is deprecated.
 *   - `Sunset: <HTTP-date>` per RFC 8594 §3 — declares when the deprecated
 *     input will stop being accepted.
 *   - `Link: </docs/vocabulary-deprecations>; rel="sunset"` per RFC 8594 §3
 *     — points to the removal plan documentation.
 *
 * Successful requests using canonical vocabulary do NOT receive these headers.
 *
 * These headers are SET independently of the response body shape: the service
 * still responds with the normalized (canonical) value in the body. Clients
 * that ignore the header continue to work; clients that read the header get
 * early warning to update.
 */

import type { FastifyReply } from "fastify";

/**
 * Target sunset date for the FILMER → VIDEOGRAPHER alias (RFC 8594 §3).
 *
 * Format: IMF-fixdate per RFC 7231 §7.1.1.1 (the HTTP-date format). Example:
 * "Wed, 01 Oct 2026 00:00:00 GMT".
 *
 * Update this date when the alias removal release is scheduled. The precise
 * removal process — cut the alias layer, ship a major version bump, and
 * delete the FILMER enum value — is documented in
 * docs/vocabulary-deprecations.md.
 */
export const FILMER_SUNSET_HTTP_DATE = "Wed, 01 Oct 2026 00:00:00 GMT";

/**
 * Apply RFC 8594 deprecation headers for the FILMER alias to a Fastify reply.
 * Idempotent — safe to call multiple times in the same request lifecycle.
 */
export function applyFilmerDeprecationHeaders(reply: FastifyReply): void {
  reply.header("Deprecation", "true");
  reply.header("Sunset", FILMER_SUNSET_HTTP_DATE);
  reply.header(
    "Link",
    '</docs/vocabulary-deprecations.md>; rel="sunset"; type="text/markdown"',
  );
}

/**
 * Check whether a reply already carries deprecation headers. Useful when a
 * request-handler needs to decide whether another layer already marked the
 * response deprecated (e.g., an outer middleware).
 */
export function hasDeprecationHeaders(reply: FastifyReply): boolean {
  return reply.hasHeader("Deprecation");
}
