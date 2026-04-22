# Vocabulary Deprecations

Running log of deprecated terminology, canonical replacements, and removal schedules.

## Active deprecations

### FILMER → VIDEOGRAPHER

**Introduced in:** T1 Sprint 1, WS-1E (stories T1-S1-E-01 through T1-S1-E-03).
**Claim:** 10 (role-aware contributor splits / vocabulary alignment).

**Status:** VIDEOGRAPHER is the canonical role name. FILMER is accepted as
an input alias on the public API for backward compatibility during one release
cycle.

**What's canonical:**
- `ContributorRole` enum in `src/submission/contributor-role.ts` — VIDEOGRAPHER
  appears; FILMER does not.
- Postgres `contributor_role` enum — both values exist but VIDEOGRAPHER is the
  default and FILMER is deprecated.
- All internal service code, all API responses, all test fixtures,
  `openapi/core-spine.yaml` — VIDEOGRAPHER.

**What still accepts FILMER:**
- `POST /v1/challenges/{challengeId}/submissions` request bodies — the
  `normalizeContributorRole` helper converts FILMER to VIDEOGRAPHER before
  persistence. Response bodies always return VIDEOGRAPHER.
- Requests that supplied FILMER receive a `Deprecation: true` header and a
  `Sunset` header pointing at the removal date (when scheduled).

**Lint enforcement:**
- Custom ESLint rule `no-filmer-outside-alias` (in `eslint-rules/`) rejects any
  new FILMER reference outside these three locations:
  - `src/submission/contributor-role.ts` (the alias layer itself)
  - any `.test.ts`/`.test.tsx`/`.test.js`/`.test.jsx` file
  - any path under `docs/`

**Removal plan:**

| Milestone | Action |
|---|---|
| End of T1 Sprint 1 | WS-1E landed. FILMER accepted as input alias. |
| One release cycle (target: T2 Sprint 1) | Announce removal date via API `Sunset` header. |
| Removal release (target: T3 Sprint 1) | Delete `DEPRECATED_ROLE_ALIASES.FILMER`. Remove the deprecation header. The Postgres enum retains the FILMER value (Postgres cannot remove enum values without a full type rebuild — see migrations/009_videographer_enum.down.sql). |

**How to schedule removal:** PCO files a WS against T2 or T3 Sprint-1 scope
titled "Remove FILMER alias" with:
- Check that no client has sent a FILMER request in the trailing 30 days
  (grep audit logs).
- Target `Sunset` date one release cycle out.
- Update this document with the scheduled date.
- Update `docs/patent/claim-traceability.md` with the expected commit SHA.

## Removed deprecations

(none yet)
