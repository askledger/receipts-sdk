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
     * Whether attached time-stamp tokens bind to this receipt. Only set when the
     * receipt carries a token the SDK can verify locally (our own format); RFC
     * 3161 tokens are verified externally with the TSA CA cert and leave this
     * undefined. A parseable token whose imprint does NOT match makes it false.
     */
    timestamp_imprint_matches?: boolean;
  };
  errors: string[];
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
  let anySignatureValid = false;
  for (const sig of signed.signatures) {
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
    const payload = canonicalSigningPayload(signed.receipt);
    const valid = verifySig(payload, sig.sig, publicKey);
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

  // 4. Verify any attached time-stamp tokens bind to this receipt. Only the
  //    tokens we can parse here (our local format) affect the verdict; RFC 3161
  //    tokens are checked externally with the TSA CA cert.
  if (signed.timestamps && signed.timestamps.length > 0) {
    const local = verifyReceiptTimestamps(signed).filter((v) => v.format === "local");
    if (local.length > 0) {
      const allMatch = local.every((v) => v.imprintMatches === true);
      result.checks.timestamp_imprint_matches = allMatch;
      if (!allMatch) {
        result.errors.push("Timestamp imprint does not bind to this receipt (possible tampering)");
      }
    }
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
  if (receipts.length === 0) {
    return { valid: false, completeFromGenesis: false, length: 0, tenantId: null, brokenAt: null, errors: ["empty chain"] };
  }
  const tenantId = receipts[0].receipt.tenant_id;
  const ordered = [...receipts].sort(
    (a, b) => a.receipt.integrity.chain_height - b.receipt.integrity.chain_height
  );

  let brokenAt: number | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    if (r.receipt.tenant_id !== tenantId) {
      errors.push(`receipt ${i} belongs to a different tenant (${r.receipt.tenant_id} != ${tenantId}); chains are per-tenant`);
      if (brokenAt === null) brokenAt = i;
      continue;
    }
    // Passing the predecessor makes verifyReceipt check the link AND that the
    // height is exactly one greater, so a dropped or reordered receipt fails.
    const prev = i === 0 ? undefined : ordered[i - 1];
    const res = verifyReceipt(r, { publicKeys: opts.publicKeys, previousReceipt: prev });
    if (!res.valid) {
      errors.push(`receipt ${i} (height ${r.receipt.integrity.chain_height}) failed: ${res.errors.join("; ") || "did not verify"}`);
      if (brokenAt === null) brokenAt = i;
    }
  }

  const first = ordered[0].receipt.integrity;
  const completeFromGenesis = first.chain_height === 1 && first.previous_receipt_hash === GENESIS_HASH;

  return {
    valid: brokenAt === null,
    completeFromGenesis,
    length: ordered.length,
    tenantId,
    brokenAt,
    errors,
  };
}
