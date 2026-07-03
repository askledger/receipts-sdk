import { describe, it, expect } from "vitest";
import { buildWorkpaper, renderWorkpaperMarkdown, type ReceiptSummary } from "../src/mrm/index.js";
import { buildBundle, type UnderwritingInput } from "../src/insurance/bundle.js";
import { score, renderHTML, type VendorSample } from "../src/benchmark/index.js";
import { attestDataset, toRawEvent } from "../src/data-lineage/dataset-attestation.js";

function rs(overrides: Partial<ReceiptSummary> = {}): ReceiptSummary {
  return {
    receipt_id: `r-${Math.random().toString(36).slice(2, 9)}`,
    issued_at: new Date().toISOString(),
    tenant_id: "acme",
    model_id: "anthropic:claude-sonnet-4-6:20251101",
    use_case_id: "credit-decline",
    event_type: "ai.model_invocation",
    applied_policies: ["EU_AI_ACT_ART50", "GDPR_ART22"],
    ...overrides,
  };
}

describe("MRM workpaper engine", () => {
  it("builds a workpaper with model inventory + monitoring + citations", () => {
    const receipts: ReceiptSummary[] = [
      ...Array.from({ length: 80 }, () => rs({ decision: "allow", outcome: "success" })),
      ...Array.from({ length: 8 },  () => rs({ decision: "block", outcome: "success" })),
      ...Array.from({ length: 12 }, () => rs({ decision: "flag",  outcome: "success" })),
    ];
    const w = buildWorkpaper({ tenant_id: "acme", regulator: "SR_11_7", period_start: "2026-04-01", period_end: "2026-06-30", receipts });
    expect(w.regulator).toBe("SR_11_7");
    expect(w.sections.model_inventory).toHaveLength(1);
    expect(w.sections.ongoing_monitoring.total_invocations).toBe(100);
    expect(w.sections.ongoing_monitoring.total_blocks).toBe(8);
    expect(w.citations.some((c) => c.startsWith("SR 11-7"))).toBe(true);
    expect(w.attestation.canonical_bytes_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits a high-severity finding when error rate > 5%", () => {
    const receipts: ReceiptSummary[] = [
      ...Array.from({ length: 80 }, () => rs({ outcome: "success" })),
      ...Array.from({ length: 20 }, () => rs({ outcome: "error" })),
    ];
    const w = buildWorkpaper({ tenant_id: "acme", regulator: "OSFI_E_23", period_start: "x", period_end: "y", receipts });
    const high = w.sections.findings.filter((f) => f.severity === "high");
    expect(high.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Markdown that includes every required section", () => {
    const w = buildWorkpaper({ tenant_id: "acme", regulator: "PRA_SS1_23", period_start: "x", period_end: "y",
      receipts: [rs(), rs({ decision: "block" })] });
    const md = renderWorkpaperMarkdown(w);
    expect(md).toContain("PRA SS1 23");
    expect(md).toContain("## Model inventory");
    expect(md).toContain("## Ongoing monitoring");
    expect(md).toContain("## Findings");
  });
});

describe("Insurance bundle", () => {
  const base: UnderwritingInput = {
    tenant_id: "acme", period_start: "2026-05-01", period_end: "2026-05-31",
    receipts_total: 100_000, receipts_blocked: 800, receipts_flagged: 1500, receipts_error: 200,
    receipts_reviewed: 95, high_severity_findings: 1, models_in_production: 4,
    regulators_covered: ["EU_AI_ACT", "SR_11_7", "GDPR"], uptime_pct: 0.9995,
    controls_passed: 64, controls_total: 66, prior_incidents: 0,
    data_residency: ["EU", "US"],
  };

  it("scores composite risk in [0,100] with carrier-specific premium inputs", () => {
    const b = buildBundle("MUNICH_RE_AISURE", base);
    expect(b.carrier).toBe("MUNICH_RE_AISURE");
    expect(b.risk_score.composite).toBeGreaterThanOrEqual(0);
    expect(b.risk_score.composite).toBeLessThanOrEqual(100);
    expect(b.premium_inputs.ms_form).toBe("aisure-v3.2");
    expect(["A","B","C","D","E"]).toContain(b.premium_inputs.ms_class as string);
  });

  it("Mosaic and Armilla carriers carry their own input shapes", () => {
    expect((buildBundle("MOSAIC", base).premium_inputs.msc_layer as string)).toBe("primary");
    expect((buildBundle("ARMILLA", base).premium_inputs.arm_loss_model as string)).toBe("freq-sev-2025");
  });

  it("attestation hash is deterministic for identical input", () => {
    const a = buildBundle("GENERIC", base);
    const b = buildBundle("GENERIC", base);
    expect(a.attestation.canonical_bytes_hash).toBe(b.attestation.canonical_bytes_hash);
  });

  it("worse exposure → higher composite", () => {
    const better = buildBundle("GENERIC", base);
    const worse = buildBundle("GENERIC", { ...base, receipts_error: 8000, prior_incidents: 3, high_severity_findings: 12 });
    expect(worse.risk_score.composite).toBeGreaterThan(better.risk_score.composite);
  });
});

describe("Public vendor benchmark", () => {
  const samples: VendorSample[] = [
    { vendor: "anthropic", model: "claude-sonnet-4-6", invocations: 10000, blocked: 50, flagged: 100, errors: 30, reviewed: 9000, input_tokens: 2_000_000, output_tokens: 500_000, high_severity_findings: 0 },
    { vendor: "openai",    model: "gpt-5",             invocations: 9000,  blocked: 90, flagged: 250, errors: 60, reviewed: 7000, input_tokens: 1_800_000, output_tokens: 600_000, high_severity_findings: 1 },
    { vendor: "google",    model: "gemini-2-5-pro",    invocations: 6000,  blocked: 40, flagged: 80,  errors: 20, reviewed: 5400, input_tokens: 1_200_000, output_tokens: 300_000, high_severity_findings: 0 },
  ];

  it("ranks per-vendor scores into four lists", () => {
    const r = score(samples);
    expect(r.by_vendor).toHaveLength(3);
    expect(r.rankings.hallucination).toHaveLength(3);
    expect(r.rankings.cost_per_outcome).toHaveLength(3);
    expect(r.rankings.compliance_posture).toHaveLength(3);
    expect(r.rankings.supply_chain).toHaveLength(3);
    expect(r.sample_size).toBe(25000);
  });

  it("composite is in [0,100] for every vendor", () => {
    const r = score(samples);
    for (const v of r.by_vendor) {
      expect(v.composite).toBeGreaterThanOrEqual(0);
      expect(v.composite).toBeLessThanOrEqual(100);
    }
  });

  it("renders HTML with one row per vendor", () => {
    const html = renderHTML(score(samples));
    const rowMatches = html.match(/<tr>\s*<td>/g) ?? [];
    expect(rowMatches.length).toBe(3);
  });
});

describe("Dataset attestation", () => {
  it("produces stable manifest hash for identical snapshots", () => {
    const snap = {
      tenant_id: "acme", dataset_id: "fraud-train", version: "2026-Q2",
      files: [
        { path: "a.parquet", size_bytes: 1024, sha256: "a".repeat(64) },
        { path: "b.parquet", size_bytes: 2048, sha256: "b".repeat(64) },
      ],
      schema: { columns: [{ name: "tx_id", type: "string" }, { name: "amount", type: "decimal" }] },
      source_uris: ["s3://acme/fraud-train/2026-Q2"],
      privacy: { contains_pii: false, redaction_applied: ["email"] },
    };
    const a = attestDataset(snap);
    const b = attestDataset(snap);
    expect(a.manifest_hash).toBe(b.manifest_hash);
    expect(a.files_hash).toBe(b.files_hash);
    expect(a.file_count).toBe(2);
    expect(a.total_bytes).toBe(3072);
  });

  it("toRawEvent produces a chainable event", () => {
    const att = attestDataset({
      tenant_id: "acme", dataset_id: "x", version: "1",
      files: [{ path: "x", size_bytes: 1, sha256: "0".repeat(64) }],
      schema: { columns: [] }, source_uris: [], privacy: { contains_pii: false, redaction_applied: [] },
    });
    const ev = toRawEvent(att);
    expect(ev.event_type).toBe("data.dataset_attestation");
    expect(ev.tenant_id).toBe("acme");
  });

  it("file-order independence — sorted Merkle gives same root", () => {
    const files = [
      { path: "a", size_bytes: 1, sha256: "11".padEnd(64, "0") },
      { path: "b", size_bytes: 1, sha256: "22".padEnd(64, "0") },
      { path: "c", size_bytes: 1, sha256: "33".padEnd(64, "0") },
    ];
    const a = attestDataset({ tenant_id: "t", dataset_id: "d", version: "v", files, schema: { columns: [] }, source_uris: [], privacy: { contains_pii: false, redaction_applied: [] } });
    const b = attestDataset({ tenant_id: "t", dataset_id: "d", version: "v", files: files.slice().reverse(), schema: { columns: [] }, source_uris: [], privacy: { contains_pii: false, redaction_applied: [] } });
    expect(a.files_hash).toBe(b.files_hash);
  });
});
