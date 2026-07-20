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
import { canonicalizeBytes } from "../canonicalize.js";
import { verifyReceipt } from "../verify.js";
import { canonicalSigningPayload } from "../receipt.js";
import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type { SignedReceipt } from "../types.js";
import type { KeyRecord } from "../key-management.js";

export interface EvidencePackMeta {
  /** Human-readable title, e.g. "AI Decision Evidence Pack · ACME Bank · Q3 2026". */
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

READ THIS FIRST. THE KEYS IN THIS FILE PROVE NOTHING.

  \`trusted_keys\` travels INSIDE this pack. Anyone who can write this file can
  put their own key there, re-sign every receipt with it, rebuild the Merkle
  root and recompute \`pack_hash\`, and the result is internally consistent.
  Every integrity mechanism in this document is computed over data supplied by
  whoever produced the document.

  So \`trusted_keys\` is a HINT about which key ids to go and look up. It is
  NOT a trust root. You MUST obtain the signer's public key for each \`kid\`
  from somewhere else: the issuer's published key, your own key registry, a
  certificate, or a channel independent of this file. If you cannot, you have
  not verified this pack, whatever the tooling prints.

Prerequisites:
  - The AskLedger Receipts verifier (any language SDK passing the
    cross-language conformance vectors at test/conformance/).
  - The signer's public key for each \`kid\`, obtained OUT OF BAND (see above).

Steps:
  1. For each receipt in \`receipts\`:
     a. Recompute its \`integrity.receipt_hash\`:
        - Replace \`integrity.receipt_hash\` with the empty string.
        - Canonicalize the receipt body per RFC 8785.
        - Compute SHA-256 hex of the canonical bytes.
        - Compare to the original \`integrity.receipt_hash\`. MUST match.
     b. Verify the Ed25519 signature in \`signatures[0].sig\` against the
        canonical receipt body and the OUT-OF-BAND public key whose \`kid\`
        matches \`signatures[0].kid\`. MUST verify. Do NOT use the key material
        carried in \`trusted_keys\` for this step.
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
  // Must be RFC 8785 (JCS), which is what the comment, the pack's own
  // VERIFY_INSTRUCTIONS and the receipts themselves all specify. This used to
  // be a plain JSON.stringify, so pack_hash was key-order dependent: it only
  // reproduced because verifyPackIntegrity rebuilt the object in the same
  // literal order. Any third party following the shipped instructions, or any
  // pack that round-tripped through a system that reorders keys, computed a
  // different hash and was told the pack was tampered with.
  return canonicalizeBytes(v);
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

export interface PackVerification {
  valid: boolean;
  checks: {
    pack_hash_matches: boolean;
    all_receipts_included: boolean;
    all_signatures_valid: boolean;
  };
  failed_inclusion: string[];
  failed_signature: string[];
  errors: string[];
}

/**
 * Verify a pack against keys the CALLER supplies out of band.
 *
 * This exists because a pack cannot certify itself. `trusted_keys` travels
 * inside the pack, so all three of its integrity mechanisms are computed over
 * attacker-controlled input: pack_hash is recomputed by the forger,
 * merkle.root is built from the forger's receipts, and trusted_keys is the
 * forger's own key. A pack with every decision rewritten (block -> allow,
 * $900,000 -> $2,000) passed pack integrity, Merkle inclusion and per-receipt
 * signature verification, because it was internally consistent under the key
 * it shipped.
 *
 * `publicKeys` MUST come from somewhere other than the pack: your key
 * registry, the issuer's published key, a certificate. The `trusted_keys`
 * field is only a hint about WHICH kids to go and resolve.
 */
export function verifyEvidencePack(
  pack: EvidencePack,
  opts: { publicKeys: Record<string, string> }
): PackVerification {
  const errors: string[] = [];

  if (!opts.publicKeys || Object.keys(opts.publicKeys).length === 0) {
    // Fail closed. "No keys supplied" must never read as "nothing was wrong".
    return {
      valid: false,
      checks: { pack_hash_matches: false, all_receipts_included: false, all_signatures_valid: false },
      failed_inclusion: [],
      failed_signature: [],
      errors: ["no external public keys supplied; a pack cannot authenticate itself"],
    };
  }

  const pack_hash_matches = verifyPackIntegrity(pack);
  if (!pack_hash_matches) errors.push("pack_hash does not match the pack contents");

  const failed_inclusion = verifyAllReceiptsInPack(pack).map((r) => r.receipt.receipt_id);
  if (failed_inclusion.length > 0) {
    errors.push(`${failed_inclusion.length} receipt(s) are not included under the Merkle root`);
  }

  const failed_signature: string[] = [];
  for (const r of pack.receipts) {
    if (!verifyReceipt(r, { publicKeys: opts.publicKeys }).valid) {
      failed_signature.push(r.receipt.receipt_id);
    }
  }
  if (failed_signature.length > 0) {
    errors.push(
      `${failed_signature.length} receipt(s) failed signature verification against the supplied keys`
    );
  }

  const all_receipts_included = failed_inclusion.length === 0;
  const all_signatures_valid = failed_signature.length === 0;
  return {
    valid: pack_hash_matches && all_receipts_included && all_signatures_valid,
    checks: { pack_hash_matches, all_receipts_included, all_signatures_valid },
    failed_inclusion,
    failed_signature,
    errors,
  };
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
    // A malformed pack must be REPORTED as failed, not throw. This loop
    // previously dropped the three guards merkle.ts has, so a truncated
    // audit_path reached Buffer.from(undefined, "hex") and crashed the
    // verifier, and a path with extra trailing nodes was accepted.
    let malformed = false;
    while (levelSize > 1) {
      const isLastOdd = idx === levelSize - 1 && levelSize % 2 === 1;
      if (!isLastOdd) {
        if (pathPos >= proof.audit_path.length) { malformed = true; break; }
        const sibling = Buffer.from(proof.audit_path[pathPos++], "hex");
        if (sibling.length !== 32) { malformed = true; break; }
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
    // Every supplied node must have been consumed, otherwise the proof carries
    // unverified padding.
    if (malformed || pathPos !== proof.audit_path.length) {
      failed.push(r);
      continue;
    }
    if (Buffer.from(h).toString("hex") !== pack.merkle.root.toLowerCase()) {
      failed.push(r);
    }
  }
  return failed;
}
