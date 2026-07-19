/**
 * Regression tests for the end-to-end hardening sweep.
 *
 * Every test here failed before its corresponding fix. They are grouped by the
 * property being defended, not by module, because the shared theme is that an
 * evidence product must never (a) attest to a number it did not recompute,
 * (b) let caller-controlled text escape into a rendered artifact, or
 * (c) throw where it promised to report.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../src/crypto.js";
import { receiptsFromWorkloads } from "../src/cost/ingest.js";
import { summarizeReceipts } from "../src/cost/dashboard.js";
import { buildBaseline, proveSavings, verifySavingsProof } from "../src/cost/savings.js";
import { InMemorySavings, rollup } from "../src/cost/savings-ledger.js";
import { buildWorkpaper, renderWorkpaperMarkdown, type ReceiptSummary } from "../src/mrm/index.js";
import { computeScore, renderBadgeSvg } from "../src/receipt-score/score.js";
import { KeyRegistry } from "../src/key-management.js";
import { formatSyslog5424, toExportEvent } from "../src/exporters/event.js";
import { exportReceipts } from "../src/exporters/index.js";
import { WebhookSink } from "../src/exporters/sinks.js";
import { loadChainState, saveChainState } from "../src/chain.js";
import { PostgresChainStateStore } from "../src/chain-store.js";
import {
  signReceipt,
  buildEvidencePack,
  verifyPackIntegrity,
  verifyAllReceiptsInPack,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

const NOW = "2026-07-08T00:00:00.000Z";

function summaryFor(model: string, requests: number) {
  const { receipts } = receiptsFromWorkloads([
    {
      vendor: model.startsWith("gpt") ? "openai" : "anthropic",
      model,
      app: "svc",
      requests,
      inputTotal: 500 * requests,
      outputTotal: 200 * requests,
      at: "2026-06-01T00:00:00Z",
    },
  ]);
  return summarizeReceipts(receipts);
}

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "sweep-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

describe("attested numbers are recomputed, not trusted", () => {
  it("a savings proof whose headline percentage was edited fails verification", () => {
    const kp = generateKeyPair();
    const pub = { [kp.kid]: kp.public_key };
    const b = buildBaseline(summaryFor("gpt-5", 10000), { label: "june", issuedAt: NOW, keypair: kp });
    const proof = proveSavings(b, summaryFor("gpt-5-mini", 10000), { issuedAt: NOW, keypair: kp });

    // The percentage is the number a CFO reads. Inflate only that field; every
    // other figure, and the baseline hash, stays internally consistent.
    const tampered = {
      ...proof,
      savings: { ...proof.savings, normalizedSavingsPct: 0.95 },
    };
    const v = verifySavingsProof(tampered, { publicKeys: pub });
    expect(v.checks.savings_math_matches).toBe(false);
    expect(v.valid).toBe(false);
  });
});

describe("retired keys fail closed", () => {
  it("trustedKeys() with no timestamp excludes a retired key", () => {
    const reg = new KeyRegistry();
    const kp = generateKeyPair();
    reg.add({ kid: kp.kid, public_key: kp.public_key, algorithm: "EdDSA", curve: "ed25519" });
    expect(reg.trustedKeys()[kp.kid]).toBe(kp.public_key);

    reg.retire(kp.kid);
    // The common call site passes no `at`. It must not silently keep trusting
    // a key the operator just retired.
    expect(reg.trustedKeys()[kp.kid]).toBeUndefined();
  });

  it("a retired key with an unparseable retired_at is excluded, not trusted", () => {
    const reg = new KeyRegistry();
    const kp = generateKeyPair();
    reg.add({ kid: kp.kid, public_key: kp.public_key, algorithm: "EdDSA", curve: "ed25519" });
    reg.retire(kp.kid);
    reg.get(kp.kid)!.retired_at = "not-a-date";
    // NaN comparisons are always false, which used to leave the key trusted.
    expect(reg.trustedKeys(new Date("2020-01-01T00:00:00Z"))[kp.kid]).toBeUndefined();
  });
});

describe("caller-controlled text cannot escape a rendered artifact", () => {
  it("a tenant name cannot inject markup into the Receipt Score badge", () => {
    const score = computeScore({
      ai_invocations_total: 100,
      ai_invocations_with_receipt: 10,
      receipts_verified: 1,
      receipts_verification_failures: 9,
      receipts_with_safety_findings: 10,
      safety_findings_handled: 0,
      regulators_cited: 0,
      receipts_in_transparency_log: 0,
    });
    expect(score.grade).toBe("F");

    const svg = renderBadgeSvg(score, `Acme"/><text>A+</text><script>alert(1)</script><x y="`);
    expect(svg).not.toContain("<script>");
    // The injected <text> must not survive as markup and repaint the grade.
    expect(svg).not.toContain("<text>A+</text>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
  });

  it("a model id cannot forge extra columns or rows in the MRM workpaper table", () => {
    const receipts: ReceiptSummary[] = [
      {
        receipt_id: "r1",
        issued_at: "2026-06-01T00:00:00.000Z",
        tenant_id: "t1",
        model_id: "openai:gpt-5|999|100%|CLEAN\n| evil:model | 1 | 1 |",
        use_case_id: "uc1",
        event_type: "gateway.request",
        applied_policies: [],
      },
    ];
    const md = renderWorkpaperMarkdown(
      buildWorkpaper({
        tenant_id: "t1",
        regulator: "SR_11_7",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        receipts,
      })
    );
    // Exactly one data row for the model inventory: the injected newline must
    // not have become a second row an auditor reads as a real model.
    expect(md).not.toContain("| evil:model |");
    expect(md).not.toMatch(/\n\| evil/);
  });

  it("a backslash before a pipe cannot re-open a workpaper table cell", () => {
    // Escaping `|` without first escaping `\` leaves `a\|b` as `a\\|b`, which
    // markdown reads as a literal backslash plus a LIVE delimiter. Caught by
    // CodeQL (js/incomplete-sanitization) against the first version of mdCell.
    const receipts: ReceiptSummary[] = [
      {
        receipt_id: "r1",
        issued_at: "2026-06-01T00:00:00.000Z",
        tenant_id: "t1",
        model_id: "openai:gpt-5\\|999|100%|CLEAN",
        use_case_id: "uc1",
        event_type: "gateway.request",
        applied_policies: [],
      },
    ];
    const md = renderWorkpaperMarkdown(
      buildWorkpaper({
        tenant_id: "t1",
        regulator: "SR_11_7",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        receipts,
      })
    );
    // No `\\` immediately followed by a live delimiter anywhere in the render.
    expect(md).not.toMatch(/[^\\]\\\\\|/);
    expect(md).toContain("\\\\\\|999");
  });
});

describe("caller-controlled keys cannot reach the prototype", () => {
  it("an intent of __proto__ is counted as a normal bucket", async () => {
    const store = new InMemorySavings();
    const entry = {
      ts: 1,
      tenant_id: "t1",
      intent: "__proto__",
      approved: true,
      planner_usd: 1,
      executor_usd: 1,
      total_usd: 2,
      baseline_usd: 5,
      savings_usd: 3,
    };
    await store.append(entry);
    await store.append({ ...entry, ts: 2 });

    const r = await rollup(store, 0);
    // Previously `??=` saw Object.prototype as an existing value, so the bucket
    // silently vanished from the rollup while the prototype got mutated.
    expect(r.by_intent["__proto__"]).toEqual({ count: 2, savings_usd: 6 });
    expect(({} as Record<string, unknown>).count).toBeUndefined();
    expect(JSON.parse(JSON.stringify(r)).by_intent["__proto__"]).toEqual({ count: 2, savings_usd: 6 });
  });
});

describe("malformed input is reported, not thrown", () => {
  it("formatSyslog5424 emits a valid record when issued_at is unparseable", () => {
    const kp = generateKeyPair();
    const signed = signReceipt({ event: evt("t-syslog", 1), keypair: kp });
    const ev = toExportEvent(signed);
    const line = formatSyslog5424({ ...ev, issued_at: "not-a-date" });
    // SyslogSink.format() runs outside its try block, so a throw here would
    // escape as an exception instead of the SinkResult the module promises.
    expect(line).toContain("1970-01-01T00:00:00.000Z");
    expect(line.split("\n")).toHaveLength(1);
  });

  it("a truncated Merkle audit path in an evidence pack fails, without crashing", () => {
    const kp = generateKeyPair();
    const tenant = "sweep-" + Math.random().toString(36).slice(2);
    const receipts = [1, 2, 3, 4, 5].map((i) => signReceipt({ event: evt(tenant, i), keypair: kp }));
    const pack = buildEvidencePack(
      {
        title: "t",
        tenantId: tenant,
        purpose: "unit test",
        period: { from: "2026-05-13", to: "2026-05-13" },
        builtBy: "test",
        builtAt: NOW,
      },
      receipts,
      []
    );
    expect(verifyAllReceiptsInPack(pack)).toHaveLength(0);

    const victim = receipts[0].receipt.receipt_id;
    const proof = pack.merkle.proofs[victim];
    // Truncation used to reach Buffer.from(undefined, "hex") and throw.
    const truncated = { ...pack, merkle: { ...pack.merkle, proofs: { ...pack.merkle.proofs, [victim]: { ...proof, audit_path: proof.audit_path.slice(0, -1) } } } };
    expect(() => verifyAllReceiptsInPack(truncated)).not.toThrow();
    expect(verifyAllReceiptsInPack(truncated).length).toBeGreaterThan(0);

    // Trailing padding nodes must be rejected too, not silently ignored.
    const padded = { ...pack, merkle: { ...pack.merkle, proofs: { ...pack.merkle.proofs, [victim]: { ...proof, audit_path: [...proof.audit_path, "00".repeat(32)] } } } };
    expect(verifyAllReceiptsInPack(padded).length).toBeGreaterThan(0);
  });
});

describe("fan-out reports each destination separately", () => {
  it("two sinks with the same class name do not collapse into one result", async () => {
    const kp = generateKeyPair();
    const receipts = [1, 2].map((i) => signReceipt({ event: evt("t-fanout", i), keypair: kp }));

    // The whole point of fan-out: the same sink type pointed at two endpoints.
    const okUrl = "https://siem.example/ok";
    const okSink = new WebhookSink({
      url: okUrl,
      fetchImpl: async () => new Response("", { status: 200 }),
    });
    const badSink = new WebhookSink({
      url: "https://partner.example/down",
      fetchImpl: async () => new Response("boom", { status: 500 }),
    });

    const report = await exportReceipts(receipts, {
      sinks: [okSink, badSink],
      retries: 0,
      sleep: async () => {},
    });

    // Two entries, not one merged "webhook" entry whose delivered count is the
    // sum across distinct destinations.
    expect(report.results).toHaveLength(2);
    expect(report.results[0].ok).toBe(true);
    expect(report.results[0].delivered).toBe(2);
    expect(report.results[1].ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("exporting zero receipts is a successful no-op", async () => {
    const report = await exportReceipts([], {
      sinks: [new WebhookSink({ url: "https://siem.example/ok", fetchImpl: async () => new Response("", { status: 200 }) })],
      sleep: async () => {},
    });
    // Previously ok:false, so a caller draining an empty queue looked like a
    // broken export pipeline.
    expect(report.ok).toBe(true);
    expect(report.events).toBe(0);
  });

  it("having events but no sinks configured is still a failure", async () => {
    const kp = generateKeyPair();
    const report = await exportReceipts([signReceipt({ event: evt("t-nosink", 1), keypair: kp })], {
      sinks: [],
      sleep: async () => {},
    });
    expect(report.ok).toBe(false);
  });
});

describe("tenant chain state files do not collide", () => {
  it("two tenants that sanitize to the same name keep separate chains", () => {
    // "acme.corp" and "acme/corp" both sanitized to "acme_corp", so all three
    // shared one state file: one tenant's receipts landed in another's chain,
    // and whoever wrote last silently reset the others.
    const suffix = Math.random().toString(36).slice(2);
    const names = [`acme.corp-${suffix}`, `acme_corp-${suffix}`, `acme/corp-${suffix}`];
    names.forEach((tenant_id, i) => {
      saveChainState({
        tenant_id,
        chain_height: (i + 1) * 10,
        previous_receipt_hash: String(i + 1).repeat(64),
        updated_at: NOW,
      });
    });
    names.forEach((tenant_id, i) => {
      const st = loadChainState(tenant_id);
      expect(st.tenant_id).toBe(tenant_id);
      expect(st.chain_height).toBe((i + 1) * 10);
    });
  });
});

describe("postgres row-level security gets a tenant context", () => {
  // A pool whose connect() hands out ONE client and records every statement,
  // so we can assert the tenant context and the guarded query share it.
  function poolWithConnect() {
    const stmts: Array<{ sql: string; params?: unknown[] }> = [];
    let released = 0;
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        stmts.push({ sql: sql.trim(), params });
        return { rows: [], rowCount: 0 };
      },
      release: () => {
        released++;
      },
    };
    return {
      stmts,
      releases: () => released,
      pool: {
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => client,
      },
    };
  }

  it("sets ledger.tenant_id in the same transaction as the read", async () => {
    const { pool, stmts, releases } = poolWithConnect();
    await new PostgresChainStateStore(pool).load("acme-bank");

    // The module documented "the reference implementation here issues SET LOCAL
    // for you" while no code ever did, so every RLS policy compared against
    // NULL and matched nothing.
    expect(stmts[0].sql).toBe("BEGIN");
    expect(stmts[1].sql).toContain("set_config('ledger.tenant_id', $1, true)");
    expect(stmts[1].params).toEqual(["acme-bank"]);
    // The guarded SELECT must come after the context, on this same client.
    expect(stmts[2].sql).toContain("FROM ledger_chain_state");
    expect(stmts[3].sql).toBe("COMMIT");
    expect(releases()).toBe(1);
  });

  it("advance() also runs under a tenant context, and releases on failure", async () => {
    const { pool, stmts, releases } = poolWithConnect();
    const store = new PostgresChainStateStore(pool);
    // rowCount 0 => CAS lost => ConcurrentChainWriteError after a re-read.
    await expect(
      store.advance(
        { tenant_id: "acme-bank", chain_height: 4, previous_receipt_hash: "aa", updated_at: NOW },
        "bb",
        "r-9"
      )
    ).rejects.toThrow();
    expect(stmts.filter((s) => s.sql.includes("set_config")).length).toBeGreaterThanOrEqual(1);
    expect(stmts.some((s) => s.sql.startsWith("UPDATE"))).toBe(true);
    // Connections must go back to the pool on every path.
    expect(releases()).toBe(2); // the failed advance, then the re-read
  });

  it("still works with a bare pool that cannot check out a connection", async () => {
    // Backward compatibility: no connect() means no tenant context is possible,
    // and the store must not crash trying.
    const st = await new PostgresChainStateStore({
      query: async () => ({ rows: [], rowCount: 0 }),
    }).load("acme-bank");
    expect(st.chain_height).toBe(0);
  });
});

describe("pack integrity is canonical, not key-order dependent", () => {
  it("a pack that round-trips through key reordering still verifies", () => {
    const kp = generateKeyPair();
    const tenant = "sweep-" + Math.random().toString(36).slice(2);
    const pack = buildEvidencePack(
      {
        title: "t",
        tenantId: tenant,
        purpose: "unit test",
        period: { from: "2026-05-13", to: "2026-05-13" },
        builtBy: "test",
        builtAt: NOW,
      },
      [signReceipt({ event: evt(tenant, 1), keypair: kp })],
      []
    );
    expect(verifyPackIntegrity(pack)).toBe(true);

    // Any system that reorders JSON object keys (a proxy, a document store, a
    // third party following the pack's own RFC 8785 instructions) must still
    // reproduce pack_hash. verifyPackIntegrity rebuilds the TOP level in a fixed
    // literal order, so only a nested object exposes the bug: `meta` is passed
    // through by reference. Under plain JSON.stringify this reported tampering.
    const meta = pack.meta as unknown as Record<string, unknown>;
    const reorderedMeta: Record<string, unknown> = {};
    for (const k of Object.keys(meta).reverse()) reorderedMeta[k] = meta[k];
    expect(Object.keys(reorderedMeta)).not.toEqual(Object.keys(meta));
    expect(verifyPackIntegrity({ ...pack, meta: reorderedMeta as typeof pack.meta })).toBe(true);
  });
});
