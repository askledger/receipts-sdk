/**
 * Cross-industry policy template tests.
 *
 * Confirms the four new templates (HIPAA, FedRAMP, ISO 27001, GDPR)
 * are correctly registered, content-addressed, and integrate with the
 * existing citeReceipt() machinery.
 */

import { describe, it, expect } from "vitest";
import {
  HIPAA_SECURITY_RULE,
  FEDRAMP_NIST_AI,
  ISO_27001_AI,
  GDPR_AI,
  TEMPLATES,
  citeReceipt,
  citeAgainstAll,
  generateKeyPair,
  signReceipt,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

describe("Cross-industry policy templates", () => {
  it("HIPAA template carries §164.312(b) audit-control article", () => {
    expect(HIPAA_SECURITY_RULE.name).toContain("HIPAA");
    expect(HIPAA_SECURITY_RULE.articles.find((a) => a.id === "164.312.b")).toBeDefined();
  });

  it("FedRAMP template carries AU-9 (audit info protection)", () => {
    expect(FEDRAMP_NIST_AI.name).toContain("FedRAMP");
    expect(FEDRAMP_NIST_AI.articles.find((a) => a.id === "AU-9")).toBeDefined();
    expect(FEDRAMP_NIST_AI.articles.find((a) => a.id === "OMB-M-24-10")).toBeDefined();
  });

  it("ISO 27001 template carries A.8.15 (logging)", () => {
    expect(ISO_27001_AI.articles.find((a) => a.id === "A.8.15")).toBeDefined();
  });

  it("GDPR template carries Article 22 (automated decision-making)", () => {
    expect(GDPR_AI.articles.find((a) => a.id === "ART22")).toBeDefined();
    expect(GDPR_AI.articles.find((a) => a.id === "ART5.2")).toBeDefined();
  });

  it("TEMPLATES bundle now contains nine templates (BFSI + healthcare + gov + privacy)", () => {
    expect(TEMPLATES.length).toBe(9);
    const names = TEMPLATES.map((t) => t.name).join(" | ");
    expect(names).toContain("CBUAE");
    expect(names).toContain("HIPAA");
    expect(names).toContain("FedRAMP");
    expect(names).toContain("GDPR");
  });

  it("citeReceipt against HIPAA returns audit-control article for a clinical event", () => {
    const kp = generateKeyPair();
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: "providence",
      event_type: "clinical.decision_support",
      source_system: "ehr-svc",
      event_id: "evt-hipaa-001",
      captured_at: "2026-05-13T10:00:00.000Z",
      context: { user_id: "nurse-1", environment: "production" },
      subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
      payload: {
        input_classification: "pii",
        input_hash: "abc",
        output_hash: "def",
        output_classification: "pii_redacted",
      },
    };
    const r = signReceipt({ event, keypair: kp });
    const citations = citeReceipt(r, [HIPAA_SECURITY_RULE]);
    const ids = citations.map((c) => c.article_id);
    expect(ids).toContain("164.312.b");    // audit controls
    expect(ids).toContain("164.312.c");    // integrity
  });

  it("citeAgainstAll surfaces multiple industries simultaneously", () => {
    const kp = generateKeyPair();
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: "multi-industry-demo",
      event_type: "gateway.request",
      source_system: "ai-gateway",
      event_id: "evt-multi-001",
      captured_at: "2026-05-13T10:00:00.000Z",
      context: { user_id: "alice", environment: "production" },
      subject: { ai_vendor: "openai", ai_model: "gpt-5" },
      payload: {
        input_classification: "internal",
        input_hash: "x",
        output_hash: "y",
        output_classification: "internal",
      },
    };
    const r = signReceipt({ event, keypair: kp });
    const citations = citeAgainstAll(r);
    const regulators = new Set(citations.map((c) => c.regulator));
    // The event satisfies multiple frameworks at once
    expect(regulators.size).toBeGreaterThanOrEqual(2);
  });
});
