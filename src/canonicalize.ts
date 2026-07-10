/**
 * RFC 8785 JSON Canonicalization Scheme (JCS)
 *
 * Produces a deterministic byte representation of any JSON value, regardless
 * of key ordering, whitespace, or numeric formatting differences. This is
 * essential because a regulator running an independent verifier must compute
 * the same hash we did, without canonicalization, every implementation drifts.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc8785
 */

import * as canonicalizeMod from "canonicalize";

// The `canonicalize` package is CommonJS and exports a single function.
// Under Node16/ESM TypeScript, the function lives on .default.
const canonicalizeImpl: (value: unknown) => string | undefined =
  (canonicalizeMod as unknown as { default: (v: unknown) => string | undefined }).default
  ?? (canonicalizeMod as unknown as (v: unknown) => string | undefined);

/**
 * Canonicalize a JSON-serializable value per RFC 8785.
 *
 * Returns the canonical JSON string. Throws if value is not JSON-serializable
 * or contains unsupported types (functions, symbols, undefined values).
 *
 * @param value - any JSON-serializable value
 * @returns canonical JSON string
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) {
    throw new Error("Cannot canonicalize undefined");
  }
  const result = canonicalizeImpl(value);
  if (result === undefined) {
    throw new Error("Canonicalization returned undefined, value not JSON-serializable");
  }
  return result;
}

/**
 * Canonicalize and return as a UTF-8 byte buffer suitable for hashing.
 */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
