/**
 * Contributor-role normalizer tests.
 *
 * Stories: T1-S1-E-02, T1-S1-E-03.
 * Claim: CS-10 (role-aware contributor splits / vocabulary).
 *
 * AC fixtures:
 *   - Canonical VIDEOGRAPHER input → wasDeprecated: false
 *   - Deprecated FILMER input → normalized to VIDEOGRAPHER, wasDeprecated: true
 *   - Unknown role → throws
 *   - Canonical list contains VIDEOGRAPHER
 */

import { describe, it, expect } from "vitest";
import {
  CONTRIBUTOR_ROLES,
  DEPRECATED_ROLE_ALIASES,
  isContributorRole,
  normalizeContributorRole,
} from "../../../src/submission/contributor-role.js";

describe("CONTRIBUTOR_ROLES", () => {
  it("test_claim_CS_10_videographer_role_named_is_canonical", () => {
    expect(CONTRIBUTOR_ROLES).toContain("VIDEOGRAPHER");
  });

  it("test_claim_CS_10_filmer_is_not_in_canonical_list", () => {
    // FILMER must appear only in the alias map, not in the canonical enum.
    expect((CONTRIBUTOR_ROLES as readonly string[])).not.toContain("FILMER");
  });

  it("test_claim_CS_10_all_contributor_roles_are_uppercase", () => {
    // API contract specifies uppercase enum values.
    for (const r of CONTRIBUTOR_ROLES) {
      expect(r).toBe(r.toUpperCase());
    }
  });
});

describe("DEPRECATED_ROLE_ALIASES", () => {
  it("test_claim_CS_10_filmer_aliases_to_videographer", () => {
    expect(DEPRECATED_ROLE_ALIASES.FILMER).toBe("VIDEOGRAPHER");
  });
});

describe("isContributorRole", () => {
  it("test_claim_CS_10_canonical_role_is_recognized", () => {
    expect(isContributorRole("VIDEOGRAPHER")).toBe(true);
    expect(isContributorRole("EDITOR")).toBe(true);
    expect(isContributorRole("PERFORMER")).toBe(true);
    expect(isContributorRole("RIGHTSHOLDER")).toBe(true);
  });

  it("test_claim_CS_10_filmer_alias_is_not_a_canonical_role", () => {
    // Type-guard must return false for deprecated aliases so internal code
    // never accidentally treats them as valid persistence values.
    expect(isContributorRole("FILMER")).toBe(false);
  });

  it("test_claim_CS_10_lowercase_role_is_not_recognized", () => {
    // Case-sensitive by design.
    expect(isContributorRole("videographer")).toBe(false);
    expect(isContributorRole("Videographer")).toBe(false);
  });

  it("test_claim_CS_10_nonstring_input_is_not_a_role", () => {
    expect(isContributorRole(null)).toBe(false);
    expect(isContributorRole(undefined)).toBe(false);
    expect(isContributorRole(42)).toBe(false);
    expect(isContributorRole({})).toBe(false);
  });
});

describe("normalizeContributorRole", () => {
  describe("canonical inputs", () => {
    it("test_claim_CS_10_normalize_videographer_returns_canonical_unchanged", () => {
      const r = normalizeContributorRole("VIDEOGRAPHER");
      expect(r.role).toBe("VIDEOGRAPHER");
      expect(r.wasDeprecated).toBe(false);
      expect(r.originalValue).toBe("VIDEOGRAPHER");
    });

    it("test_claim_CS_10_normalize_editor_returns_canonical_unchanged", () => {
      const r = normalizeContributorRole("EDITOR");
      expect(r.role).toBe("EDITOR");
      expect(r.wasDeprecated).toBe(false);
    });
  });

  describe("deprecated alias", () => {
    it("test_claim_CS_10_normalize_filmer_alias_returns_videographer_with_deprecation_flag", () => {
      const r = normalizeContributorRole("FILMER");
      expect(r.role).toBe("VIDEOGRAPHER");
      expect(r.wasDeprecated).toBe(true);
      expect(r.originalValue).toBe("FILMER");
    });
  });

  describe("invalid inputs", () => {
    it("test_claim_CS_10_normalize_unknown_role_throws", () => {
      expect(() => normalizeContributorRole("DIRECTOR")).toThrow(/unknown contributor role/);
    });

    it("test_claim_CS_10_normalize_empty_string_throws", () => {
      expect(() => normalizeContributorRole("")).toThrow(/unknown contributor role/);
    });

    it("test_claim_CS_10_normalize_lowercase_canonical_throws", () => {
      // Case-sensitive: lowercase canonical is NOT accepted. This catches
      // client-bug scenarios where a caller lowercases enum values.
      expect(() => normalizeContributorRole("videographer")).toThrow(/unknown contributor role/);
    });

    it("test_claim_CS_10_normalize_lowercase_alias_throws", () => {
      expect(() => normalizeContributorRole("filmer")).toThrow(/unknown contributor role/);
    });
  });
});
