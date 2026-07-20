/**
 * Regression tests: an artifact cannot certify itself.
 *
 * The theme of this file is trust ROOTS. A pack that ships the key that
 * verifies it, a workflow whose membership is a caller-supplied string, a log
 * whose head nobody can check, and a badge awarded by an empty test suite are
 * all the same mistake: the thing being trusted is supplied by the party being
 * checked.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPair } from "../src/crypto.js";
import { signReceipt } from "../src/index.js";
import { buildEvidencePack, verifyEvidencePack, verifyPackIntegrity } from "../src/evidence/evidence-pack.js";
import { verifyWorkflow, reconstructWorkflow } from "../src/workflow-graph.js";
import { TransparencyLog } from "../src/transparency-log/log.js";
import { SoftwareSigningProvider } from "../src/signing-provider.js";
import { runAll } from "../conformance/src/index.js";
import { UseCaseRegistry } from "../src/registries/use-case-registry.js";
import type { RawEvent } from "../src/types.js";

const NOW = "2026-07-20T00:00:00.000Z";

function evt(tenant: string, n: number, extra: Partial<RawEvent> = {}): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "loan.decision",
    source_system: "underwriting",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    ...extra,
  };
}

const meta = {
  title: "t",
  tenantId: "bank-a",
  purpose: "inspection",
  period: { from: "2026-05-13", to: "2026-05-13" },
  builtBy: "test",
  builtAt: NOW,
};

describe("an evidence pack cannot certify itself", () => {
  it("a wholly forged pack fails against out-of-band keys", () => {
    const honest = generateKeyPair();
    const attacker = generateKeyPair();

    // The forgery: re-mint the chain with rewritten facts, sign with the
    // attacker's key, and ship that key inside the pack reusing the real kid.
    const forgedReceipts = [1, 2].map((i) =>
      signReceipt({ event: evt("bank-a", i, { payload: { decision: "allow", amount_usd: 2000 } }), keypair: attacker })
    );
    const forged = buildEvidencePack(meta, forgedReceipts, [
      {
        kid: honest.kid, // claims to be the bank's key id
        public_key: attacker.public_key, // but is the attacker's key
        algorithm: "EdDSA",
        curve: "ed25519",
        status: "active",
        issued_at: NOW,
      },
    ]);

    // Internally consistent: the forger recomputed all of it.
    expect(verifyPackIntegrity(forged)).toBe(true);

    // Against the REAL key, obtained out of band, it fails.
    const v = verifyEvidencePack(forged, { publicKeys: { [honest.kid]: honest.public_key } });
    expect(v.valid).toBe(false);
    expect(v.checks.all_signatures_valid).toBe(false);
    expect(v.failed_signature).toHaveLength(2);
  });

  it("supplying no keys fails closed rather than reporting success", () => {
    const kp = generateKeyPair();
    const pack = buildEvidencePack(meta, [signReceipt({ event: evt("bank-a", 1), keypair: kp })], []);
    const v = verifyEvidencePack(pack, { publicKeys: {} });
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toMatch(/cannot authenticate itself/);
  });

  it("a genuine pack verifies against the real key", () => {
    const kp = generateKeyPair();
    const pack = buildEvidencePack(meta, [signReceipt({ event: evt("bank-a", 1), keypair: kp })], []);
    expect(verifyEvidencePack(pack, { publicKeys: { [kp.kid]: kp.public_key } }).valid).toBe(true);
  });

  it("the shipped instructions no longer tell the reader to trust the pack's own keys", () => {
    const kp = generateKeyPair();
    const pack = buildEvidencePack(meta, [signReceipt({ event: evt("bank-a", 1), keypair: kp })], []);
    expect(pack.verification_instructions).toMatch(/THE KEYS IN THIS FILE PROVE NOTHING/);
    expect(pack.verification_instructions).toMatch(/OUT[- ]OF[- ]BAND/i);
  });
});

describe("a workflow belongs to one tenant", () => {
  it("a foreign tenant cannot graft a step onto another tenant's run", () => {
    const bank = generateKeyPair();
    const evil = generateKeyPair();
    const wf = "wf-loan-42";

    const step1 = signReceipt({
      event: evt("bank-a", 1, { lineage: { workflow_id: wf } } as Partial<RawEvent>),
      keypair: bank,
    });
    // evil-corp signs with its OWN valid key, reusing bank-a's workflow_id and
    // pointing at bank-a's receipt, making itself the authoritative leaf.
    const graft = signReceipt({
      event: evt("evil-corp", 2, {
        event_type: "loan.override",
        lineage: { workflow_id: wf },
      } as Partial<RawEvent>),
      keypair: evil,
    });

    const all = [step1, graft];
    const g = reconstructWorkflow(all, { workflowId: wf });
    const tenants = new Set(
      g.steps.map((s) => all.find((r) => r.receipt.receipt_id === s.receiptId)!.receipt.tenant_id)
    );
    expect(tenants.has("evil-corp")).toBe(false);

    const res = verifyWorkflow(all, {
      publicKeys: { [bank.kid]: bank.public_key, [evil.kid]: evil.public_key },
      workflowId: wf,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/different tenant/);
  });
});

describe("the transparency log head can be checked", () => {
  it("an STH verifies against the signer's key and fails when tampered", async () => {
    const provider = await SoftwareSigningProvider.generate({ kid: "log-signer" });
    const log = new TransparencyLog({ log_id: "L", signer: provider });
    const leafHex = (i: number) => (i + 1).toString(16).padStart(64, "0");
    for (let i = 0; i < 3; i++) await log.append(leafHex(i), `r${i}`, "tenant");

    const sth = await log.publishSth();
    const pub = { "log-signer": await provider.publicKey() };

    // Previously the SDK shipped NO way to check an STH at all, so the root of
    // trust for every inclusion proof was itself unverifiable.
    expect(TransparencyLog.verifySth(sth, { publicKeys: pub })).toBe(true);
    expect(
      TransparencyLog.verifySth({ ...sth, root_hash: "00".repeat(32) }, { publicKeys: pub })
    ).toBe(false);
    expect(TransparencyLog.verifySth({ ...sth, tree_size: 99 }, { publicKeys: pub })).toBe(false);
    expect(TransparencyLog.verifySth(sth, { publicKeys: {} })).toBe(false);
  });
});

describe("a conformance badge cannot be won by an empty suite", () => {
  it("an adapter that cannot sign is not awarded CL2 or CL3", async () => {
    // SIGNED_VECTORS and CHAINED_VECTORS are currently empty, and
    // `failed === 0` is trivially true for 0 vectors, so this adapter used to
    // be awarded CL3 despite being unable to sign anything.
    const canonicalOnly = {
      canonicalize: (v: unknown) => new TextEncoder().encode(JSON.stringify(v)),
    };
    const res = await runAll(canonicalOnly as never);
    expect(res.cl2.total).toBe(0);
    expect(res.cl3.total).toBe(0);
    expect(res.badge).not.toBe("CL3");
    expect(res.badge).not.toBe("CL2");
  });
});

describe("registry history survives key reordering", () => {
  it("use-case entry hashes are canonical", () => {
    const base = {
      id: "uc1",
      name: "Loan decisioning",
      description: "d",
      business_owner: "a@x",
      technical_owner: "b@x",
      tenant_id: "bank-a",
      risk_tier: "high" as const,
      lifecycle: "production" as const,
      regulators: [],
      approved_model_ids: ["m1"],
      approved_data_classifications: ["internal" as const],
      approved_source_systems: ["gw"],
      created_at: NOW,
      updated_at: NOW,
    };
    // Same facts, different insertion order, as any JSON round-trip may produce.
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as typeof base;
    expect(UseCaseRegistry.entryHash(reordered)).toBe(UseCaseRegistry.entryHash(base));
  });
});
