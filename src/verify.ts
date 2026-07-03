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
import type { SignedReceipt } from "./types.js";

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

  // 3. Optional: verify the chain link to the previous receipt.
  if (opts.previousReceipt) {
    const prevHash = opts.previousReceipt.receipt.integrity.receipt_hash;
    if (prevHash === signed.receipt.integrity.previous_receipt_hash) {
      result.checks.chain_link_valid = true;
    } else {
      result.checks.chain_link_valid = false;
      result.errors.push(
        `Chain link broken: previous_receipt_hash ${signed.receipt.integrity.previous_receipt_hash} does not match previous receipt's receipt_hash ${prevHash}`
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
