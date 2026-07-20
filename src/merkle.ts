/**
 * SHA-256 binary Merkle tree with inclusion proofs.
 *
 * Used for batch commitment: every N receipts (or every M seconds) the
 * issuer can publish a single Merkle root to a transparency log or to
 * a public ledger. The root commits to every receipt in the batch.
 * A verifier given (receipt, proof, root) can prove the receipt was
 * part of the committed set without needing the other receipts.
 *
 * The construction matches RFC 9162 (Certificate Transparency v2):
 *
 *   leaf_hash = SHA-256(0x00 || receipt_canonical_bytes)
 *   internal_hash = SHA-256(0x01 || left_hash || right_hash)
 *
 * Odd levels: the last node is promoted (not duplicated). This avoids
 * the CVE-2012-2459 second-preimage class of bugs.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type { SignedReceipt } from "./types.js";
import { canonicalSigningPayload } from "./receipt.js";

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

function concat(...arrs: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function hashLeaf(payload: Uint8Array): Uint8Array {
  return sha256Fn(concat(LEAF_PREFIX, payload));
}

function hashNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Fn(concat(NODE_PREFIX, left, right));
}

/**
 * An inclusion proof: the audit path from a leaf to the root.
 * Each entry says "combine your current hash with this sibling on the
 * given side."
 */
export interface InclusionProof {
  /** Canonical leaf bytes (the receipt's canonical signing payload). */
  leaf_index: number;
  /** Total number of leaves in the tree the proof was generated against. */
  tree_size: number;
  /**
   * Sibling hashes from leaf to root. Each is hex-encoded SHA-256.
   * The path direction is implied by leaf_index + tree_size.
   */
  audit_path: string[];
}

/**
 * A batch commitment over N signed receipts. The `root` is what gets
 * published to a transparency log or a blockchain anchor.
 */
export interface MerkleBatch {
  root: string; // hex
  tree_size: number;
  /** Map of receipt_id -> InclusionProof for every leaf in the batch. */
  proofs: Record<string, InclusionProof>;
}

/**
 * Build a Merkle tree over the canonical bytes of the given receipts.
 * Returns the root and inclusion proofs for every receipt.
 */
export function buildBatch(receipts: SignedReceipt[]): MerkleBatch {
  if (receipts.length === 0) {
    throw new Error("Cannot build Merkle batch of zero receipts");
  }
  const leafBytes = receipts.map((r) => canonicalSigningPayload(r.receipt));
  const leaves = leafBytes.map(hashLeaf);

  // Build all levels bottom-up, retaining each level for proof generation.
  const levels: Uint8Array[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : undefined;
      if (!right) {
        // Odd: promote the last node (RFC 9162 style)
        next.push(left);
      } else {
        next.push(hashNode(left, right));
      }
    }
    levels.push(next);
    current = next;
  }

  const root = Buffer.from(levels[levels.length - 1][0]).toString("hex");
  const tree_size = leaves.length;

  const proofs: Record<string, InclusionProof> = {};
  for (let i = 0; i < receipts.length; i++) {
    const audit_path: string[] = [];
    let idx = i;
    for (let lvl = 0; lvl < levels.length - 1; lvl++) {
      const level = levels[lvl];
      const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sibling < level.length) {
        audit_path.push(Buffer.from(level[sibling]).toString("hex"));
      }
      idx = Math.floor(idx / 2);
    }
    proofs[receipts[i].receipt.receipt_id] = {
      leaf_index: i,
      tree_size,
      audit_path,
    };
  }

  return { root, tree_size, proofs };
}

/**
 * Verify that a given receipt is included in the Merkle root using the
 * supplied proof.
 *
 * The verifier needs: the receipt itself, the inclusion proof, and the
 * trusted root hash (published by the issuer to a transparency log).
 *
 * Promotion handling: if at some level the leaf is the last (odd) node
 * with no sibling, no entry was added to audit_path at that level. The
 * verifier walks `levelSize` levels, at each level it either consumes
 * an audit_path entry (if a sibling exists) or skips (the node was
 * promoted unchanged).
 */
export function verifyInclusion(
  receipt: SignedReceipt,
  proof: InclusionProof,
  trustedRootHex: string
): boolean {
  // leaf_index MUST be inside the tree. Without this, `idx` is only ever
  // consulted as `idx % 2`, so on power-of-two trees leaf_index + k*tree_size
  // and negative aliases all reconstruct the same root and verify. The proof
  // would then attest a position the receipt does not occupy.
  if (
    !Number.isInteger(proof.leaf_index) ||
    !Number.isInteger(proof.tree_size) ||
    proof.tree_size < 1 ||
    proof.leaf_index < 0 ||
    proof.leaf_index >= proof.tree_size
  ) {
    return false;
  }

  let h = hashLeaf(canonicalSigningPayload(receipt.receipt));
  let idx = proof.leaf_index;
  let levelSize = proof.tree_size;
  let pathPos = 0;

  while (levelSize > 1) {
    const isLastOdd = idx === levelSize - 1 && levelSize % 2 === 1;
    if (isLastOdd) {
      // Promoted: no combine at this level
    } else {
      if (pathPos >= proof.audit_path.length) return false;
      const sibling = Buffer.from(proof.audit_path[pathPos++], "hex");
      if (sibling.length !== 32) return false;
      h = idx % 2 === 0 ? hashNode(h, sibling) : hashNode(sibling, h);
    }
    idx = Math.floor(idx / 2);
    levelSize = Math.ceil(levelSize / 2);
  }
  if (pathPos !== proof.audit_path.length) return false;
  return Buffer.from(h).toString("hex") === trustedRootHex.toLowerCase();
}
