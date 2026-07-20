/**
 * Time-stamping: attach a trusted time to a receipt, and verify that the token
 * BINDS to the receipt (the gap the audit found, tokens existed but nothing
 * checked they committed to the receipt).
 *
 * A token commits to `canonicalSigningPayload(receipt)`, the exact bytes that
 * were signed, so a verifier can confirm "this receipt existed at time T".
 *
 * Two authorities implement the same tiny interface:
 *   - `TSAClient`    , real RFC 3161 over HTTP (FreeTSA / DigiCert / …).
 *   - `StubTSAClient`, offline, deterministic, for tests and local dev.
 *
 * Verification: for our local/stub tokens we check the imprint here, and ONLY
 * the imprint, there is no authority signature on a local token to check. For
 * an RFC 3161 DER token the messageImprint AND the TSA's CMS signature must be
 * checked against the TSA's CA certificate using standard RFC 3161 tooling,
 * out of scope for the pure, dependency-free SDK, so those are reported as
 * present-and-externally-verifiable rather than falsely asserted valid here.
 *
 * In BOTH cases no authority signature is verified in this module, so every
 * verdict carries `authenticated: false` and no verdict here may be read as an
 * attestation of TIME. See `TimestampVerdict.authenticated`.
 */

import { sha256 } from "./crypto.js";
import { canonicalSigningPayload } from "./receipt.js";
import type { SignedReceipt, TimestampToken } from "./types.js";

export interface TimestampClient {
  timestamp(payload: Uint8Array): Promise<TimestampToken>;
}

/** Hex SHA-256 of the receipt's signed canonical bytes, what a token commits to. */
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
  /**
   * Whether the token's `imprint` FIELD equals this receipt's imprint. This is
   * a statement about the imprint only, NOT about the asserted time, and it is
   * meaningful only in combination with `authenticated`.
   */
  imprintMatches: boolean | null;
  /**
   * Whether a time-stamping AUTHORITY's signature over this token was actually
   * verified here. Always false today: local tokens carry no signature at all,
   * and RFC 3161 DER tokens need the TSA CA certificate and CMS validation that
   * this dependency-free SDK deliberately does not do.
   *
   * This flag exists because the two facts get conflated with dangerous
   * results. `timestamps[]` sits OUTSIDE the signed receipt bytes and
   * `receiptTimestampImprint()` is a public pure function, so ANYONE holding a
   * receipt can compute the correct imprint and fabricate a token around it
   * carrying any `issued_at` and any `tsa` name they like. Reporting such a
   * token as "verified" would let a party backdate a receipt to before an
   * incident, or forward-date it to claim a control was already in place.
   * A matching imprint on an unauthenticated token proves only that someone
   * who knew the receipt hash wrote it down; it is worth nothing as evidence
   * of TIME. Consumers must gate any time claim on `authenticated === true`.
   */
  authenticated: boolean;
  note: string;
}

/**
 * Verify what can actually be verified about each attached token: that its
 * imprint binds to this receipt, and whether any authority signature was
 * checked (see `TimestampVerdict.authenticated`).
 *
 * A mismatched imprint is still a strong tamper signal and is reported as
 * such. A matched imprint on an unauthenticated token is NOT evidence of time.
 */
export function verifyReceiptTimestamps(signed: SignedReceipt): TimestampVerdict[] {
  const expected = receiptTimestampImprint(signed);
  // `timestamps` arrives from an attacker-controlled envelope, so it may be any
  // JSON value. Treat a non-array as "no verifiable tokens" rather than letting
  // `.map is not a function` escape as an exception into the verifier.
  const tokens = Array.isArray(signed.timestamps) ? signed.timestamps : [];
  return tokens.map((t) => {
    const tsa = typeof t?.tsa === "string" ? t.tsa : "(unknown)";
    const raw = typeof t?.timestamp_token === "string" ? t.timestamp_token : "";
    const local = parseLocalToken(raw);
    if (local && typeof local.imprint === "string") {
      const matches = local.imprint.toLowerCase() === expected;
      return {
        tsa,
        format: "local" as const,
        imprintMatches: matches,
        authenticated: false,
        note: matches
          ? "UNAUTHENTICATED local token: the imprint field matches this receipt, but no authority signature was verified, so the asserted time and TSA name are NOT attested and must not be treated as evidence of time"
          : "imprint does NOT match this receipt (possible tampering)",
      };
    }
    // Base64 that isn't our JSON token, assume an RFC 3161 DER TimeStampResp.
    return {
      tsa,
      format: "rfc3161" as const,
      imprintMatches: null,
      authenticated: false,
      note: "RFC 3161 token, NOT verified here: verify the messageImprint and TSA signature against the TSA CA certificate before relying on the time",
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
