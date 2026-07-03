/**
 * Tests for the content-safety module.
 *
 * Covers PII detector accuracy (true positives, true negatives,
 * checksum validation), shadow-AI detection across the four reason
 * categories, and end-to-end safety verdicts on realistic BFSI cases.
 */

import { describe, it, expect } from "vitest";
import {
  scanPii,
  detectShadowAi,
  detectDeviation,
  evaluateContentSafety,
  type SafetyPolicy,
} from "../src/index.js";

const POLICY: SafetyPolicy = {
  shadow_ai: {
    approved_vendors: ["anthropic", "openai", "bedrock"],
    approved_models: ["claude-sonnet-4-6", "gpt-5", "claude-3-sonnet"],
    approved_source_systems: ["ai-gateway-prod", "vs-code-plugin", "agentic-app"],
    approved_providers: ["gateway:portkey", "direct"],
  },
  flag_threshold: 0.3,
  block_threshold: 0.7,
};

describe("PII detector — true positives", () => {
  it("detects emails", () => {
    const r = scanPii("Contact maryam.h@acme-bank.ae for details.");
    expect(r.categories.email).toBe(1);
    expect(r.findings[0].redacted).not.toContain("@acme");
  });

  it("detects US SSN", () => {
    const r = scanPii("SSN: 123-45-6789");
    expect(r.categories.us_ssn).toBe(1);
  });

  it("validates credit card with Luhn", () => {
    // Test card numbers (valid Luhn): 4111 1111 1111 1111
    const r = scanPii("Card: 4111 1111 1111 1111");
    expect(r.categories.credit_card).toBe(1);
    expect(r.findings[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("rejects credit-card-shaped digits that fail Luhn", () => {
    const r = scanPii("Order id: 4111 1111 1111 1112");
    expect(r.categories.credit_card).toBeUndefined();
  });

  it("validates IBAN with MOD-97", () => {
    // Valid: GB82 WEST 1234 5698 7654 32 (UK test IBAN)
    const r = scanPii("Send to GB82WEST12345698765432");
    expect(r.categories.iban).toBe(1);
  });

  it("rejects IBAN-shaped strings that fail MOD-97", () => {
    const r = scanPii("Fake: GB99WEST12345698765432");
    expect(r.categories.iban).toBeUndefined();
  });

  it("detects UAE Emirates ID format", () => {
    const r = scanPii("Emirates ID: 784-1985-1234567-8");
    expect(r.categories.uae_emirates_id).toBe(1);
  });

  it("detects API keys", () => {
    const r = scanPii("export OPENAI_KEY=sk-proj-abcdef0123456789abcdef0123456789");
    expect(r.categories.api_key).toBe(1);
  });

  it("detects customer ids in BFSI format", () => {
    const r = scanPii("Customer C-48291 status: VERIFIED");
    expect(r.categories.customer_id).toBe(1);
  });

  it("detects wire references", () => {
    const r = scanPii("Ref: WIRE-2026-06-10-44812");
    expect(r.categories.wire_reference).toBe(1);
  });

  it("detects multiple PII in one text", () => {
    const r = scanPii(
      "John Doe, jdoe@example.com, SSN 555-12-3456, card 4111111111111111"
    );
    expect(r.count).toBeGreaterThanOrEqual(3);
    expect(r.has_high_confidence).toBe(true);
  });
});

describe("PII detector — redaction", () => {
  it("never returns the raw match in findings", () => {
    const r = scanPii("Send to jane.smith@bank.com today");
    expect(r.findings[0].redacted).not.toBe("jane.smith@bank.com");
    expect(r.findings[0].redacted).toMatch(/^[a-z]{4}…[a-z]{2}$|^•+$/);
  });
});

describe("PII detector — clean text", () => {
  it("returns zero findings for benign text", () => {
    const r = scanPii(
      "Summarize the Q3 risk committee minutes focusing on operational risk."
    );
    expect(r.count).toBe(0);
    expect(r.has_high_confidence).toBe(false);
  });
});

describe("shadow-AI detector", () => {
  it("flags vendor not approved", () => {
    const r = detectShadowAi({ ai_vendor: "mystery-vendor" }, POLICY.shadow_ai);
    expect(r.is_shadow).toBe(true);
    expect(r.reasons).toContain("vendor_not_approved");
  });

  it("flags model not approved", () => {
    const r = detectShadowAi(
      { ai_vendor: "anthropic", ai_model: "claude-1-mini" },
      POLICY.shadow_ai
    );
    expect(r.reasons).toContain("model_not_approved");
  });

  it("flags consumer endpoint (chatgpt.com)", () => {
    const r = detectShadowAi(
      {
        ai_vendor: "openai",
        ai_model: "gpt-5",
        endpoint_url: "https://chatgpt.com/share/abc123",
      },
      POLICY.shadow_ai
    );
    expect(r.reasons).toContain("consumer_endpoint");
    expect(r.severity).toBeGreaterThan(0.4);
  });

  it("approves an authorized configuration", () => {
    const r = detectShadowAi(
      {
        ai_vendor: "anthropic",
        ai_model: "claude-sonnet-4-6",
        source_system: "ai-gateway-prod",
      },
      POLICY.shadow_ai
    );
    expect(r.is_shadow).toBe(false);
    expect(r.severity).toBe(0);
  });
});

describe("deviation detector", () => {
  it("flags PII appearing in response that was not in input", () => {
    const r = detectDeviation({
      input_classification: "internal",
      output_classification: "internal",
      input_pii: { count: 0, categories: {}, findings: [], has_high_confidence: false },
      output_pii: {
        count: 2,
        categories: { email: 1, phone: 1 },
        findings: [],
        has_high_confidence: true,
      },
    });
    expect(r.findings.some((f) => f.category === "pii_introduced_in_response")).toBe(true);
  });

  it("flags PII leaked to public surface as high severity", () => {
    const r = detectDeviation({
      input_classification: "internal",
      output_classification: "public",
      input_pii: { count: 0, categories: {}, findings: [], has_high_confidence: false },
      output_pii: {
        count: 1,
        categories: { us_ssn: 1 },
        findings: [],
        has_high_confidence: true,
      },
    });
    expect(
      r.findings.find((f) => f.category === "pii_leaked_to_public_surface")?.severity
    ).toBe("high");
  });
});

describe("end-to-end content safety", () => {
  it("allows a clean BFSI document-summary scenario", () => {
    const r = evaluateContentSafety(
      {
        input_text: "Summarize the Q3 2026 risk committee minutes.",
        output_text: "Three operational risks were highlighted: vendor concentration, KYC backlog, and onboarding workflow.",
        input_classification: "internal",
        output_classification: "internal",
        input_token_count: 1247,
        output_token_count: 312,
        ai_capability: "text-generation",
        shadow: {
          ai_vendor: "anthropic",
          ai_model: "claude-sonnet-4-6",
          source_system: "ai-gateway-prod",
          ai_provider: "gateway:portkey",
        },
      },
      POLICY
    );
    expect(r.verdict).toBe("allow");
    expect(r.risk_score).toBeLessThan(0.3);
  });

  it("blocks a shadow-AI consumer-endpoint paste of customer PII", () => {
    const r = evaluateContentSafety(
      {
        input_text:
          "Help me debug this customer record: jane.doe@client.ae, SSN 444-55-6789, IBAN GB82WEST12345698765432, card 4111111111111111",
        output_text: "Sure! Here's the analysis…",
        input_classification: "pii",
        output_classification: "internal",
        input_token_count: 95,
        output_token_count: 230,
        ai_capability: "text-generation",
        shadow: {
          ai_vendor: "openai",
          ai_model: "gpt-4o",
          source_system: "personal-browser",
          endpoint_url: "https://chatgpt.com/c/abc",
        },
      },
      POLICY
    );
    expect(r.verdict).toBe("block");
    expect(r.input_pii.count).toBeGreaterThanOrEqual(3);
    expect(r.shadow_ai.reasons).toContain("consumer_endpoint");
    expect(r.reason_codes.some((c) => c.startsWith("shadow:consumer_endpoint"))).toBe(true);
  });

  it("blocks PII output to a public surface", () => {
    const r = evaluateContentSafety(
      {
        input_text: "Generate a public announcement",
        output_text: "Reach out to john@example.com or call +1 555 123 4567",
        input_classification: "internal",
        output_classification: "public",
        ai_capability: "text-generation",
        shadow: {
          ai_vendor: "anthropic",
          ai_model: "claude-sonnet-4-6",
          source_system: "ai-gateway-prod",
        },
      },
      POLICY
    );
    expect(r.verdict).toBe("block");
  });

  it("flags but does not block authorized PII handling (KYC agent)", () => {
    const r = evaluateContentSafety(
      {
        input_text: "Lookup customer C-48291",
        output_text: "Customer C-48291 status: VERIFIED, last_refresh 2026-05-22",
        input_classification: "internal",
        output_classification: "internal",
        ai_capability: "tool-use",
        shadow: {
          ai_vendor: "anthropic",
          ai_model: "claude-sonnet-4-6",
          source_system: "agentic-app",
        },
      },
      POLICY
    );
    expect(r.verdict).not.toBe("block");
  });
});
