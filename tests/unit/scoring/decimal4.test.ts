/**
 * Decimal4 unit tests.
 *
 * Patent claims: 3 (effective vote mass arithmetic), 14 (integer-only canonical JSON).
 * Story: T1-S1-B-02.
 *
 * File path: tests/unit/scoring/... → patent-adjacent → uses test_claim_N_* naming.
 */

import { describe, it, expect } from "vitest";
import { Decimal4 } from "../../../src/scoring/decimal4.js";

describe("Decimal4", () => {
  describe("parsing and formatting", () => {
    it("test_claim_14_decimal4_parses_simple_values", () => {
      expect(Decimal4.parse("0").toString()).toBe("0.0000");
      expect(Decimal4.parse("3").toString()).toBe("3.0000");
      expect(Decimal4.parse("-1").toString()).toBe("-1.0000");
      expect(Decimal4.parse("2.5").toString()).toBe("2.5000");
      expect(Decimal4.parse("-1.2345").toString()).toBe("-1.2345");
      expect(Decimal4.parse("0.0001").toString()).toBe("0.0001");
    });

    it("test_claim_14_decimal4_rejects_more_than_four_decimal_places", () => {
      expect(() => Decimal4.parse("1.23456")).toThrow();
    });

    it("test_claim_14_decimal4_rejects_non_numeric_input", () => {
      expect(() => Decimal4.parse("abc")).toThrow();
      expect(() => Decimal4.parse("1e5")).toThrow();  // no exponent notation
      expect(() => Decimal4.parse("+1")).toThrow();   // no leading +
      expect(() => Decimal4.parse(" 1 ")).toThrow();  // no whitespace
    });

    it("test_claim_14_decimal4_fromInteger_roundtrips", () => {
      expect(Decimal4.fromInteger(0).toString()).toBe("0.0000");
      expect(Decimal4.fromInteger(42).toString()).toBe("42.0000");
      expect(Decimal4.fromInteger(-7).toString()).toBe("-7.0000");
      expect(Decimal4.fromInteger(1_000_000n).toString()).toBe("1000000.0000");
    });
  });

  describe("arithmetic", () => {
    it("test_claim_3_decimal4_addition_is_exact", () => {
      const a = Decimal4.parse("1.5");
      const b = Decimal4.parse("2.5");
      expect(a.add(b).toString()).toBe("4.0000");
    });

    it("test_claim_3_decimal4_subtraction_is_exact", () => {
      expect(Decimal4.parse("3.0").sub(Decimal4.parse("1.25")).toString()).toBe("1.7500");
    });

    it("test_claim_3_decimal4_multiplication_uses_scale_correction", () => {
      // 2 * 3 = 6
      expect(Decimal4.parse("2").mul(Decimal4.parse("3")).toString()).toBe("6.0000");
      // 1.5 * 1.5 = 2.25
      expect(Decimal4.parse("1.5").mul(Decimal4.parse("1.5")).toString()).toBe("2.2500");
    });

    it("test_claim_3_decimal4_division_truncates_toward_zero", () => {
      // 16 / 6 = 2.6666... → truncates to 2.6666 (B-02 AC)
      expect(Decimal4.parse("16").div(Decimal4.parse("6")).toString()).toBe("2.6666");
      // 1 / 3 = 0.3333... → 0.3333
      expect(Decimal4.parse("1").div(Decimal4.parse("3")).toString()).toBe("0.3333");
      // Negative: -16 / 6 = -2.6666... → truncates toward zero → -2.6666
      expect(Decimal4.parse("-16").div(Decimal4.parse("6")).toString()).toBe("-2.6666");
    });

    it("test_claim_3_decimal4_division_by_zero_throws", () => {
      expect(() => Decimal4.parse("1").div(Decimal4.parse("0"))).toThrow(/division by zero/);
    });

    it("test_claim_3_decimal4_mulInteger_is_exact", () => {
      expect(Decimal4.parse("2.5").mulInteger(4).toString()).toBe("10.0000");
      expect(Decimal4.parse("1.2345").mulInteger(100).toString()).toBe("123.4500");
    });
  });

  describe("comparison", () => {
    it("test_claim_3_decimal4_comparisons_match_string_order_for_equal_scale", () => {
      expect(Decimal4.parse("1.5").lt(Decimal4.parse("1.6"))).toBe(true);
      expect(Decimal4.parse("1.5").gt(Decimal4.parse("1.4"))).toBe(true);
      expect(Decimal4.parse("1.5").eq(Decimal4.parse("1.5"))).toBe(true);
      expect(Decimal4.parse("0").isZero()).toBe(true);
      expect(Decimal4.parse("0.0001").isZero()).toBe(false);
    });
  });

  describe("determinism", () => {
    it("test_claim_3_decimal4_same_inputs_produce_identical_output", () => {
      const run = (): string => {
        const ws = ["2", "1", "1"].map(Decimal4.parse);
        let s = Decimal4.ZERO;
        let s2 = Decimal4.ZERO;
        for (const w of ws) { s = s.add(w); s2 = s2.add(w.mul(w)); }
        return s.mul(s).div(s2).toString();
      };
      const a = run();
      const b = run();
      const c = run();
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(a).toBe("2.6666"); // B-02 AC fixture
    });

    it("test_claim_3_decimal4_toTruncatedInteger_drops_fractional_part", () => {
      expect(Decimal4.parse("3.9999").toTruncatedInteger()).toBe(3n);
      expect(Decimal4.parse("4.0000").toTruncatedInteger()).toBe(4n);
      expect(Decimal4.parse("0.0001").toTruncatedInteger()).toBe(0n);
      expect(Decimal4.parse("-1.9999").toTruncatedInteger()).toBe(-1n); // toward zero
    });
  });
});
