/**
 * Receipt verification — independent of any Ledger server.
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
import { GENESIS_HASH, type SignedReceipt } from "./types.js";

export interface VerifyResult {
  valid: boolean;
  checks: {
    canonical_hash_matches: boolean;
    signature_valid: boolean;
    chain_link_valid?: boolean;
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
    // `alg` explicitly rather than silently running Ed25519 — this closes the
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
  //    chain_link_valid undefined — its signature/hash are valid but its chain
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
    if (!genesisOk) {
      result.errors.push(
        `Genesis inconsistency: chain_height ${height} with previous_receipt_hash ${prevHashClaim} (chain_height 1 must reference GENESIS_HASH, and vice-versa)`
      );
    }
  }

  result.valid =
    result.checks.canonical_hash_matches &&
    result.checks.signature_valid &&
    (result.checks.chain_link_valid !== false);

  recordVerify({ tenantId: signed.receipt.tenant_id, ok: result.valid });
  return result;
}
