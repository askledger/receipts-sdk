/**
 * Tests for the v0.5 features that move us toward global-standard position:
 *   - Public Transparency Log (Sigstore Rekor pattern)
 *   - Receipt Score (SSL-Labs A+ pattern)
 */

import { describe, it, expect } from "vitest";
import {
  TransparencyLog,
  SoftwareSigningProvider,
  computeScore,
  computeBreakdown,
  renderBadgeSvg,
} from "../src/index.js";

// ---------- Transparency Log ----------

describe("TransparencyLog", () => {
  it("appends entries and grows the tree", async () => {
    const signer = await SoftwareSigningProvider.generate();
    const log = new TransparencyLog({ log_id: "test.log", signer });
    expect(log.size()).toBe(0);
    await log.append("0".repeat(64), "rcpt-1", "acme");
    await log.append("1".repeat(64), "rcpt-2", "acme");
    expect(log.size()).toBe(2);
    expect(log.currentRoot()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("publishes a Signed Tree Head", async () => {
    const signer = await SoftwareSigningProvider.generate();
    const log = new TransparencyLog({ log_id: "test.log", signer });
    await log.append("a".repeat(64), "r-1", "t-1");
    await log.append("b".repeat(64), "r-2", "t-2");
    const sth = await log.publishSth();
    expect(sth.tree_size).toBe(2);
    expect(sth.root_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sth.signature.alg).toBe("EdDSA");
    expect(sth.log_id).toBe("test.log");
  });

  it("STH history grows with each publication", async () => {
    const signer = await SoftwareSigningProvider.generate();
    const log = new TransparencyLog({ log_id: "test.log", signer });
    await log.append("a".repeat(64), "r-1", "t");
    await log.publishSth();
    await log.append("b".repeat(64), "r-2", "t");
    await log.publishSth();
    expect(log.sths()).toHaveLength(2);
    expect(log.sths()[0].tree_size).toBe(1);
    expect(log.sths()[1].tree_size).toBe(2);
  });

  it("filters entries by tenant", async () => {
    const signer = await SoftwareSigningProvider.generate();
    const log = new TransparencyLog({ log_id: "test.log", signer });
    await log.append("0".repeat(64), "r1", "tenant-A");
    await log.append("1".repeat(64), "r2", "tenant-B");
    await log.append("2".repeat(64), "r3", "tenant-A");
    expect(log.byTenant("tenant-A")).toHaveLength(2);
    expect(log.byTenant("tenant-B")).toHaveLength(1);
  });

  it("rejects bad leaf hashes", async () => {
    const signer = await SoftwareSigningProvider.generate();
    const log = new TransparencyLog({ log_id: "test.log", signer });
    await expect(log.append("aabb", "r", "t")).rejects.toThrow();
  });

  it("produces and consumes inclusion proofs (1, 2, 3, 5, 8 leaves)", async () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const signer = await SoftwareSigningProvider.generate();
      const log = new TransparencyLog({ log_id: "test.log", signer });
      for (let i = 0; i < n; i++) {
        await log.append(`${i.toString(16).padStart(2, "0")}`.repeat(32), `r${i}`, "t");
      }
      const root = log.currentRoot();
      for (let i = 0; i < n; i++) {
        const proof = log.proveInclusion(i, n);
        const leafHex = `${i.toString(16).padStart(2, "0")}`.repeat(32);
        const ok = TransparencyLog.verifyInclusion(leafHex, proof, root);
        expect(ok).toBe(true);
      }
    }
  });
});

// ---------- Receipt Score ----------

describe("Receipt Score", () => {
  it("computes A+ for perfect coverage and verification", () => {
    const score = computeScore({
      ai_invocations_total: 1000,
      ai_invocations_with_receipt: 1000,
      receipts_verified: 1000,
      receipts_verification_failures: 0,
      receipts_with_safety_findings: 50,
      safety_findings_handled: 50,
      regulators_cited: 5,
      receipts_in_transparency_log: 1000,
    });
    expect(score.grade).toBe("A+");
    expect(score.score).toBeGreaterThanOrEqual(95);
  });

  it("computes F for zero coverage", () => {
    const score = computeScore({
      ai_invocations_total: 1000,
      ai_invocations_with_receipt: 0,
      receipts_verified: 0,
      receipts_verification_failures: 0,
      receipts_with_safety_findings: 0,
      safety_findings_handled: 0,
      regulators_cited: 0,
      receipts_in_transparency_log: 0,
    });
    expect(score.grade).toBe("F");
    expect(score.score).toBeLessThan(40);
  });

  it("penalizes verification failures", () => {
    const good = computeScore({
      ai_invocations_total: 100,
      ai_invocations_with_receipt: 100,
      receipts_verified: 100,
      receipts_verification_failures: 0,
      receipts_with_safety_findings: 5,
      safety_findings_handled: 5,
      regulators_cited: 5,
      receipts_in_transparency_log: 100,
    });
    const bad = computeScore({
      ai_invocations_total: 100,
      ai_invocations_with_receipt: 100,
      receipts_verified: 80,
      receipts_verification_failures: 20,
      receipts_with_safety_findings: 5,
      safety_findings_handled: 5,
      regulators_cited: 5,
      receipts_in_transparency_log: 100,
    });
    expect(bad.score).toBeLessThan(good.score);
  });

  it("breakdown sums logically to the weighted score", () => {
    const input = {
      ai_invocations_total: 100,
      ai_invocations_with_receipt: 90,
      receipts_verified: 88,
      receipts_verification_failures: 2,
      receipts_with_safety_findings: 10,
      safety_findings_handled: 8,
      regulators_cited: 3,
      receipts_in_transparency_log: 50,
    };
    const b = computeBreakdown(input);
    expect(b.coverage).toBe(90);
    expect(b.verification).toBe(97.8);
    expect(b.safety).toBe(80);
    expect(b.regulatory).toBe(60);
    expect(b.transparency).toBeCloseTo(55.6, 0);
  });

  it("renders an SVG badge that mentions the tenant and grade", () => {
    const score = computeScore({
      ai_invocations_total: 100,
      ai_invocations_with_receipt: 100,
      receipts_verified: 100,
      receipts_verification_failures: 0,
      receipts_with_safety_findings: 0,
      safety_findings_handled: 0,
      regulators_cited: 5,
      receipts_in_transparency_log: 100,
    });
    const svg = renderBadgeSvg(score, "Acme Bank");
    expect(svg).toContain("<svg");
    expect(svg).toContain("Acme Bank");
    expect(svg).toContain(score.grade);
    expect(svg).toContain("PROJECT LEDGER");
  });
});
