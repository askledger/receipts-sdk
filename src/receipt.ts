// Receipt builder. Pipeline: load chain head -> build body with placeholder
// receipt_hash -> canonicalize -> hash -> populate -> canonicalize -> sign
// -> persist new head. The two-pass canonicalization is required because
// receipt_hash is part of the body we sign over.

import { v7 as uuidv7 } from "uuid";
import { canonicalize, canonicalizeBytes } from "./canonicalize.js";
import { sha256, sign } from "./crypto.js";
import { loadChainState, saveChainState, advanceChain } from "./chain.js";
import { validateEvent, validateKeyPair } from "./validate.js";
import { recordSign, recordChainWrite, startSpan } from "./observability/otel.js";
import type {
  RawEvent,
  Receipt,
  SignedReceipt,
  KeyPair,
  ProvenanceBlock,
  DecisionBlock,
  EvidenceRef,
} from "./types.js";

interface SignReceiptOptions {
  event: RawEvent;
  keypair: KeyPair;
  decision?: DecisionBlock;
  provenance?: ProvenanceBlock;
  /**
   * OPTIONAL references to external evidence/attestation artifacts (by digest).
   * When provided, they are included in the receipt body and thus covered by
   * the receipt_hash and the signature.
   */
  evidenceRefs?: EvidenceRef[];
  /** ISO timestamp; defaults to now() */
  issuedAt?: string;
}

export function signReceipt(opts: SignReceiptOptions): SignedReceipt {
  const { event, keypair, decision, provenance, evidenceRefs, issuedAt } = opts;
  const span = startSpan("pl.sign", { tenant_id: event.tenant_id, kid: keypair.kid });
  const t0 = performance.now();
  let ok = false;
  try {
    validateEvent(event);
    validateKeyPair(keypair);

    const prev = loadChainState(event.tenant_id);
    const receiptId = uuidv7();

    const body: Receipt = {
      schema_version: "1.0",
      receipt_id: receiptId,
      tenant_id: event.tenant_id,
      issued_at: issuedAt ?? new Date().toISOString(),
      event,
      ...(decision !== undefined && { decision }),
      ...(provenance !== undefined && { provenance }),
      ...(evidenceRefs !== undefined && { evidence_refs: evidenceRefs }),
      integrity: {
        previous_receipt_hash: prev.previous_receipt_hash,
        receipt_hash: "",
        chain_height: prev.chain_height + 1,
      },
    };

    const receiptHash = sha256(canonicalizeBytes(body));
    body.integrity.receipt_hash = receiptHash;

    const sig = sign(canonicalizeBytes(body), keypair);

    try {
      saveChainState(advanceChain(prev, receiptHash, receiptId));
      recordChainWrite({ tenantId: event.tenant_id, ok: true });
    } catch (err) {
      recordChainWrite({ tenantId: event.tenant_id, ok: false });
      throw err;
    }

    ok = true;
    return {
      receipt: body,
      signatures: [{ alg: "EdDSA", kid: keypair.kid, sig }],
    };
  } finally {
    recordSign({ durationMs: performance.now() - t0, tenantId: event.tenant_id, kid: keypair.kid, ok });
    span.end();
  }
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
