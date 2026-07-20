// Dataset attestation. Sign a snapshot of a dataset (file hashes,
// schema hash, lineage hashes) so a downstream model receipt can
// reference exactly the training/eval data it was built on.
//
// NOTE: the hash construction below (leaf contents, domain separation, RFC 8785
// canonicalization) changed deliberately during hardening. Every hash in this
// module is therefore different from previously issued attestations. That break
// is intended: the old values did not commit to what they claimed to, so
// re-attesting is the only way to get a manifest an auditor can rely on.

import { createHash } from "node:crypto";
import type { RawEvent } from "../types.js";
import { canonicalizeBytes } from "../canonicalize.js";

export interface DatasetFile {
  path: string;
  size_bytes: number;
  sha256: string;
}

export interface DatasetSchema {
  columns: Array<{ name: string; type: string; nullable?: boolean }>;
}

export interface DatasetSnapshot {
  tenant_id: string;
  dataset_id: string;                   // tenant-scoped identifier
  version: string;                      // e.g. "2026-Q2"
  files: DatasetFile[];
  schema: DatasetSchema;
  source_uris: string[];                // e.g. s3://, https://huggingface.co/...
  license?: string;
  privacy: {
    contains_pii: boolean;
    redaction_applied: string[];        // e.g. ["email","phone","ssn"]
    consent_basis?: string;             // e.g. "GDPR Art. 6(1)(a)"
  };
  parent_datasets?: string[];           // lineage chain (other dataset_ids)
}

export interface DatasetAttestation {
  schema_version: "1.0";
  tenant_id: string;
  dataset_id: string;
  version: string;
  manifest_hash: string;                // hash of canonicalised snapshot
  files_hash: string;                   // Merkle root of file hashes
  schema_hash: string;
  lineage_hash: string;
  file_count: number;
  total_bytes: number;
  generated_at: string;
}

export function attestDataset(snap: DatasetSnapshot): DatasetAttestation {
  // Each Merkle leaf commits to the WHOLE file record, not just its content
  // digest. Previously the leaf was `f.sha256` alone, so `path` and
  // `size_bytes` never reached manifest_hash: a 3 MB dataset of
  // `clean_2026.parquet` and a 1 GB dataset of `UNAUDITED_scraped_pii.parquet`
  // attested to byte-identical hashes as long as the content digests were
  // reused. An EU AI Act Annex IV reviewer auditing training-data provenance
  // was therefore verifying a hash that said nothing about which files, or how
  // much data, the model was actually trained on.
  const filesSorted = snap.files
    .slice()
    .sort((a, b) =>
      a.sha256.localeCompare(b.sha256) ||
      a.path.localeCompare(b.path) ||
      a.size_bytes - b.size_bytes
    );
  const files_hash = merkleRoot(
    filesSorted.map((f) =>
      // RFC 8785 so the leaf preimage is reproducible by a third-party
      // verifier that reconstructs the record with different key order.
      canonicalizeBytes({ path: f.path, sha256: f.sha256, size_bytes: f.size_bytes })
    )
  );
  const schema_hash = sha256Hex(canonicalizeBytes(snap.schema.columns));
  const lineage_hash = sha256Hex(canonicalizeBytes((snap.parent_datasets ?? []).slice().sort()));
  const file_count = snap.files.length;
  const total_bytes = snap.files.reduce((n, f) => n + f.size_bytes, 0);
  // manifest_hash is RFC 8785, not JSON.stringify. JSON.stringify preserves
  // insertion order, so the hash was only reproducible by code that rebuilt
  // this object literal in exactly this order. Any independent verifier, or
  // any manifest that round-tripped through a store that reorders keys,
  // computed a different hash and concluded the attestation was tampered with.
  //
  // file_count and total_bytes are inside the hash: they are reported in the
  // attestation and in the emitted RawEvent, so leaving them out let anyone
  // restate the dataset's size while keeping a "valid" manifest_hash.
  const manifest_hash = sha256Hex(canonicalizeBytes({
    tenant_id: snap.tenant_id,
    dataset_id: snap.dataset_id,
    version: snap.version,
    files_hash,
    schema_hash,
    lineage_hash,
    file_count,
    total_bytes,
    source_uris: snap.source_uris.slice().sort(),
    license: snap.license ?? null,
    privacy: snap.privacy,
  }));
  return {
    schema_version: "1.0",
    tenant_id: snap.tenant_id,
    dataset_id: snap.dataset_id,
    version: snap.version,
    manifest_hash,
    files_hash,
    schema_hash,
    lineage_hash,
    file_count,
    total_bytes,
    generated_at: new Date().toISOString(),
  };
}

export function toRawEvent(att: DatasetAttestation): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: att.tenant_id,
    event_type: "data.dataset_attestation",
    source_system: "pl-data-lineage",
    event_id: `ds-${att.dataset_id}-${att.version}`,
    captured_at: att.generated_at,
    payload: {
      input_classification: "internal",
      metadata: {
        dataset_id: att.dataset_id,
        version: att.version,
        manifest_hash: att.manifest_hash,
        files_hash: att.files_hash,
        schema_hash: att.schema_hash,
        lineage_hash: att.lineage_hash,
        file_count: att.file_count,
        total_bytes: att.total_bytes,
      },
    },
  };
}

// RFC 9162 (Certificate Transparency v2) domain separation, matching
// src/merkle.ts:
//
//   leaf_hash     = SHA-256(0x00 || leaf_preimage)
//   internal_hash = SHA-256(0x01 || left || right)
//
// Without the prefixes a 32-byte leaf and a 64-byte internal preimage lived in
// the same hash domain, which is a real second-preimage here: a one-file
// dataset whose leaf happened to equal the concatenation of two other leaves
// produced the same files_hash as the corresponding two-file dataset, so an
// attester could claim a different file set under an already-published root.
const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
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

function sha256Bytes(b: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(b).digest());
}

function merkleRoot(leafPreimages: Uint8Array[]): string {
  if (leafPreimages.length === 0) return sha256Hex(new Uint8Array(0));
  let layer: Uint8Array[] = leafPreimages.map((p) => sha256Bytes(concatBytes(LEAF_PREFIX, p)));
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : undefined;
      if (!right) {
        // Odd level: promote the last node unchanged (RFC 9162), do NOT
        // duplicate it. Duplicating is CVE-2012-2459: a tree of N leaves and a
        // tree of N+1 leaves whose extra leaf repeats the last one collapse to
        // the same root, so two different file sets attest to one files_hash.
        next.push(left);
      } else {
        next.push(sha256Bytes(concatBytes(NODE_PREFIX, left, right)));
      }
    }
    layer = next;
  }
  return Buffer.from(layer[0]).toString("hex");
}

function sha256Hex(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}
