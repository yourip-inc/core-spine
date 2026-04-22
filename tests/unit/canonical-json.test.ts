/**
 * Canonical JSON serializer tests.
 *
 * Claim coverage: test_claim_1_*, test_claim_14_*, test_claim_21_*
 * These tests guard Flag 3 of the API Contract: if this module's byte output
 * ever drifts, every downstream track's event_hash silently desyncs from T1
 * and audit replay (Claim 22) breaks. These fixtures are frozen and MUST NOT
 * be updated without a coordinated version bump of the canonical-JSON spec
 * across T1-T9.
 */

import { describe, it, expect } from "vitest";
import { canonicalString, canonicalBytes, CanonicalJsonError } from "../../src/canonical/canonical-json.js";

describe("canonical-json", () => {
  describe("test_claim_1_deterministic_serialization", () => {
    it("sorts object keys lexicographically", () => {
      expect(canonicalString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
      expect(canonicalString({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
    });

    it("produces identical output for semantically equal objects in different input orders", () => {
      const a = { rubric_version: "rubric_1.0", weight_bp: 5000, criterion_key: "alpha" };
      const b = { criterion_key: "alpha", rubric_version: "rubric_1.0", weight_bp: 5000 };
      const c = { weight_bp: 5000, criterion_key: "alpha", rubric_version: "rubric_1.0" };
      expect(canonicalString(a)).toBe(canonicalString(b));
      expect(canonicalString(b)).toBe(canonicalString(c));
    });

    it("sorts keys recursively at every nesting level", () => {
      const nested = { z: { b: 1, a: 2 }, a: { d: 3, c: 4 } };
      expect(canonicalString(nested)).toBe('{"a":{"c":4,"d":3},"z":{"a":2,"b":1}}');
    });

    it("produces a golden canonical string for a realistic rubric payload", () => {
      const rubric = {
        rubric_version: "rubric_1.0",
        name: "Base Rubric",
        criteria: [
          { criterion_key: "execution", weight_bp: 6000, scale_min_bp: 0, scale_max_bp: 10000, sort_order: 0 },
          { criterion_key: "creativity", weight_bp: 4000, scale_min_bp: 0, scale_max_bp: 10000, sort_order: 1 },
        ],
      };
      // FROZEN GOLDEN — do not update without cross-track coordination.
      const expected =
        '{"criteria":[' +
          '{"criterion_key":"execution","scale_max_bp":10000,"scale_min_bp":0,"sort_order":0,"weight_bp":6000},' +
          '{"criterion_key":"creativity","scale_max_bp":10000,"scale_min_bp":0,"sort_order":1,"weight_bp":4000}' +
        '],"name":"Base Rubric","rubric_version":"rubric_1.0"}';
      expect(canonicalString(rubric)).toBe(expected);
    });
  });

  describe("test_claim_1_null_omission", () => {
    it("omits fields whose value is null", () => {
      expect(canonicalString({ a: 1, b: null })).toBe('{"a":1}');
    });

    it("omits fields whose value is undefined", () => {
      expect(canonicalString({ a: 1, b: undefined })).toBe('{"a":1}');
    });

    it("still emits empty object when every field is null/undefined", () => {
      expect(canonicalString({ a: null, b: undefined })).toBe("{}");
    });

    it("treats a field with value 0 as present (0 is not nullish)", () => {
      expect(canonicalString({ a: 0 })).toBe('{"a":0}');
    });

    it("rejects null/undefined as array elements (would shift indices on re-serialize)", () => {
      expect(() => canonicalString([1, null as never, 2])).toThrow(CanonicalJsonError);
    });
  });

  describe("test_claim_14_integer_only_numbers", () => {
    it("accepts safe integer numbers", () => {
      expect(canonicalString({ ms: 1_700_000_000_000 })).toBe('{"ms":1700000000000}');
      expect(canonicalString({ bp: 10000 })).toBe('{"bp":10000}');
      expect(canonicalString({ n: 0 })).toBe('{"n":0}');
      expect(canonicalString({ n: -1 })).toBe('{"n":-1}');
    });

    it("rejects floating-point numbers", () => {
      expect(() => canonicalString({ x: 1.5 })).toThrow(/float not allowed/);
      expect(() => canonicalString({ x: 0.1 })).toThrow(/float not allowed/);
    });

    it("rejects NaN and Infinity", () => {
      expect(() => canonicalString({ x: NaN })).toThrow(/non-finite/);
      expect(() => canonicalString({ x: Infinity })).toThrow(/non-finite/);
    });

    it("rejects numbers outside safe-integer range", () => {
      expect(() => canonicalString({ x: 2 ** 53 })).toThrow(/safe-integer/);
    });

    it("accepts BigInt for large integer values", () => {
      expect(canonicalString({ x: 9_007_199_254_740_993n })).toBe('{"x":9007199254740993}');
      expect(canonicalString({ x: 1n })).toBe('{"x":1}');
      expect(canonicalString({ x: -1n })).toBe('{"x":-1}');
    });
  });

  describe("test_claim_14_string_escaping", () => {
    it("escapes quote and backslash", () => {
      expect(canonicalString({ s: 'a"b' })).toBe('{"s":"a\\"b"}');
      expect(canonicalString({ s: "a\\b" })).toBe('{"s":"a\\\\b"}');
    });

    it("escapes control characters as short or \\uXXXX forms", () => {
      expect(canonicalString({ s: "\n" })).toBe('{"s":"\\n"}');
      expect(canonicalString({ s: "\t" })).toBe('{"s":"\\t"}');
      expect(canonicalString({ s: "\u0001" })).toBe('{"s":"\\u0001"}');
    });

    it("passes through non-ASCII as-is (UTF-8 bytes)", () => {
      // "café" — ASCII letters then é (U+00E9). No escape; the TextEncoder
      // handles UTF-8 byte production at the bytes layer.
      expect(canonicalString({ s: "café" })).toBe('{"s":"café"}');
    });
  });

  describe("test_claim_21_byte_level_determinism", () => {
    it("two canonicalizations of the same object produce byte-identical output", () => {
      const obj = { rubric_version: "rubric_1.0", criteria: [{ criterion_key: "a", weight_bp: 10000 }] };
      const a = canonicalBytes(obj);
      const b = canonicalBytes(obj);
      expect(a).toEqual(b);
    });

    it("shuffled-key variants produce byte-identical output", () => {
      const a = canonicalBytes({ z: 1, y: { b: 2, a: 1 }, x: [3, 2, 1] });
      const b = canonicalBytes({ x: [3, 2, 1], y: { a: 1, b: 2 }, z: 1 });
      expect(a).toEqual(b);
    });
  });

  describe("test_claim_21_rejects_unserializable_types", () => {
    it("rejects Date (use createdAtUtcMs BigInt instead)", () => {
      expect(() => canonicalString({ d: new Date() as never })).toThrow(CanonicalJsonError);
    });

    it("rejects RegExp", () => {
      expect(() => canonicalString({ x: /foo/ as never })).toThrow(CanonicalJsonError);
    });

    it("rejects Map", () => {
      expect(() => canonicalString({ x: new Map() as never })).toThrow(CanonicalJsonError);
    });

    it("rejects Set", () => {
      expect(() => canonicalString({ x: new Set() as never })).toThrow(CanonicalJsonError);
    });

    it("rejects Symbol", () => {
      expect(() => canonicalString({ x: Symbol("test") as never })).toThrow(CanonicalJsonError);
    });

    it("rejects function", () => {
      expect(() => canonicalString({ x: (() => {}) as never })).toThrow(CanonicalJsonError);
    });

    it("accepts Object.create(null) (null-prototype is intentional)", () => {
      // The prototype-chain guard explicitly allows proto===null so
      // null-prototype objects behave identically to plain object literals.
      // This guards against a future refactor tightening the check to
      // proto===Object.prototype only, which would silently break callers
      // using Object.create(null) as a safe-default bag.
      const empty = Object.create(null);
      expect(canonicalString(empty)).toBe("{}");

      const populated = Object.create(null);
      populated.a = 1;
      populated.b = 2;
      expect(canonicalString(populated)).toBe('{"a":1,"b":2}');
    });

    it("rejects root null / undefined", () => {
      expect(() => canonicalString(null as never)).toThrow(CanonicalJsonError);
      expect(() => canonicalString(undefined as never)).toThrow(CanonicalJsonError);
    });
  });
});
