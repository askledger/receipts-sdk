// Sweep-3 regressions: dataset attestation hashing and model registry entry
// hashing. Every test here fails against the pre-fix implementation.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { attestDataset, type DatasetSnapshot } from "../src/data-lineage/dataset-attestation.js";
import { ModelRegistry, type ModelRegistration } from "../src/registries/model-registry.js";

// A deliberately independent mini-JCS: sort object keys by code unit, then
// stringify. Sufficient for the ASCII-key / string / integer / array values
// used here, and it does not import the SDK's own canonicalizer, so these
// assertions stand in for a third-party verifier rather than re-running our
// implementation against itself.
function jcsSha256(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sortKeys(val)])
      );
    }
    return v;
  };
  return createHash("sha256")
    .update(new TextEncoder().encode(JSON.stringify(sortKeys(value))))
    .digest("hex");
}

function snap(over: Partial<DatasetSnapshot> = {}): DatasetSnapshot {
  return {
    tenant_id: "acme",
    dataset_id: "fraud-train",
    version: "2026-Q2",
    files: [{ path: "clean_2026.parquet", size_bytes: 3_000_000, sha256: "a".repeat(64) }],
    schema: { columns: [{ name: "tx_id", type: "string" }] },
    source_uris: ["s3://acme/fraud-train"],
    privacy: { contains_pii: false, redaction_applied: [] },
    ...over,
  };
}

describe("dataset attestation: path and size are inside the hash", () => {
  it("different file paths, same content digest, produce different hashes", () => {
    const clean = attestDataset(snap());
    const dirty = attestDataset(
      snap({
        files: [
          { path: "UNAUDITED_scraped_pii.parquet", size_bytes: 3_000_000, sha256: "a".repeat(64) },
        ],
      })
    );
    // Pre-fix: the Merkle leaf was f.sha256 alone, so these were identical and
    // an Annex IV reviewer could not tell the two training sets apart.
    expect(dirty.files_hash).not.toBe(clean.files_hash);
    expect(dirty.manifest_hash).not.toBe(clean.manifest_hash);
  });

  it("different file sizes produce different hashes", () => {
    const small = attestDataset(snap());
    const huge = attestDataset(
      snap({
        files: [{ path: "clean_2026.parquet", size_bytes: 1_000_000_000, sha256: "a".repeat(64) }],
      })
    );
    expect(huge.files_hash).not.toBe(small.files_hash);
    expect(huge.manifest_hash).not.toBe(small.manifest_hash);
  });

  it("file_count and total_bytes are inside the manifest preimage", () => {
    const att = attestDataset(snap());
    expect(att.file_count).toBe(1);
    expect(att.total_bytes).toBe(3_000_000);

    // Reconstruct the manifest preimage the way a verifier would, once with the
    // reported counts and once without them (the pre-fix shape). Only the
    // version carrying file_count/total_bytes may reproduce manifest_hash;
    // otherwise the counts published in the attestation and in the emitted
    // RawEvent are unsigned free text.
    const common = {
      dataset_id: att.dataset_id,
      files_hash: att.files_hash,
      license: null,
      lineage_hash: att.lineage_hash,
      privacy: { contains_pii: false, redaction_applied: [] },
      schema_hash: att.schema_hash,
      source_uris: ["s3://acme/fraud-train"],
      tenant_id: att.tenant_id,
      version: att.version,
    };
    const withCounts = jcsSha256({
      ...common,
      file_count: att.file_count,
      total_bytes: att.total_bytes,
    });
    const withoutCounts = jcsSha256(common);
    expect(att.manifest_hash).toBe(withCounts);
    expect(att.manifest_hash).not.toBe(withoutCounts);
  });
});

describe("dataset attestation: CVE-2012-2459 duplicate-last-node", () => {
  it("N leaves and N+1 leaves with a repeated last file give different roots", () => {
    // Pre-fix the odd node was duplicated rather than promoted, so a 3-file
    // dataset and the same dataset with its last file listed twice collapsed to
    // one files_hash. Files are chosen so the duplicate sorts last.
    const f1 = { path: "f1", size_bytes: 1, sha256: "11".padEnd(64, "0") };
    const f2 = { path: "f2", size_bytes: 2, sha256: "22".padEnd(64, "0") };
    const f3 = { path: "f3", size_bytes: 3, sha256: "33".padEnd(64, "0") };
    const three = attestDataset(snap({ files: [f1, f2, f3] }));
    const threePlusDup = attestDataset(snap({ files: [f1, f2, f3, { ...f3 }] }));
    expect(threePlusDup.files_hash).not.toBe(three.files_hash);
  });
});

describe("dataset attestation: leaf/node domain separation", () => {
  it("a single-leaf root is not the raw content digest of the file record", () => {
    // With no 0x00 prefix the one-file root was just the leaf bytes, which put
    // leaves and internal preimages in one domain. Assert the leaf is hashed
    // with the RFC 9162 leaf prefix.
    const one = attestDataset(snap());
    const record = { path: "clean_2026.parquet", sha256: "a".repeat(64), size_bytes: 3_000_000 };
    const preimage = new TextEncoder().encode(JSON.stringify(record)); // JCS order for these keys
    const unprefixed = createHash("sha256").update(preimage).digest("hex");
    const prefixed = createHash("sha256")
      .update(Buffer.concat([Buffer.from([0x00]), Buffer.from(preimage)]))
      .digest("hex");
    expect(one.files_hash).toBe(prefixed);
    expect(one.files_hash).not.toBe(unprefixed);
  });

  it("two-leaf internal node uses the 0x01 prefix, not bare concatenation", () => {
    const fa = { path: "a", size_bytes: 1, sha256: "11".padEnd(64, "0") };
    const fb = { path: "b", size_bytes: 2, sha256: "22".padEnd(64, "0") };
    const two = attestDataset(snap({ files: [fa, fb] }));

    const leaf = (f: typeof fa) => {
      const p = new TextEncoder().encode(
        JSON.stringify({ path: f.path, sha256: f.sha256, size_bytes: f.size_bytes })
      );
      return createHash("sha256")
        .update(Buffer.concat([Buffer.from([0x00]), Buffer.from(p)]))
        .digest();
    };
    const la = leaf(fa);
    const lb = leaf(fb);
    const withPrefix = createHash("sha256")
      .update(Buffer.concat([Buffer.from([0x01]), la, lb]))
      .digest("hex");
    const withoutPrefix = createHash("sha256").update(Buffer.concat([la, lb])).digest("hex");
    expect(two.files_hash).toBe(withPrefix);
    expect(two.files_hash).not.toBe(withoutPrefix);
  });
});

describe("dataset attestation: manifest_hash is RFC 8785", () => {
  it("is independent of snapshot key insertion order", () => {
    const ordered = attestDataset(snap());
    // Same logical snapshot, keys supplied in a different order (as any store
    // or JSON round-trip may hand them back).
    const reordered = attestDataset({
      privacy: { redaction_applied: [], contains_pii: false },
      source_uris: ["s3://acme/fraud-train"],
      schema: { columns: [{ type: "string", name: "tx_id" } as never] },
      files: [{ sha256: "a".repeat(64), size_bytes: 3_000_000, path: "clean_2026.parquet" }],
      version: "2026-Q2",
      dataset_id: "fraud-train",
      tenant_id: "acme",
    });
    expect(reordered.manifest_hash).toBe(ordered.manifest_hash);
    expect(reordered.files_hash).toBe(ordered.files_hash);
    expect(reordered.schema_hash).toBe(ordered.schema_hash);
  });

  it("manifest_hash matches an independently canonicalized recomputation", () => {
    const att = attestDataset(snap());
    // A third party reconstructs the manifest with keys in a different literal
    // order and must land on the same hash. Pre-fix (JSON.stringify) it did not.
    const expected = jcsSha256({
      version: att.version,
      total_bytes: att.total_bytes,
      tenant_id: att.tenant_id,
      source_uris: ["s3://acme/fraud-train"],
      schema_hash: att.schema_hash,
      privacy: { redaction_applied: [], contains_pii: false },
      lineage_hash: att.lineage_hash,
      license: null,
      files_hash: att.files_hash,
      file_count: att.file_count,
      dataset_id: att.dataset_id,
    });
    expect(att.manifest_hash).toBe(expected);
  });
});

describe("model registry: entryHash is RFC 8785", () => {
  const base: ModelRegistration = {
    id: "m1",
    tenant_id: "acme",
    name: "Fraud scorer",
    vendor: "anthropic",
    vendor_model_id: "claude-x",
    version: "1.0.0",
    capability: "classification",
    validation_status: "approved",
    approved_use_case_ids: ["uc-1"],
    model_owner: "mrm@acme.example",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("is independent of key insertion order", () => {
    const reordered = {
      updated_at: base.updated_at,
      created_at: base.created_at,
      model_owner: base.model_owner,
      approved_use_case_ids: ["uc-1"],
      validation_status: base.validation_status,
      capability: base.capability,
      version: base.version,
      vendor_model_id: base.vendor_model_id,
      vendor: base.vendor,
      name: base.name,
      tenant_id: base.tenant_id,
      id: base.id,
    } as ModelRegistration;
    // Pre-fix these differed, which broke previous_version_hash chains for any
    // registration that had round-tripped through a key-reordering store.
    expect(ModelRegistry.entryHash(reordered)).toBe(ModelRegistry.entryHash(base));
  });

  it("audit chain still verifies across a JSON round-trip that reorders keys", () => {
    const reg = new ModelRegistry();
    reg.register(base);
    const v1 = reg.get("m1")!;
    const v1Hash = ModelRegistry.entryHash(v1);

    reg.register({ ...base, version: "2.0.0" });
    const v2 = reg.get("m1")!;
    expect(v2.previous_version_hash).toBe(v1Hash);

    // Reorder v1's keys as a store would, then re-verify the recorded link.
    const roundTripped = Object.fromEntries(
      Object.entries(v1).sort(([a], [b]) => b.localeCompare(a))
    ) as ModelRegistration;
    expect(ModelRegistry.entryHash(roundTripped)).toBe(v2.previous_version_hash);
  });

  it("matches an independent RFC 8785 recomputation of the entry", () => {
    // An auditor holding the entry must be able to recompute the chain link
    // without knowing the literal key order our struct happens to use.
    expect(ModelRegistry.entryHash(base)).toBe(jcsSha256(base));
    // ...and a real field change must still move the hash.
    expect(ModelRegistry.entryHash({ ...base, validation_status: "revoked" })).not.toBe(
      ModelRegistry.entryHash(base)
    );
  });
});
