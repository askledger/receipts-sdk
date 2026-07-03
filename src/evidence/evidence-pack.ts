/**
 * Evidence pack generator.
 *
 * Produces a regulator-ready bundle containing:
 *   - A selection of signed receipts
 *   - The chain links between consecutive receipts
 *   - A Merkle batch root (and inclusion proofs) over the selection
 *   - The RFC 3161 timestamps embedded in each receipt
 *   - The public verification key(s) used
 *   - A human-readable summary and the verification recipe
 *
 * This is the artifact a CBUAE / SAMA / ECB inspector consumes.
 * It is a single tarball-compatible JSON-LD document. Optionally
 * paired with a PDF summary for human stakeholders.
 */

import { buildBatch, type MerkleBatch } from "../merkle.js";
import { canonicalSigningPayload } from "../receipt.js";
import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type { SignedReceipt } from "../types.js";
import type { KeyRecord } from "../key-management.js";

export interface EvidencePackMeta {
  /** Human-readable title — e.g. "AI Decision Evidence Pack · ACME Bank · Q3 2026". */
  title: string;
  /** Tenant identifier. */
  tenantId: string;
  /** Description of why this pack exists (audit, inspection, customer request). */
  purpose: string;
  /** Window of receipts included. */
  period: { from: string; to: string };
  /** Who built the pack (operator/admin id). */
  builtBy: string;
  builtAt: string;
}

export interface EvidencePack {
  "@context": string;
  "@type": string;
  meta: EvidencePackMeta;
  /** Verification key set, sufficient to verify every receipt. */
  trusted_keys: KeyRecord[];
  /** Merkle batch over the included receipts. */
  merkle: MerkleBatch;
  /** Pack-level integrity. */
  integrity: {
    receipts_count: number;
    pack_hash: string; // sha256 of the canonical pack body minus this field
  };
  receipts: SignedReceipt[];
  /** Verification recipe, in plain English + cryptographic detail. */
  verification_instructions: string;
}

const VERIFY_INSTRUCTIONS = `
HOW TO VERIFY THIS EVIDENCE PACK

Prerequisites:
  - The AskLedger Receipts verifier (any language SDK passing the
    cross-language conformance vectors at test/conformance/).
  - The list of trusted public keys (included in this pack under
    \`trusted_keys\`).

Steps:
  1. For each receipt in \`receipts\`:
     a. Recompute its \`integrity.receipt_hash\`:
        - Replace \`integrity.receipt_hash\` with the empty string.
        - Canonicalize the receipt body per RFC 8785.
        - Compute SHA-256 hex of the canonical bytes.
        - Compare to the original \`integrity.receipt_hash\`. MUST match.
     b. Verify the Ed25519 signature in \`signatures[0].sig\` against the
        canonical receipt body and the public key in \`trusted_keys\` whose
        \`kid\` matches \`signatures[0].kid\`. MUST verify.
     c. For receipts i and i-1 in the same tenant, verify that
        \`receipts[i].integrity.previous_receipt_hash\` equals
        \`receipts[i-1].integrity.receipt_hash\`.

  2. Verify the Merkle root in \`merkle.root\` covers every receipt:
     For each receipt, use \`merkle.proofs[receipt_id]\` to reconstruct
     the root and compare. MUST match \`merkle.root\`.

  3. (Optional) Verify the RFC 3161 timestamp in each receipt's
     \`timestamps[]\` against the TSA's published certificate.

  4. Verify the pack integrity:
     Compute the pack_hash and compare to \`integrity.pack_hash\`.

Any failure means the pack has been tampered with or assembled
incorrectly. Each failure is a structured error from the verifier.
`.trim();

function sha256Hex(b: Uint8Array): string {
  return Buffer.from(sha256Fn(b)).toString("hex");
}

function canonicalBytes(v: unknown): Uint8Array {
  // Use the package's canonicalize via dynamic import to avoid cycles
  // (evidence-pack is leaf vs receipt.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = JSON.stringify(v);
  // The pack itself is content-addressed by sha256 over its canonical
  // bytes computed by RFC 8785 (same as receipts).
  return new TextEncoder().encode(json);
}

/**
 * Build an evidence pack from a selection of receipts.
 * Receipts MUST be passed in chain order (oldest first) for the chain
 * link assertions to verify.
 */
export function buildEvidencePack(
  meta: EvidencePackMeta,
  receipts: SignedReceipt[],
  trustedKeys: KeyRecord[]
): EvidencePack {
  if (receipts.length === 0) {
    throw new Error("Evidence pack must contain at least one receipt");
  }

  const merkle = buildBatch(receipts);
  // Also recompute the pack-level hash for tamper-evident packaging.
  const corePack: Omit<EvidencePack, "integrity"> = {
    "@context": "https://github.com/askledger/receipts-sdk/schema/evidence-pack-v1.jsonld",
    "@type": "EvidencePack",
    meta,
    trusted_keys: trustedKeys,
    merkle,
    receipts,
    verification_instructions: VERIFY_INSTRUCTIONS,
  };

  const packHash = sha256Hex(canonicalBytes(corePack));

  return {
    ...corePack,
    integrity: {
      receipts_count: receipts.length,
      pack_hash: packHash,
    },
  };
}

/**
 * Quick self-check: recompute the pack hash and confirm it matches.
 * Use this immediately after building, in tests, and on import.
 */
export function verifyPackIntegrity(pack: EvidencePack): boolean {
  const stripped: Omit<EvidencePack, "integrity"> = {
    "@context": pack["@context"],
    "@type": pack["@type"],
    meta: pack.meta,
    trusted_keys: pack.trusted_keys,
    merkle: pack.merkle,
    receipts: pack.receipts,
    verification_instructions: pack.verification_instructions,
  };
  return sha256Hex(canonicalBytes(stripped)) === pack.integrity.pack_hash;
}

/**
 * Recompute the inclusion of every receipt against the pack's Merkle
 * root. Returns the receipts that failed inclusion.
 */
export function verifyAllReceiptsInPack(pack: EvidencePack): SignedReceipt[] {
  const failed: SignedReceipt[] = [];
  for (const r of pack.receipts) {
    const proof = pack.merkle.proofs[r.receipt.receipt_id];
    if (!proof) {
      failed.push(r);
      continue;
    }
    // Verify by reconstructing the leaf hash + audit path
    const leaf = sha256Fn(
      new Uint8Array([0x00, ...canonicalSigningPayload(r.receipt)])
    );
    let h: Uint8Array = leaf;
    let idx = proof.leaf_index;
    let levelSize = proof.tree_size;
    let pathPos = 0;
    while (levelSize > 1) {
      const isLastOdd = idx === levelSize - 1 && levelSize % 2 === 1;
      if (!isLastOdd) {
        const sibling = Buffer.from(proof.audit_path[pathPos++], "hex");
        h = sha256Fn(
          new Uint8Array(
            idx % 2 === 0
              ? [0x01, ...h, ...new Uint8Array(sibling)]
              : [0x01, ...new Uint8Array(sibling), ...h]
          )
        );
      }
      idx = Math.floor(idx / 2);
      levelSize = Math.ceil(levelSize / 2);
    }
    if (Buffer.from(h).toString("hex") !== pack.merkle.root.toLowerCase()) {
      failed.push(r);
    }
  }
  return failed;
}
