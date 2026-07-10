/**
 * Transparency Log types, Certificate Transparency / Sigstore Rekor
 * pattern, adapted for AI Decision Receipts.
 *
 * A transparency log is an append-only, publicly auditable Merkle tree
 * that anchors batches of receipts. Once a batch is committed, the log
 * publishes a Signed Tree Head (STH). Anyone can:
 *
 *   - Verify a receipt's inclusion in the tree at any size
 *   - Verify consistency between two STHs (no rewrites)
 *   - Audit the entire log retrospectively
 *
 * The transparency log is the property that makes AskLedger
 * non-repudiable even by US. We cannot rewrite history because the
 * world has the STH chain.
 */

export interface LogEntry {
  /** Sequential entry index in the log (0-based). */
  log_index: number;
  /** SHA-256 of the receipt's canonical signing payload. */
  leaf_hash: string;
  /** Tenant the receipt belongs to (for scoped queries). */
  tenant_id: string;
  /** Receipt id for back-reference. */
  receipt_id: string;
  /** When the log accepted the entry (log operator time). */
  integrated_time: string;
}

export interface SignedTreeHead {
  /** Tree size at the moment this STH was signed. */
  tree_size: number;
  /** SHA-256 of the Merkle root of the tree at this size. */
  root_hash: string;
  /** When the log signed this STH. */
  timestamp: string;
  /** Log operator's signature over { tree_size, root_hash, timestamp }. */
  signature: {
    alg: "EdDSA";
    kid: string;
    sig: string;
  };
  /** Operator identifier. */
  log_id: string;
}

export interface InclusionProof {
  log_index: number;
  tree_size: number;
  audit_path: string[];
}

export interface ConsistencyProof {
  first_size: number;
  second_size: number;
  proof: string[];
}
