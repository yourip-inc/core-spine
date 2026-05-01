/**
 * Contributor role vocabulary.
 *
 * Stories: T1-S1-E-02 (canonical enum), T1-S1-E-03 (alias normalization).
 * Claim: CS-10 (role-aware contributor splits / vocabulary).
 *
 * VIDEOGRAPHER is the canonical role name. FILMER is a deprecated alias
 * accepted ONLY at the public API input boundary and normalized immediately
 * to VIDEOGRAPHER. Internal service code, persistence, and API responses
 * use VIDEOGRAPHER exclusively.
 *
 * Removal plan: FILMER alias will be removed after one release cycle,
 * target release documented in docs/vocabulary-deprecations.md.
 */

/**
 * Canonical contributor roles. This is the source of truth for the
 * `contributor_role` Postgres enum.
 */
export const CONTRIBUTOR_ROLES = [
  "VIDEOGRAPHER",
  "EDITOR",
  "PERFORMER",
  "RIGHTSHOLDER",
] as const;

export type ContributorRole = typeof CONTRIBUTOR_ROLES[number];

/**
 * Type guard for canonical ContributorRole values.
 */
export function isContributorRole(value: unknown): value is ContributorRole {
  return typeof value === "string" && (CONTRIBUTOR_ROLES as readonly string[]).includes(value);
}

/**
 * Deprecated input aliases accepted at the public API boundary.
 * See docs/vocabulary-deprecations.md for the removal schedule.
 */
export const DEPRECATED_ROLE_ALIASES: Readonly<Record<string, ContributorRole>> = Object.freeze({
  FILMER: "VIDEOGRAPHER",
});

/**
 * Result of normalizing a role string. `wasDeprecated` is true iff the input
 * matched a deprecated alias rather than a canonical value — callers use this
 * to set the `Deprecation` response header per E-03.
 */
export interface NormalizedRole {
  role: ContributorRole;
  wasDeprecated: boolean;
  originalValue: string;
}

/**
 * Normalize a client-supplied role string.
 *
 * Accepts:
 *   - Canonical ContributorRole values → { role, wasDeprecated: false }.
 *   - Deprecated aliases (e.g. "FILMER") → { role: canonical, wasDeprecated: true }.
 *
 * Throws for anything else. Input is case-sensitive by design — the API
 * contract specifies uppercase enum values, and accepting mixed case here
 * would mask client bugs.
 */
export function normalizeContributorRole(input: string): NormalizedRole {
  if (isContributorRole(input)) {
    return { role: input, wasDeprecated: false, originalValue: input };
  }
  const aliasTarget = DEPRECATED_ROLE_ALIASES[input];
  if (aliasTarget !== undefined) {
    return { role: aliasTarget, wasDeprecated: true, originalValue: input };
  }
  throw new Error(
    `unknown contributor role: ${JSON.stringify(input)}. ` +
    `Valid values: ${CONTRIBUTOR_ROLES.join(", ")}.`,
  );
}
