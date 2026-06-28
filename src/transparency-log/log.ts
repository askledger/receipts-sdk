/**
 * Reference Transparency Log — RFC 9162 (Certificate Transparency v2)
 * style append-only Merkle tree.
 *
 * This reference implementation uses an in-memory tree suitable for
 * tests and the demo. The production deployment at
 * transparency.github.com/askledger/receipts-sdk persists entries in append-only object
 * storage (S3 + DynamoDB) and rebuilds the tree on each STH publication.
 *
 * Operators MUST publish STHs on a fixed cadence (default: every 5
 * minutes). The signed STH chain is what gives the world the ability
 * to detect log rewrites — including ones we would attempt ourselves.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type {
  LogEntry,
  SignedTreeHead,
  InclusionProof,
  ConsistencyProof,
} from "./types.js";
import type { SigningProvider } from "../signing-provider.js";

// RFC 9162 leaf/internal prefixes (second-preimage safe)
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

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function rootFromLeaves(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) {
    // Empty tree: SHA-256 of empty string per RFC 9162
    return sha256Fn(new Uint8Array(0));
  }
  if (leaves.length === 1) return leaves[0];
  // Find the largest power of two strictly less than leaves.length
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  const left = rootFromLeaves(leaves.slice(0, k));
  const right = rootFromLeaves(leaves.slice(k));
  return hashNode(left, right);
}

/**
 * In-memory reference log. Production replaces the backing store with
 * a durable append-only system (S3 + DynamoDB / Postgres + WAL / etc.).
 */
export class TransparencyLog {
  private entries: LogEntry[] = [];
  private leafHashes: Uint8Array[] = [];
  private sthHistory: SignedTreeHead[] = [];

  constructor(
    private readonly opts: {
      log_id: string;
      signer: SigningProvider;
    }
  ) {}

  /**
   * Append a receipt leaf to the log. Returns the log_index.
   * Production gates this with an authenticated submitter token.
   */
  async append(
    leafHashHex: string,
    receiptId: string,
    tenantId: string
  ): Promise<LogEntry> {
    const leaf = hexToBytes(leafHashHex);
    if (leaf.length !== 32) {
      throw new Error(`leaf hash must be 32 bytes (got ${leaf.length})`);
    }
    const entry: LogEntry = {
      log_index: this.entries.length,
      leaf_hash: leafHashHex,
      tenant_id: tenantId,
      receipt_id: receiptId,
      integrated_time: new Date().toISOString(),
    };
    this.entries.push(entry);
    this.leafHashes.push(leaf);
    return entry;
  }

  /** Append-many for batch submissions. */
  async appendBatch(
    entries: { leaf_hash: string; receipt_id: string; tenant_id: string }[]
  ): Promise<LogEntry[]> {
    const out: LogEntry[] = [];
    for (const e of entries) {
      out.push(await this.append(e.leaf_hash, e.receipt_id, e.tenant_id));
    }
    return out;
  }

  /** Current tree size. */
  size(): number {
    return this.entries.length;
  }

  /** Current Merkle root, hex. */
  currentRoot(): string {
    return bytesToHex(rootFromLeaves(this.leafHashes));
  }

  /**
   * Sign a tree head. Operator MUST do this on a fixed cadence.
   * The STH is what the world uses to detect log rewrites.
   */
  async publishSth(): Promise<SignedTreeHead> {
    const treeSize = this.entries.length;
    const rootHash = this.currentRoot();
    const timestamp = new Date().toISOString();

    // Canonical payload signed: tree_size | root_hash | timestamp | log_id
    const payload = new TextEncoder().encode(
      JSON.stringify({
        tree_size: treeSize,
        root_hash: rootHash,
        timestamp,
        log_id: this.opts.log_id,
      })
    );
    const sig = await this.opts.signer.sign(payload);

    const sth: SignedTreeHead = {
      tree_size: treeSize,
      root_hash: rootHash,
      timestamp,
      log_id: this.opts.log_id,
      signature: {
        alg: this.opts.signer.algorithm,
        kid: this.opts.signer.kid,
        sig,
      },
    };
    this.sthHistory.push(sth);
    return sth;
  }

  /** Get an inclusion proof for a leaf at tree_size (RFC 9162 PATH order: bottom-up). */
  proveInclusion(log_index: number, tree_size: number): InclusionProof {
    if (log_index < 0 || log_index >= tree_size || tree_size > this.leafHashes.length) {
      throw new Error("invalid log_index or tree_size");
    }
    const leaves = this.leafHashes.slice(0, tree_size);
    const path: string[] = [];

    function inner(start: number, end: number, target: number) {
      const n = end - start;
      if (n <= 1) return;
      let k = 1;
      while (k * 2 < n) k *= 2;
      if (target - start < k) {
        // Target in LEFT subtree: recurse first (deeper levels), then push right-subtree root
        inner(start, start + k, target);
        path.push(bytesToHex(rootFromLeaves(leaves.slice(start + k, end))));
      } else {
        inner(start + k, end, target);
        path.push(bytesToHex(rootFromLeaves(leaves.slice(start, start + k))));
      }
    }
    inner(0, tree_size, log_index);
    return { log_index, tree_size, audit_path: path };
  }

  /**
   * Consistency proof between two tree sizes. Auditors use this to
   * detect log rewrites: if the proof fails, the log has been tampered
   * with between the two STHs.
   */
  proveConsistency(first_size: number, second_size: number): ConsistencyProof {
    if (first_size > second_size || second_size > this.leafHashes.length) {
      throw new Error("invalid consistency proof request");
    }
    if (first_size === 0 || first_size === second_size) {
      return { first_size, second_size, proof: [] };
    }
    const leaves = this.leafHashes.slice(0, second_size);
    const path: string[] = [];

    function inner(start: number, end: number, m: number, b: boolean) {
      const n = end - start;
      if (n <= 1) return;
      let k = 1;
      while (k * 2 < n) k *= 2;
      if (m - start <= k) {
        if (m - start < k || !b) {
          path.push(bytesToHex(rootFromLeaves(leaves.slice(start + k, end))));
        }
        inner(start, start + k, m, b);
      } else {
        path.push(bytesToHex(rootFromLeaves(leaves.slice(start, start + k))));
        inner(start + k, end, m, false);
      }
    }
    inner(0, second_size, first_size, true);
    return { first_size, second_size, proof: path };
  }

  /**
   * Verify an RFC 9162 inclusion proof against a known root hash.
   *
   * Recursive verifier mirrors the proof construction exactly:
   * walk top-down to find the target's subtree, get the leaf hash,
   * then combine with the sibling root (last element in audit_path).
   */
  static verifyInclusion(
    leafHashHex: string,
    proof: InclusionProof,
    expectedRootHex: string
  ): boolean {
    const leaf = hexToBytes(leafHashHex);
    if (leaf.length !== 32) return false;

    function climb(
      start: number,
      end: number,
      target: number,
      path: string[],
      pos: number
    ): { hash: Uint8Array; pos: number } | null {
      const n = end - start;
      if (n <= 1) return { hash: leaf, pos };
      let k = 1;
      while (k * 2 < n) k *= 2;
      if (target - start < k) {
        const inner = climb(start, start + k, target, path, pos);
        if (!inner) return null;
        if (inner.pos >= path.length) return null;
        const sib = hexToBytes(path[inner.pos]);
        if (sib.length !== 32) return null;
        return { hash: hashNode(inner.hash, sib), pos: inner.pos + 1 };
      } else {
        const inner = climb(start + k, end, target, path, pos);
        if (!inner) return null;
        if (inner.pos >= path.length) return null;
        const sib = hexToBytes(path[inner.pos]);
        if (sib.length !== 32) return null;
        return { hash: hashNode(sib, inner.hash), pos: inner.pos + 1 };
      }
    }

    const result = climb(0, proof.tree_size, proof.log_index, proof.audit_path, 0);
    if (!result) return false;
    if (result.pos !== proof.audit_path.length) return false;
    return bytesToHex(result.hash) === expectedRootHex.toLowerCase();
  }

  /** Return the recent STH history. */
  sths(): SignedTreeHead[] {
    return [...this.sthHistory];
  }

  /** Search entries by tenant for the demo + operator console. */
  byTenant(tenantId: string): LogEntry[] {
    return this.entries.filter((e) => e.tenant_id === tenantId);
  }
}
