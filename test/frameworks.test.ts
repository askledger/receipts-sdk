/**
 * Tests for the Bandar Naghi industry framework adapter.
 *
 * Anchors on what is VERIFIED from bandarnaghi.com (framework name,
 * component count, ASIN), and on the verification discipline (pillars
 * mark as awaiting until an author contribution is applied).
 */

import { describe, it, expect } from "vitest";
import {
  QAG_FRAMEWORK,
  QAIS_FRAMEWORK,
  AI_AGENCY_FRAMEWORK,
  BANDAR_FRAMEWORKS,
  EXECUTIVE_PHILOSOPHY,
  applyAuthorContribution,
  frameworkAlignment,
  ALL_INDUSTRY_FRAMEWORKS,
  generateKeyPair,
  signReceipt,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

describe("Bandar Naghi framework adapter — verified outer structure", () => {
  it("QAG has 5 pillars (verified from bandarnaghi.com)", () => {
    expect(QAG_FRAMEWORK.name).toBe("QAG");
    expect(QAG_FRAMEWORK.long_title).toBe("Quantitative AI Governance");
    expect(QAG_FRAMEWORK.components).toHaveLength(5);
    expect(QAG_FRAMEWORK.structure_verification).toBe("verified");
    expect(QAG_FRAMEWORK.publication.asin).toBe("B0FQ5Y6KVY");
  });

  it("QAIS has 3 towers (verified from bandarnaghi.com)", () => {
    expect(QAIS_FRAMEWORK.name).toBe("QAIS");
    expect(QAIS_FRAMEWORK.long_title).toBe("Quantitative AI Security");
    expect(QAIS_FRAMEWORK.components).toHaveLength(3);
    expect(QAIS_FRAMEWORK.components.every((c) => c.kind === "tower")).toBe(true);
    expect(QAIS_FRAMEWORK.publication.asin).toBe("B0FR3766G9");
  });

  it("AI Agency has 7 pillars (verified from bandarnaghi.com)", () => {
    expect(AI_AGENCY_FRAMEWORK.name).toBe("AI Agency");
    expect(AI_AGENCY_FRAMEWORK.components).toHaveLength(7);
    expect(AI_AGENCY_FRAMEWORK.publication.asin).toBe("B0FRF3B5P7");
  });

  it("Executive Philosophy has 6 priorities (verified word-for-word)", () => {
    expect(EXECUTIVE_PHILOSOPHY).toHaveLength(6);
    const titles = EXECUTIVE_PHILOSOPHY.map((p) => p.title);
    expect(titles).toEqual([
      "Shareholder Value",
      "Market Leadership",
      "Talent & Culture",
      "Customer Excellence",
      "Operational Excellence",
      "Sustainable Growth",
    ]);
  });

  it("all bundled frameworks attribute to Bandar Naghi", () => {
    for (const f of BANDAR_FRAMEWORKS) {
      expect(f.author.name).toBe("Bandar Naghi");
      expect(f.author.url).toBe("https://bandarnaghi.com");
    }
  });
});

describe("verification discipline — pillar text awaits author input", () => {
  it("every QAG pillar is marked awaiting (we never paraphrase book content)", () => {
    for (const c of QAG_FRAMEWORK.components) {
      expect(c.verification).toBe("awaiting");
      expect(c.description).toContain("AWAITING_AUTHOR_VERIFICATION");
    }
  });

  it("every QAIS tower is marked awaiting", () => {
    for (const c of QAIS_FRAMEWORK.components) {
      expect(c.verification).toBe("awaiting");
    }
  });

  it("every AI Agency pillar is marked awaiting", () => {
    for (const c of AI_AGENCY_FRAMEWORK.components) {
      expect(c.verification).toBe("awaiting");
    }
  });
});

describe("applyAuthorContribution — verified pillar text after author input", () => {
  it("updates a single pillar and marks it verified", () => {
    const { framework, updated } = applyAuthorContribution(QAG_FRAMEWORK, {
      framework_id: "bn-qag",
      components: {
        "QAG-P1": {
          title: "Governance Structure & Accountability",
          description: "Demo title for the test.",
        },
      },
      attribution: { author: "Bandar Naghi", verified_at: "2026-06-15T10:00:00Z" },
    });
    expect(updated).toBe(1);
    const p1 = framework.components.find((c) => c.id === "QAG-P1");
    expect(p1?.verification).toBe("verified");
    expect(p1?.title).toBe("Governance Structure & Accountability");
    expect(p1?.source_citation).toContain("verified by Bandar Naghi");
  });

  it("refuses to apply a contribution targeting the wrong framework", () => {
    expect(() =>
      applyAuthorContribution(QAG_FRAMEWORK, {
        framework_id: "bn-qais", // wrong target
        components: {},
        attribution: { author: "Bandar Naghi", verified_at: "2026-06-15" },
      })
    ).toThrow();
  });

  it("leaves untouched components in awaiting state", () => {
    const { framework } = applyAuthorContribution(QAG_FRAMEWORK, {
      framework_id: "bn-qag",
      components: { "QAG-P1": { title: "x" } },
      attribution: { author: "Bandar Naghi", verified_at: "2026-06-15" },
    });
    const p2 = framework.components.find((c) => c.id === "QAG-P2");
    expect(p2?.verification).toBe("awaiting");
  });
});

describe("frameworkAlignment — receipt → industry framework citations", () => {
  it("returns citations for a signed receipt with rich event fields", () => {
    const kp = generateKeyPair();
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: "demo",
      event_type: "gateway.request",
      source_system: "test",
      event_id: "evt-fw-001",
      captured_at: "2026-05-13T10:00:00.000Z",
      context: { user_id: "ops@bank.ae", service_id: "spiffe://example/svc/x", environment: "production" },
      subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6", ai_capability: "text-generation" },
      payload: {
        input_classification: "internal",
        input_hash: "abc",
        input_token_count: 1247,
        output_token_count: 312,
        metadata: { latency_ms: 350, tool_name: "kyc_lookup" },
      },
    };
    const r = signReceipt({ event, keypair: kp });
    const alignment = frameworkAlignment(r);
    expect(alignment.length).toBeGreaterThan(0);
    const frameworks = new Set(alignment.map((a) => a.framework_id));
    expect(frameworks.has("bn-qag")).toBe(true);
    expect(frameworks.has("bn-qais")).toBe(true);
    expect(frameworks.has("bn-ai-agency")).toBe(true);
  });
});

describe("bundle", () => {
  it("ALL_INDUSTRY_FRAMEWORKS contains the three Bandar frameworks", () => {
    expect(ALL_INDUSTRY_FRAMEWORKS.length).toBe(3);
    expect(ALL_INDUSTRY_FRAMEWORKS.map((f) => f.id).sort()).toEqual([
      "bn-ai-agency",
      "bn-qag",
      "bn-qais",
    ]);
  });
});
