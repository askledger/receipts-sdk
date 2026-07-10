/**
 * Cryptographic primitives, hashing and signing.
 *
 * Algorithms:
 *   - SHA-256 (via @noble/hashes)
 *   - Ed25519 EdDSA signatures (via @noble/ed25519)
 *
 * In production, signing keys are HSM-backed (FIPS 140-3 Level 3). For local
 * development and the SDK reference implementation, keys live in JSON files
 * under .ledger/keys/, never use these for real customer data.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import { randomBytes, webcrypto } from "node:crypto";
import type { KeyPair } from "./types.js";

// Polyfill globalThis.crypto for environments where it isn't auto-set.
// @noble/ed25519 v2 needs crypto.getRandomValues. Node 19+ sets globalThis.crypto
// automatically, but Node 18 and some vitest workers leave it undefined.
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as unknown as { crypto: typeof webcrypto }).crypto = webcrypto;
}

// Required by @noble/ed25519 v2 to enable synchronous Ed25519 ops on Node.
// In v2.x, the sync SHA-512 must be installed via etc.sha512Sync, which
// accepts variadic byte arrays and concatenates them.
function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
(ed.etc as { sha512Sync: (...m: Uint8Array[]) => Uint8Array }).sha512Sync = (
  ...m: Uint8Array[]
) => sha512(concatBytes(...m));

// ---------- HASHING ----------

/**
 * Compute SHA-256 of a Uint8Array, return hex-lowercase string.
 */
export function sha256(bytes: Uint8Array): string {
  return Buffer.from(sha256Fn(bytes)).toString("hex");
}

/**
 * Convenience: compute SHA-256 of a UTF-8 string.
 */
export function sha256String(s: string): string {
  return sha256(new TextEncoder().encode(s));
}

// ---------- KEY MANAGEMENT ----------

/**
 * Generate a new Ed25519 key pair.
 *
 * Returns the keypair in JSON form with base64-encoded keys.
 * In production, the private key never leaves the HSM.
 */
export function generateKeyPair(): KeyPair {
  // Use Node's crypto.randomBytes directly instead of ed.utils.randomPrivateKey().
  // Noble's randomPrivateKey depends on globalThis.crypto.getRandomValues which is
  // not consistently available across Node versions and vitest worker contexts.
  // An Ed25519 private key is simply 32 cryptographically random bytes.
  const privateKey = new Uint8Array(randomBytes(32));
  const publicKey = ed.getPublicKey(privateKey);
  const kid = `dev-${Buffer.from(randomBytes(6)).toString("hex")}`;

  return {
    kid,
    public_key: Buffer.from(publicKey).toString("base64"),
    private_key: Buffer.from(privateKey).toString("base64"),
    algorithm: "EdDSA",
    curve: "ed25519",
    created_at: new Date().toISOString(),
  };
}

// ---------- SIGNING ----------

/**
 * Sign a payload with the given private key. Returns the base64-encoded signature.
 *
 * The payload is the canonical bytes of the receipt (without the signatures block).
 */
export function sign(payload: Uint8Array, keypair: KeyPair): string {
  const privateKey = Buffer.from(keypair.private_key, "base64");
  if (privateKey.length !== 32) {
    throw new Error(`Invalid Ed25519 private key length: ${privateKey.length}`);
  }
  const signature = ed.sign(payload, privateKey);
  return Buffer.from(signature).toString("base64");
}

/**
 * Verify a signature against a payload and public key.
 *
 * Returns true if the signature is cryptographically valid.
 */
export function verify(
  payload: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, "base64");
    const publicKey = Buffer.from(publicKeyBase64, "base64");
    if (publicKey.length !== 32) {
      throw new Error(`Invalid Ed25519 public key length: ${publicKey.length}`);
    }
    if (signature.length !== 64) {
      throw new Error(`Invalid Ed25519 signature length: ${signature.length}`);
    }
    return ed.verify(signature, payload, publicKey);
  } catch {
    return false;
  }
}
