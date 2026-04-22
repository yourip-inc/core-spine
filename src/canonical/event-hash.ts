/**
 * Event hash and signing primitives for Core Spine.
 *
 * PATENT-CRITICAL. Referenced by Claims 1, 13A, 14, 21, 22.
 * API Contract §8.1 / Flag 1 (rating event validation order: hash recomputation BEFORE signature verification).
 *
 * The event_hash is sha-256 of the canonical JSON bytes of the event payload
 * (excluding the signature envelope itself). The signature is Ed25519 over
 * the 32-byte event_hash, NOT over the raw JSON — per API Contract §8.1
 * "Signature over digest: the cryptographic signature is computed over the
 * canonical-byte event hash."
 */

import { sha256 } from "@noble/hashes/sha256";
import * as ed25519 from "@noble/ed25519";
import { canonicalBytes, type CanonicalValue } from "./canonical-json.js";

/**
 * Compute event_hash as lowercase hex of sha-256 over canonical bytes.
 * Hex (not base64) for stable appearance in logs, audit bundles, and URL params.
 */
export function eventHash(payload: CanonicalValue): string {
  const bytes = canonicalBytes(payload);
  const digest = sha256(bytes);
  return toHex(digest);
}

/**
 * Verify an Ed25519 signature over an event_hash.
 *
 * Arguments are all hex strings to match how they appear in signed event payloads
 * on the wire. Throws on malformed hex; returns false for valid-format but
 * cryptographically invalid signatures.
 */
export async function verifyEventSignature(
  publicKeyHex: string,
  eventHashHex: string,
  signatureHex: string,
): Promise<boolean> {
  const pk = fromHex(publicKeyHex, 32);
  const hash = fromHex(eventHashHex, 32);
  const sig = fromHex(signatureHex, 64);
  return ed25519.verifyAsync(sig, hash, pk);
}

/**
 * Test-only helper. Real production signing lives on rater/judge client devices;
 * their private keys never touch Core Spine. This function exists so integration
 * tests can produce valid signed events against a fixture keypair.
 */
export async function signEventHashForTesting(
  privateKeyHex: string,
  eventHashHex: string,
): Promise<string> {
  const sk = fromHex(privateKeyHex, 32);
  const hash = fromHex(eventHashHex, 32);
  const sig = await ed25519.signAsync(hash, sk);
  return toHex(sig);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string, expectedLen: number): Uint8Array {
  if (hex.length !== expectedLen * 2) {
    throw new Error(`expected ${expectedLen}-byte hex (${expectedLen * 2} chars), got ${hex.length}`);
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error("hex must be lowercase [0-9a-f]");
  }
  const out = new Uint8Array(expectedLen);
  for (let i = 0; i < expectedLen; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
