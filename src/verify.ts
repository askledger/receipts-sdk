/**
 * Receipt verification, independent of any Ledger server.
 *
 * A regulator or customer holding only:
 *   - the SignedReceipt
 *   - the public key for the kid that signed it
 *   - (optionally) the previous receipt to check chain continuity
 *
 * can verify cryptographic integrity end-to-end with no Ledger dependency.
 * This is the property that makes AskLedger regulator-grade.
 */

import { sha256, verify as verifySig } from "./crypto.js";
import {
  canonicalSigningPayload,
  canonicalHashingPayload,
} from "./receipt.js";
import { recordVerify } from "./observability/otel.js";
import { verifyReceiptTimestamps } from "./timestamp.js";
import { GENESIS_HASH, type SignedReceipt } from "./types.js";

export interface VerifyResult {
  valid: boolean;
  checks: {
    canonical_hash_matches: boolean;
    signature_valid: boolean;
    chain_link_valid?: boolean;
    /**
     * Whether this receipt's CHAIN POSITION was actually attested here. True
     * when genesis was checked or a predecessor was supplied; false for a
     * mid-chain receipt verified alone (its signature/hash are still valid, but
     * its place in the chain was not checked, supply the predecessor to attest).
     */
    chain_position_attested: boolean;
    /**
     * Whether attached time-stamp tokens bind to this receipt. Set to FALSE
     * when a parseable token's imprint does not match (a tamper signal worth
     * failing on). It is deliberately NOT set to true for a matching but
     * UNAUTHENTICATED token: `timestamps[]` lives outside the signed bytes and
     * the imprint is publicly computable, so an attacker can mint a token with
     * the right imprint and an arbitrary `issued_at`/`tsa`. Reporting a passing
     * check there would present attacker-chosen time as verified evidence.
     * See `timestamp_time_attested`.
     */
    timestamp_imprint_matches?: boolean;
    /**
     * Whether the RECEIPT'S TIME was actually attested by a time-stamping
     * authority whose signature was verified. Only set when the receipt carries
     * timestamps at all; false means "tokens are present but prove nothing
     * about when this receipt existed". Never true in this SDK today, no
     * authority signature is checked here (see timestamp.ts).
     */
    timestamp_time_attested?: boolean;
  };
  errors: string[];
}

/**
 * Shape guard for the receipt envelope.
 *
 * A verifier is fed bytes by the party it is meant to hold accountable, so
 * every field here is attacker-controlled and may be missing, null, or of the
 * wrong type. Before this guard existed, nine such shapes escaped as thrown
 * TypeErrors (`signed.signatures is not iterable`, `Cannot read properties of
 * undefined (reading 'chain_height')`, …). In any service wrapping the SDK
 * that surfaces as a 500 / "verifier error", which gets triaged as an
 * infrastructure fault, exactly the wrong outcome: a malformed envelope is
 * evidence of tampering and must be reported as `valid: false`, loudly and
 * attributably, not as a crash.
 */
function envelopeError(signed: SignedReceipt): string | null {
  if (!signed || typeof signed !== "object") return "envelope is not an object";
  const r = (signed as { receipt?: unknown }).receipt;
  if (!r || typeof r !== "object") return "envelope has no receipt object";
  const integrity = (r as { integrity?: unknown }).integrity;
  if (!integrity || typeof integrity !== "object") return "receipt has no integrity block";
  const sigs = (signed as { signatures?: unknown }).signatures;
  if (!Array.isArray(sigs)) return "envelope has no signatures array";
  if (sigs.some((s) => !s || typeof s !== "object")) return "signatures array contains a non-object entry";
  const ts = (signed as { timestamps?: unknown }).timestamps;
  if (ts !== undefined && ts !== null && !Array.isArray(ts)) return "timestamps is not an array";
  return null;
}

export interface VerifyOptions {
  /** Map of kid -> base64-encoded public key. Required for signature verification. */
  publicKeys: Record<string, string>;
  /** Optional: the SignedReceipt that should precede this one in the chain. */
  previousReceipt?: SignedReceipt;
}

/**
 * Verify a signed receipt against a known public key.
 */
export function verifyReceipt(
  signed: SignedReceipt,
  opts: VerifyOptions
): VerifyResult {
  const result: VerifyResult = {
    valid: false,
    checks: {
      canonical_hash_matches: false,
      signature_valid: false,
      chain_position_attested: false,
    },
    errors: [],
  };

  // 0. Reject a malformed envelope as INVALID rather than throwing. A thrown
  //    verifier is indistinguishable from a broken deployment; a `valid: false`
  //    with a reason is evidence.
  const shapeError = envelopeError(signed);
  if (shapeError) {
    result.errors.push(`Malformed receipt envelope: ${shapeError}`);
    recordVerify({
      tenantId: (signed as { receipt?: { tenant_id?: string } })?.receipt?.tenant_id ?? "(unknown)",
      ok: false,
    });
    return result;
  }

  // 1. Verify the receipt_hash field matches the SHA-256 of the canonical body
  //    with receipt_hash set to "".
  try {
    const expectedHash = sha256(canonicalHashingPayload(signed.receipt));
    if (expectedHash === signed.receipt.integrity.receipt_hash) {
      result.checks.canonical_hash_matches = true;
    } else {
      result.errors.push(
        `Canonical hash mismatch: expected ${expectedHash}, got ${signed.receipt.integrity.receipt_hash}`
      );
    }
  } catch (e) {
    result.errors.push(`Canonical hash check failed: ${(e as Error).message}`);
  }

  // 2. Verify at least one signature is valid.
  //    Canonicalization is recursive, so a deeply nested payload (an attacker
  //    can staple 20k levels of nesting into the event) blows the stack with a
  //    RangeError. Compute the payload once, inside a guard: an envelope we
  //    cannot canonicalize is unverifiable, which means invalid, not a crash.
  let signingPayload: Uint8Array | null = null;
  try {
    signingPayload = canonicalSigningPayload(signed.receipt);
  } catch (e) {
    result.errors.push(`Cannot canonicalize receipt for signature check: ${(e as Error).message}`);
  }
  let anySignatureValid = false;
  for (const sig of signingPayload === null ? [] : signed.signatures) {
    // Algorithm allowlist: only Ed25519 (EdDSA) is supported. Reject any other
    // `alg` explicitly rather than silently running Ed25519, this closes the
    // algorithm-confusion gap where a signature's alg could be rewritten.
    if (sig.alg !== "EdDSA") {
      result.errors.push(`Unsupported signature alg=${sig.alg} for kid=${sig.kid} (only EdDSA)`);
      continue;
    }
    const publicKey = opts.publicKeys[sig.kid];
    if (!publicKey) {
      result.errors.push(`No public key supplied for kid=${sig.kid}`);
      continue;
    }
    const valid = verifySig(signingPayload!, sig.sig, publicKey);
    if (valid) {
      anySignatureValid = true;
    } else {
      result.errors.push(`Signature invalid for kid=${sig.kid}`);
    }
  }
  result.checks.signature_valid = anySignatureValid;

  // 3. Verify chain continuity.
  //    - Basic sanity: chain_height must be a positive integer.
  //    - With a supplied predecessor: its receipt_hash must match this receipt's
  //      previous_receipt_hash AND chain_height must be exactly one greater, so a
  //      dropped or reordered receipt cannot pass.
  //    - Genesis consistency (checkable even without the predecessor):
  //      chain_height === 1 iff previous_receipt_hash === GENESIS_HASH.
  //    A mid-chain receipt (height > 1) verified without its predecessor leaves
  //    chain_link_valid undefined, its signature/hash are valid but its chain
  //    position is not attested here; supply the predecessor (or full chain).
  const integrity = signed.receipt.integrity;
  const height = integrity.chain_height;
  const prevHashClaim = integrity.previous_receipt_hash;

  if (typeof height !== "number" || !Number.isInteger(height) || height < 1) {
    result.checks.chain_link_valid = false;
    result.errors.push(`Invalid chain_height: ${height}`);
  } else if (opts.previousReceipt) {
    const prev = opts.previousReceipt.receipt.integrity;
    const linkOk = prev.receipt_hash === prevHashClaim;
    const heightOk = height === prev.chain_height + 1;
    result.checks.chain_link_valid = linkOk && heightOk;
    result.checks.chain_position_attested = true;
    if (!linkOk) {
      result.errors.push(
        `Chain link broken: previous_receipt_hash ${prevHashClaim} does not match previous receipt's receipt_hash ${prev.receipt_hash}`
      );
    }
    if (!heightOk) {
      result.errors.push(
        `Chain height not contiguous: expected ${prev.chain_height + 1}, got ${height}`
      );
    }
  } else if (height === 1 || prevHashClaim === GENESIS_HASH) {
    // Genesis reference and chain_height 1 must agree with each other.
    const genesisOk = height === 1 && prevHashClaim === GENESIS_HASH;
    result.checks.chain_link_valid = genesisOk;
    result.checks.chain_position_attested = true;
    if (!genesisOk) {
      result.errors.push(
        `Genesis inconsistency: chain_height ${height} with previous_receipt_hash ${prevHashClaim} (chain_height 1 must reference GENESIS_HASH, and vice-versa)`
      );
    }
  }

  // 4. Time-stamp tokens.
  //
  //    Asymmetric on purpose. A MISMATCHED imprint is real evidence: the token
  //    was made for different bytes than the ones in front of us, so the
  //    receipt fails. A MATCHING imprint on a token whose authority signature
  //    was never verified is NOT evidence of anything. `timestamps[]` sits
  //    outside the signed receipt bytes and `receiptTimestampImprint()` is a
  //    public pure function, so anyone holding the receipt can fabricate a
  //    token with the correct imprint plus `issued_at: "2019-01-01"` and
  //    `tsa: "DigiCert Timestamp 2019"`. Reporting that as a passing check
  //    would hand an attacker a verifier-endorsed backdate (or forward-date,
  //    to claim a control was already in place). So we only ever report this
  //    check as false, never as true, until an authority signature is checked.
  if (Array.isArray(signed.timestamps) && signed.timestamps.length > 0) {
    let verdicts: ReturnType<typeof verifyReceiptTimestamps> = [];
    try {
      verdicts = verifyReceiptTimestamps(signed);
    } catch (e) {
      result.errors.push(`Timestamp check failed: ${(e as Error).message}`);
    }
    if (verdicts.some((v) => v.imprintMatches === false)) {
      result.checks.timestamp_imprint_matches = false;
      result.errors.push("Timestamp imprint does not bind to this receipt (possible tampering)");
    }
    // Honest verdict on TIME: true only if some authority signature was
    // actually verified. Nothing in this SDK sets `authenticated` today.
    result.checks.timestamp_time_attested = verdicts.some((v) => v.authenticated === true);
  }

  result.valid =
    result.checks.canonical_hash_matches &&
    result.checks.signature_valid &&
    (result.checks.chain_link_valid !== false) &&
    (result.checks.timestamp_imprint_matches !== false);

  recordVerify({ tenantId: signed.receipt.tenant_id, ok: result.valid });
  return result;
}

export interface ChainVerifyResult {
  /** Every receipt verified (hash + signature) AND the links are contiguous. */
  valid: boolean;
  /** The chain starts at genesis (height 1, previous = GENESIS_HASH). False for a partial slice. */
  completeFromGenesis: boolean;
  length: number;
  tenantId: string | null;
  /** Index (in height order) of the first receipt that failed, or null. */
  brokenAt: number | null;
  errors: string[];
}

/**
 * Verify an entire per-tenant chain end to end: every receipt's hash and
 * signature, and that the sequence is one unbroken, contiguous chain (each
 * previous_receipt_hash matching the prior receipt, heights incrementing by
 * one, a single tenant). This is the full-ledger audit an enterprise or
 * regulator runs, not a spot check. Receipts may be passed in any order; they
 * are verified in height order. `completeFromGenesis` reports whether the slice
 * begins at the genesis receipt, so a partial range can still be internally
 * valid without being mistaken for the whole ledger.
 */
export function verifyChain(
  receipts: SignedReceipt[],
  opts: VerifyOptions
): ChainVerifyResult {
  const errors: string[] = [];
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return { valid: false, completeFromGenesis: false, length: 0, tenantId: null, brokenAt: null, errors: ["empty chain"] };
  }
  // A 10,000-receipt export is exactly where tampering hides, and it is the
  // worst place to throw: one member with its `signatures` key deleted used to
  // abort the whole audit, so the auditor got "verifier error" instead of the
  // INDEX of the altered receipt. Every step below is defensive so that a bad
  // member is reported and the audit continues over the rest.
  const heightOf = (r: SignedReceipt): number => {
    const h = r?.receipt?.integrity?.chain_height;
    return typeof h === "number" && Number.isFinite(h) ? h : Number.MAX_SAFE_INTEGER;
  };
  const tenantId = receipts.find((r) => typeof r?.receipt?.tenant_id === "string")?.receipt.tenant_id ?? null;
  const ordered = [...receipts].sort((a, b) => heightOf(a) - heightOf(b));

  let brokenAt: number | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    if (r?.receipt?.tenant_id !== tenantId) {
      errors.push(`receipt ${i} belongs to a different tenant (${r?.receipt?.tenant_id} != ${tenantId}); chains are per-tenant`);
      if (brokenAt === null) brokenAt = i;
      continue;
    }
    // Passing the predecessor makes verifyReceipt check the link AND that the
    // height is exactly one greater, so a dropped or reordered receipt fails.
    // A malformed predecessor must not be handed in as if it were trustworthy.
    const prevCandidate = i === 0 ? undefined : ordered[i - 1];
    const prev = prevCandidate?.receipt?.integrity ? prevCandidate : undefined;
    let res: VerifyResult;
    try {
      res = verifyReceipt(r, { publicKeys: opts.publicKeys, previousReceipt: prev });
    } catch (e) {
      // Belt and braces: even an unforeseen throw is attributed to an index
      // rather than collapsing the audit of the other 9,999 receipts.
      errors.push(`receipt ${i} threw during verification: ${(e as Error).message}`);
      if (brokenAt === null) brokenAt = i;
      continue;
    }
    if (!res.valid) {
      errors.push(`receipt ${i} (height ${heightOf(r)}) failed: ${res.errors.join("; ") || "did not verify"}`);
      if (brokenAt === null) brokenAt = i;
    }
  }

  const first = ordered[0]?.receipt?.integrity;
  const completeFromGenesis =
    first?.chain_height === 1 && first?.previous_receipt_hash === GENESIS_HASH;

  return {
    valid: brokenAt === null,
    completeFromGenesis,
    length: ordered.length,
    tenantId,
    brokenAt,
    errors,
  };
}
