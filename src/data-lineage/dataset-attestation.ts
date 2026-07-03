// Dataset attestation. Sign a snapshot of a dataset (file hashes,
// schema hash, lineage hashes) so a downstream model receipt can
// reference exactly the training/eval data it was built on.

import { createHash } from "node:crypto";
import type { RawEvent } from "../types.js";

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
  const filesSorted = snap.files.slice().sort((a, b) => a.sha256.localeCompare(b.sha256));
  const files_hash = merkleRoot(filesSorted.map((f) => f.sha256));
  const schema_hash = sha256Hex(JSON.stringify(snap.schema.columns));
  const lineage_hash = sha256Hex(JSON.stringify((snap.parent_datasets ?? []).slice().sort()));
  const manifest_hash = sha256Hex(JSON.stringify({
    tenant_id: snap.tenant_id,
    dataset_id: snap.dataset_id,
    version: snap.version,
    files_hash,
    schema_hash,
    lineage_hash,
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
    file_count: snap.files.length,
    total_bytes: snap.files.reduce((n, f) => n + f.size_bytes, 0),
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

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");
  let layer: Uint8Array[] = leaves.map((h) => Uint8Array.from(Buffer.from(h, "hex")));
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = i + 1 < layer.length ? layer[i + 1] : layer[i];
      const concat = new Uint8Array(a.length + b.length);
      concat.set(a, 0);
      concat.set(b, a.length);
      next.push(Uint8Array.from(createHash("sha256").update(concat).digest()));
    }
    layer = next;
  }
  return Array.from(layer[0], (b) => b.toString(16).padStart(2, "0")).join("");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
