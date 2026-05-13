/**
 * Receipt builder — converts a raw event into a signed, chained receipt.
 *
 * Process:
 *   1. Load the tenant's chain state (previous_receipt_hash, chain_height).
 *   2. Construct the receipt body referencing the previous hash.
 *   3. Canonicalize the receipt body (RFC 8785).
 *   4. Compute SHA-256 — this is the receipt_hash, written into integrity.
 *   5. Re-canonicalize the full receipt body with the populated integrity.
 *   6. Sign that canonical form with Ed25519.
 *   7. Persist updated chain state.
 *   8. Return the SignedReceipt envelope.
 */

import { v7 as uuidv7 } from "uuid";
import { canonicalize, canonicalizeBytes } from "./canonicalize.js";
import { sha256, sign } from "./crypto.js";
import { loadChainState, saveChainState, advanceChain } from "./chain.js";
import type {
  RawEvent,
  Receipt,
  SignedReceipt,
  KeyPair,
  ProvenanceBlock,
  DecisionBlock,
} from "./types.js";

interface SignReceiptOptions {
  event: RawEvent;
  keypair: KeyPair;
  decision?: DecisionBlock;
  provenance?: ProvenanceBlock;
  /** ISO timestamp; defaults to now() */
  issuedAt?: string;
}

/**
 * Build, hash-chain, and sign a receipt for a single event.
 */
export function signReceipt(opts: SignReceiptOptions): SignedReceipt {
  const { event, keypair, decision, provenance, issuedAt } = opts;

  // 1. Load chain state
  const prevState = loadChainState(event.tenant_id);

  // 2. Construct receipt body with placeholder receipt_hash
  const receiptId = uuidv7();
  const receiptBody: Receipt = {
    schema_version: "1.0",
    receipt_id: receiptId,
    tenant_id: event.tenant_id,
    issued_at: issuedAt ?? new Date().toISOString(),
    event,
    ...(decision !== undefined && { decision }),
    ...(provenance !== undefined && { provenance }),
    integrity: {
      previous_receipt_hash: prevState.previous_receipt_hash,
      receipt_hash: "PENDING",
      chain_height: prevState.chain_height + 1,
    },
  };

  // 3. Canonicalize the receipt body with PENDING receipt_hash and compute true hash
  // We compute the hash over the body with receipt_hash set to a placeholder
  // (empty string), so any verifier reproduces the same hash deterministically.
  const bodyForHashing = JSON.parse(JSON.stringify(receiptBody)) as Receipt;
  bodyForHashing.integrity.receipt_hash = "";
  const canonicalForHash = canonicalizeBytes(bodyForHashing);
  const receiptHash = sha256(canonicalForHash);

  // 4. Populate the real receipt_hash
  receiptBody.integrity.receipt_hash = receiptHash;

  // 5. Canonicalize the FULL body (with populated receipt_hash) and sign
  const canonicalForSigning = canonicalizeBytes(receiptBody);
  const signatureBase64 = sign(canonicalForSigning, keypair);

  // 6. Persist updated chain state
  const newState = advanceChain(prevState, receiptHash, receiptId);
  saveChainState(newState);

  // 7. Return the signed envelope
  return {
    receipt: receiptBody,
    signatures: [
      {
        alg: "EdDSA",
        kid: keypair.kid,
        sig: signatureBase64,
      },
    ],
    // Placeholder for RFC 3161 TSA tokens — production wires in real TSAs.
  };
}

/**
 * Compute the canonical bytes used for signing a receipt.
 * Useful for re-deriving the signing payload during verification.
 */
export function canonicalSigningPayload(receipt: Receipt): Uint8Array {
  return canonicalizeBytes(receipt);
}

/**
 * Compute the canonical bytes used for the receipt_hash field.
 * The receipt_hash field is set to "" before hashing, then populated.
 */
export function canonicalHashingPayload(receipt: Receipt): Uint8Array {
  const copy = JSON.parse(JSON.stringify(receipt)) as Receipt;
  copy.integrity.receipt_hash = "";
  return canonicalizeBytes(copy);
}

/**
 * Render a SignedReceipt as canonical JSON (pretty-printed for human inspection).
 * The bytes used for signing are NOT pretty-printed; this is for display only.
 */
export function prettySignedReceipt(signed: SignedReceipt): string {
  return JSON.stringify(signed, null, 2);
}

/**
 * Canonical (non-pretty) JSON form of a SignedReceipt, suitable for transport.
 */
export function canonicalSignedReceipt(signed: SignedReceipt): string {
  return canonicalize(signed);
}
