/**
 * Canonical JSON serialization for YouRip Core Spine.
 *
 * PATENT-CRITICAL. Referenced by Claims 1, 14, 21.
 * API Contract §8.1 (Protocol Requirements) and Flag 3 (Canonical JSON as Shared Authority).
 *
 * Rules (exact, binding for all T1-T9 implementations):
 *   1. Object keys sorted lexicographically (UTF-16 code unit order, which is what
 *      JS Array.sort() does by default — same ordering as Python sorted(), Go sort.Strings).
 *   2. Fields with value `null` or `undefined` are OMITTED entirely.
 *   3. No floating-point numbers. Numbers must be JS safe integers OR BigInt.
 *      Amounts/times/basis-points arriving as strings are permitted ONLY if they
 *      are integer-valued strings that round-trip via BigInt.
 *   4. Unknown fields are handled by the schema layer (zod), not here. This module
 *      canonicalizes whatever tree it's given — schema rejection happens earlier.
 *   5. Output is UTF-8 bytes with no whitespace, no trailing newline.
 *
 * The event_hash for every signed event is computed over the UTF-8 bytes
 * produced by `canonicalBytes`. Any downstream track that computes a different
 * byte sequence for the same logical event will produce a different event_hash
 * and audit replay (Claim 22) will fail silently. This module MUST NOT change
 * its byte output for any given input without a coordinated version bump across
 * all downstream tracks. See SPEC-CANONICAL-JSON-VERSION.md.
 */

export class CanonicalJsonError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`[canonical-json] ${path}: ${message}`);
    this.name = "CanonicalJsonError";
  }
}

/**
 * Values allowed inside a canonicalizable tree.
 * Notably absent: number (for non-safe integers), Date, RegExp, Symbol, Map, Set, functions.
 */
export type CanonicalValue =
  | string
  | boolean
  | bigint
  | number // only safe integers — enforced at runtime
  | null
  | undefined
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

/**
 * Serialize `value` to the canonical UTF-8 byte sequence.
 * This is the input to event_hash for every signed Core Spine event.
 */
export function canonicalBytes(value: CanonicalValue): Uint8Array {
  const text = canonicalString(value);
  return new TextEncoder().encode(text);
}

/**
 * Serialize `value` to the canonical UTF-8 string (no whitespace, sorted keys, null-omitted).
 */
export function canonicalString(value: CanonicalValue): string {
  return write(value, "$");
}

function write(value: CanonicalValue, path: string): string {
  // null / undefined at the root are invalid — they're only meaningful as object field
  // omissions, which are handled inside writeObject().
  if (value === null || value === undefined) {
    throw new CanonicalJsonError(path, "null/undefined is not a valid root or array element");
  }

  if (typeof value === "string") return writeString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString(10);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(path, `non-finite number: ${value}`);
    }
    if (!Number.isInteger(value)) {
      throw new CanonicalJsonError(
        path,
        `float not allowed (got ${value}); use BigInt for large values or a decimal-string schema field for fractional amounts`,
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalJsonError(
        path,
        `number ${value} exceeds safe-integer range; use BigInt (${value}n)`,
      );
    }
    return value.toString(10);
  }

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const elt = value[i];
      // arrays do not elide null/undefined — that would change length and shift indexes
      if (elt === null || elt === undefined) {
        throw new CanonicalJsonError(
          `${path}[${i}]`,
          "null/undefined in array is not allowed (would shift subsequent indices on re-serialize)",
        );
      }
      parts.push(write(elt, `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }

  if (typeof value === "object") {
    // Only plain objects (Object.prototype or null prototype) are serializable.
    // Rejects Date, RegExp, Map, Set, Buffer, URL, TypedArrays, class
    // instances, etc. — all of which would survive Object.keys()===[] and
    // silently emit "{}" instead of throwing.
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      throw new CanonicalJsonError(
        path,
        `only plain objects are serializable; got ${value.constructor?.name ?? "non-plain object"}`,
      );
    }
    return writeObject(value as { [key: string]: CanonicalValue }, path);
  }

  throw new CanonicalJsonError(path, `unsupported value type: ${typeof value}`);
}

function writeObject(obj: { [key: string]: CanonicalValue }, path: string): string {
  // Sort keys lexicographically by UTF-16 code units (default JS sort on strings).
  // This is the same ordering used by Go's sort.Strings on []string with ASCII keys,
  // and by Python's sorted() on str. All Core Spine field names are ASCII lowercase
  // with underscores, so there's no normalization question.
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    // Null omission: drop fields whose value is null or undefined.
    if (v === null || v === undefined) continue;
    parts.push(`${writeString(key)}:${write(v, `${path}.${key}`)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Canonical string encoding per RFC 8785 §3.2.2.2, restricted to the
 * escape set that keeps JSON strings deterministic. We escape:
 *   \"  \\  and control characters U+0000..U+001F as \uXXXX.
 * We do NOT escape U+007F (DEL) or non-ASCII — they pass through as UTF-8 bytes.
 */
function writeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x22) {
      out += '\\"';
    } else if (ch === 0x5c) {
      out += "\\\\";
    } else if (ch === 0x08) {
      out += "\\b";
    } else if (ch === 0x09) {
      out += "\\t";
    } else if (ch === 0x0a) {
      out += "\\n";
    } else if (ch === 0x0c) {
      out += "\\f";
    } else if (ch === 0x0d) {
      out += "\\r";
    } else if (ch < 0x20) {
      out += "\\u" + ch.toString(16).padStart(4, "0");
    } else {
      out += s[i];
    }
  }
  return out + '"';
}
