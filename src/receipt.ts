// Receipt builder. Pipeline: load chain head -> build body with placeholder
// receipt_hash -> canonicalize -> hash -> populate -> canonicalize -> sign
// -> persist new head. The two-pass canonicalization is required because
// receipt_hash is part of the body we sign over.

import { v7 as uuidv7 } from "uuid";
import { canonicalize, canonicalizeBytes } from "./canonicalize.js";
import { sha256, sign } from "./crypto.js";
import { loadChainState, saveChainState, advanceChain } from "./chain.js";
import { type ChainStateStore, ConcurrentChainWriteError } from "./chain-store.js";
import { validateEvent, validateKeyPair } from "./validate.js";
import { recordSign, recordChainWrite, startSpan } from "./observability/otel.js";
import type {
  RawEvent,
  Receipt,
  SignedReceipt,
  KeyPair,
  ProvenanceBlock,
  DecisionBlock,
  DecisionSummary,
  PolicyContext,
  VerificationBlock,
  EvidenceRef,
} from "./types.js";

interface SignReceiptOptions {
  event: RawEvent;
  keypair: KeyPair;
  decision?: DecisionBlock;
  /** OPTIONAL human-facing summary of the decision outcome and drivers. */
  decisionSummary?: DecisionSummary;
  /** OPTIONAL policy/ruleset that governed the decision (audit + verification bridge). */
  policyContext?: PolicyContext;
  /** OPTIONAL result of checking/verifying the decision against its rules. */
  verification?: VerificationBlock;
  provenance?: ProvenanceBlock;
  /**
   * OPTIONAL references to external evidence/attestation artifacts (by digest).
   * When provided, they are included in the receipt body and thus covered by
   * the receipt_hash and the signature.
   */
  evidenceRefs?: EvidenceRef[];
  /**
   * OPTIONAL forward-compatibility map for experimental attributes (e.g.
   * data_provenance, compliance). Signed like everything else; promote to a
   * first-class field only once its shape is proven.
   */
  extensions?: Record<string, unknown>;
  /** ISO timestamp; defaults to now() */
  issuedAt?: string;
}

// Reject integers outside the IEEE-754 safe range. Such values collide under
// canonical JSON (2^53 and 2^53+1 serialize identically), which would let two
// different receipts share a receipt_hash and signature. Non-integer floats and
// safe integers are fine; NaN/Infinity are already rejected by canonicalize().
function assertSafeNumbers(v: unknown, path = "receipt"): void {
  if (typeof v === "number") {
    if (Number.isInteger(v) && !Number.isSafeInteger(v)) {
      throw new Error(
        `unsafe integer at ${path}: ${v} exceeds Number.MAX_SAFE_INTEGER and cannot be signed unambiguously`
      );
    }
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) assertSafeNumbers(v[i], `${path}[${i}]`);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) assertSafeNumbers(val, `${path}.${k}`);
  }
}

// Pure build + sign at height prev.chain_height + 1. No chain I/O, so the same
// logic drives both the sync single-writer path and the async CAS path.
function buildSignedReceipt(
  opts: SignReceiptOptions,
  prev: { previous_receipt_hash: string; chain_height: number }
): { signed: SignedReceipt; receiptHash: string; receiptId: string } {
  const { event, keypair, decision, decisionSummary, policyContext, verification, provenance, evidenceRefs, extensions, issuedAt } = opts;
  validateEvent(event);
  validateKeyPair(keypair);
  const receiptId = uuidv7();
  const body: Receipt = {
    schema_version: "1.0",
    receipt_id: receiptId,
    tenant_id: event.tenant_id,
    issued_at: issuedAt ?? new Date().toISOString(),
    event,
    ...(decision !== undefined && { decision }),
    ...(decisionSummary !== undefined && { decision_summary: decisionSummary }),
    ...(policyContext !== undefined && { policy_context: policyContext }),
    ...(verification !== undefined && { verification }),
    ...(provenance !== undefined && { provenance }),
    ...(evidenceRefs !== undefined && { evidence_refs: evidenceRefs }),
    ...(extensions !== undefined && { extensions }),
    integrity: {
      previous_receipt_hash: prev.previous_receipt_hash,
      receipt_hash: "",
      chain_height: prev.chain_height + 1,
    },
  };
  assertSafeNumbers(body);
  const receiptHash = sha256(canonicalizeBytes(body));
  body.integrity.receipt_hash = receiptHash;
  const sig = sign(canonicalizeBytes(body), keypair);
  return {
    signed: { receipt: body, signatures: [{ alg: "EdDSA", kid: keypair.kid, sig }] },
    receiptHash,
    receiptId,
  };
}

/**
 * Sign a receipt and advance the tenant's chain on the local file store.
 *
 * SINGLE-WRITER. Within one Node process this is safe (the body build and the
 * chain save run synchronously without interleaving). For concurrent or
 * multi-process signing on a shared chain, use `signReceiptWithStore` with a
 * compare-and-set store — otherwise two writers can fork the chain at the same
 * height.
 */
export function signReceipt(opts: SignReceiptOptions): SignedReceipt {
  const span = startSpan("pl.sign", { tenant_id: opts.event.tenant_id, kid: opts.keypair.kid });
  const t0 = performance.now();
  let ok = false;
  try {
    const prev = loadChainState(opts.event.tenant_id);
    const { signed, receiptHash, receiptId } = buildSignedReceipt(opts, prev);
    try {
      saveChainState(advanceChain(prev, receiptHash, receiptId));
      recordChainWrite({ tenantId: opts.event.tenant_id, ok: true });
    } catch (err) {
      recordChainWrite({ tenantId: opts.event.tenant_id, ok: false });
      throw err;
    }
    ok = true;
    return signed;
  } finally {
    recordSign({ durationMs: performance.now() - t0, tenantId: opts.event.tenant_id, kid: opts.keypair.kid, ok });
    span.end();
  }
}

/**
 * Concurrency-safe signing against a ChainStateStore. Optimistic
 * compare-and-set: load the head, sign at height+1, and commit; if another
 * writer advanced the chain first the store throws ConcurrentChainWriteError
 * and we reload and re-sign at the new head. With a CAS-correct store
 * (PostgresChainStateStore, MemoryChainStateStore) this guarantees exactly one
 * receipt per height, so concurrent signers cannot fork the chain.
 */
export async function signReceiptWithStore(
  opts: SignReceiptOptions,
  store: ChainStateStore,
  o: { maxRetries?: number } = {}
): Promise<SignedReceipt> {
  const maxRetries = o.maxRetries ?? 8;
  const tenantId = opts.event.tenant_id;
  const span = startSpan("pl.sign", { tenant_id: tenantId, kid: opts.keypair.kid });
  const t0 = performance.now();
  let ok = false;
  try {
    for (let attempt = 0; ; attempt++) {
      const prev = await store.load(tenantId);
      const { signed, receiptHash, receiptId } = buildSignedReceipt(opts, prev);
      try {
        await store.advance(prev, receiptHash, receiptId);
        recordChainWrite({ tenantId, ok: true });
        ok = true;
        return signed;
      } catch (err) {
        if (err instanceof ConcurrentChainWriteError && attempt < maxRetries) {
          continue; // reload the new head and re-sign at height+1
        }
        recordChainWrite({ tenantId, ok: false });
        throw err;
      }
    }
  } finally {
    recordSign({ durationMs: performance.now() - t0, tenantId, kid: opts.keypair.kid, ok });
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
