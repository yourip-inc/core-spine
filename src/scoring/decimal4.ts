/**
 * Decimal4 — deterministic 4-decimal-place arithmetic backed by BigInt.
 *
 * PATENT-CRITICAL. Used by Claim CS-3 (effective vote mass formula, T1-S1-B-02).
 * Engineering PRD §8.1 mandates "Integer-safe representation of time (milliseconds),
 * currency (cents), and basis-point values. No floating-point values in signed or
 * replay-critical payloads."
 *
 * Representation: every Decimal4 value is stored as a BigInt at scale 10_000.
 * For example:
 *   Decimal4.fromInteger(3)          -> raw 30_000n  (= 3.0000)
 *   Decimal4.parse("2.6667")         -> raw 26_667n
 *   Decimal4.parse("0")              -> raw 0n       (= 0.0000)
 *
 * Division rounds HALF-AWAY-FROM-ZERO (banker's rounding is the usual "safer"
 * default, but half-away is what the patent embodiment example in paragraph 333
 * produces when multiplying weights like [2.0, 1.0, 1.0] and rounding to 4dp,
 * and it matches the "2.6666 (rounded to 4dp)" fixture called out in
 * T1-S1-B-02 AC). Matching this rounding convention across all downstream
 * tracks (T5 scoring, T6 rubric widget) is mandatory — see
 * docs/scoring-model-requirements.md.
 *
 * IMPORTANT: The AC example "[2.0, 1.0, 1.0] produces n_eff = 2.6666" rounds
 * DOWN, not half-away. 2.6666... in mathematical form is 8/3 = 2.666666...;
 * rounded to 4dp half-away gives 2.6667, truncate gives 2.6666. The AC says
 * 2.6666. So the AC is calling for TRUNCATED division (floor for positives),
 * i.e. the fifth decimal digit is dropped, not rounded. See Decimal4.div().
 */

const SCALE = 10_000n; // 4 decimal places
const SCALE_DIGITS = 4;

export class Decimal4 {
  readonly raw: bigint;

  private constructor(raw: bigint) {
    this.raw = raw;
  }

  static readonly ZERO = new Decimal4(0n);

  /** Construct from an integer N — result is N.0000. */
  static fromInteger(n: number | bigint): Decimal4 {
    const b = typeof n === "bigint" ? n : BigInt(n);
    return new Decimal4(b * SCALE);
  }

  /** Construct from a raw scaled BigInt (already at scale 10_000). */
  static fromRaw(raw: bigint): Decimal4 {
    return new Decimal4(raw);
  }

  /**
   * Parse a decimal string. Accepted forms:
   *   "0", "3", "2.5", "-1.2345", "0.0001"
   * Rejects: non-numeric input, more than 4 decimal places, exponent notation,
   * leading '+', whitespace.
   */
  static parse(s: string): Decimal4 {
    if (!/^-?(?:\d+)(?:\.\d{1,4})?$/.test(s)) {
      throw new Error(`Decimal4.parse: invalid input ${JSON.stringify(s)} (must match -?DIGITS(.DIGITS{1,4})?)`);
    }
    const neg = s.startsWith("-");
    const body = neg ? s.slice(1) : s;
    const [intPart, fracPart = ""] = body.split(".") as [string, string?];
    const padded = fracPart.padEnd(SCALE_DIGITS, "0");
    const raw = BigInt(intPart) * SCALE + BigInt(padded);
    return new Decimal4(neg ? -raw : raw);
  }

  /** Formatted decimal string, always with exactly 4 fractional digits. */
  toString(): string {
    const neg = this.raw < 0n;
    const abs = neg ? -this.raw : this.raw;
    const intPart = abs / SCALE;
    const fracPart = abs % SCALE;
    return (neg ? "-" : "") + intPart.toString() + "." + fracPart.toString().padStart(SCALE_DIGITS, "0");
  }

  /** Sum. */
  add(other: Decimal4): Decimal4 {
    return new Decimal4(this.raw + other.raw);
  }

  /** Difference. */
  sub(other: Decimal4): Decimal4 {
    return new Decimal4(this.raw - other.raw);
  }

  /**
   * Product. `(a.raw / S) * (b.raw / S) = (a.raw * b.raw) / S^2`, so we scale
   * back by dividing by S once. Division is TRUNCATED per B-02 AC.
   */
  mul(other: Decimal4): Decimal4 {
    const prod = this.raw * other.raw;
    // Truncate toward zero.
    return new Decimal4(truncDiv(prod, SCALE));
  }

  /**
   * Quotient. `(a.raw / S) / (b.raw / S) = a.raw / b.raw`, but we want the
   * result at scale S, so we compute `(a.raw * S) / b.raw` and truncate.
   */
  div(other: Decimal4): Decimal4 {
    if (other.raw === 0n) {
      throw new Error("Decimal4.div: division by zero");
    }
    return new Decimal4(truncDiv(this.raw * SCALE, other.raw));
  }

  /** Comparison helpers. */
  eq(other: Decimal4): boolean { return this.raw === other.raw; }
  lt(other: Decimal4): boolean { return this.raw < other.raw; }
  lte(other: Decimal4): boolean { return this.raw <= other.raw; }
  gt(other: Decimal4): boolean { return this.raw > other.raw; }
  gte(other: Decimal4): boolean { return this.raw >= other.raw; }
  isZero(): boolean { return this.raw === 0n; }

  /**
   * Floor to nearest integer. Useful for converting a Decimal4 to a plain
   * integer basis-point value (e.g., stability_score). Truncates toward zero.
   */
  toTruncatedInteger(): bigint {
    return truncDiv(this.raw, SCALE);
  }

  /** Multiply by a plain integer without going through mul() — no scaling needed. */
  mulInteger(n: number | bigint): Decimal4 {
    const b = typeof n === "bigint" ? n : BigInt(n);
    return new Decimal4(this.raw * b);
  }
}

/**
 * Truncate-toward-zero integer division. JavaScript's `/` on BigInt rounds
 * toward zero already for positive values but also rounds toward zero for
 * negative values (NOT floor). That's exactly what we want.
 *
 * We assert divisor != 0 at call sites.
 */
function truncDiv(numerator: bigint, denominator: bigint): bigint {
  // BigInt / is truncated toward zero in JS. This helper exists to make intent
  // explicit in the code and to give us one place to swap in HALF_AWAY rounding
  // if a future scoring_version requires it.
  return numerator / denominator;
}
