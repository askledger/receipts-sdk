/**
 * Time-stamping: attach a trusted time to a receipt, and verify that the token
 * BINDS to the receipt (the gap the audit found — tokens existed but nothing
 * checked they committed to the receipt).
 *
 * A token commits to `canonicalSigningPayload(receipt)` — the exact bytes that
 * were signed — so a verifier can confirm "this receipt existed at time T".
 *
 * Two authorities implement the same tiny interface:
 *   - `TSAClient`     — real RFC 3161 over HTTP (FreeTSA / DigiCert / …).
 *   - `StubTSAClient` — offline, deterministic, for tests and local dev.
 *
 * Verification: for our local/stub tokens we fully check the imprint here. For
 * an RFC 3161 DER token the messageImprint AND the TSA's CMS signature must be
 * checked against the TSA's CA certificate using standard RFC 3161 tooling —
 * out of scope for the pure, dependency-free SDK — so those are reported as
 * present-and-externally-verifiable rather than falsely asserted valid here.
 */

import { sha256 } from "./crypto.js";
import { canonicalSigningPayload } from "./receipt.js";
import type { SignedReceipt, TimestampToken } from "./types.js";

export interface TimestampClient {
  timestamp(payload: Uint8Array): Promise<TimestampToken>;
}

/** Hex SHA-256 of the receipt's signed canonical bytes — what a token commits to. */
export function receiptTimestampImprint(signed: SignedReceipt): string {
  return sha256(canonicalSigningPayload(signed.receipt));
}

/**
 * Attach a time-stamp token to a receipt. Returns a new SignedReceipt with the
 * token appended to `timestamps`; the input is not mutated.
 */
export async function timestampReceipt(
  signed: SignedReceipt,
  client: TimestampClient
): Promise<SignedReceipt> {
  const token = await client.timestamp(canonicalSigningPayload(signed.receipt));
  return { ...signed, timestamps: [...(signed.timestamps ?? []), token] };
}

export type TimestampFormat = "local" | "rfc3161" | "unknown";

export interface TimestampVerdict {
  tsa: string;
  format: TimestampFormat;
  /** true/false for tokens verifiable here; null for RFC 3161 (verify externally). */
  imprintMatches: boolean | null;
  note: string;
}

/**
 * Verify that each attached token binds to this receipt.
 */
export function verifyReceiptTimestamps(signed: SignedReceipt): TimestampVerdict[] {
  const expected = receiptTimestampImprint(signed);
  return (signed.timestamps ?? []).map((t) => {
    const local = parseLocalToken(t.timestamp_token);
    if (local && typeof local.imprint === "string") {
      const matches = local.imprint.toLowerCase() === expected;
      return {
        tsa: t.tsa,
        format: "local",
        imprintMatches: matches,
        note: matches ? "imprint binds to this receipt" : "imprint does NOT match this receipt",
      };
    }
    // Base64 that isn't our JSON token — assume an RFC 3161 DER TimeStampResp.
    return {
      tsa: t.tsa,
      format: "rfc3161",
      imprintMatches: null,
      note: "RFC 3161 token — verify the messageImprint and TSA signature against the TSA CA certificate",
    };
  });
}

function parseLocalToken(b64: string): { imprint?: unknown } | null {
  try {
    const obj = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return obj && typeof obj === "object" ? (obj as { imprint?: unknown }) : null;
  } catch {
    return null;
  }
}
