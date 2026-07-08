import { describe, it, expect } from "vitest";
import { generateKeyPair, signReceipt, verifyReceipt } from "../src/index.js";
import type { RawEvent } from "../src/types.js";

const kp = generateKeyPair();
const publicKeys = { [kp.kid]: kp.public_key };

function loanEvent(): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: "acme-bank",
    event_type: "loan.decision",
    source_system: "loan-bot",
    event_id: "e-1",
    captured_at: "2026-07-08T10:00:00.000Z",
    context: { environment: "production" },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_model_version: "claude-sonnet-4-20250514", // new: pinned snapshot
      model_card_hash: "sha256:card...",            // new
      fine_tune_id: "ft-abc123",                    // new
      system_prompt_hash: "sha256:prompt...",       // new: which system prompt governed the call
    },
    payload: { input_token_count: 2000, output_token_count: 300 },
  };
}

const policyContext = {
  policy_bundle_id: "loan-policy-v2.1",
  policy_bundle_hash: "sha256:abc123",
  version: "2.1",
  domain: "loan_decision",
  applied_rules: [
    { rule_id: "credit_score_min", expression: "credit_score >= 650", mathematical_form: "credit_score >= 650", source: "internal_policy", weight: 1.0 },
    { rule_id: "dti_ratio_max", expression: "debt_to_income_ratio <= 0.43", mathematical_form: "dti <= 0.43", source: "regulatory" },
  ],
  mathematical_constraints: "credit_score >= 650 && dti <= 0.43 && age >= 21",
  rule_encoding_format: "simple_expression",
};

const verification = {
  enabled: true,
  verification_type: "rule_based" as const,
  status: "failed" as const,
  proof_artifact: { kind: "rule_check", hash: "sha256:proof...", alg: "sha256", uri: "internal:proofs/loan-123", size_bytes: 1240 },
  failed_rules: ["dti_ratio_max"],
  confidence_score: 0.98,
  verifier_version: "v1.3",
};

const decisionSummary = {
  outcome: "flag" as const,
  risk_score: 0.35,
  reason_codes: ["low_credit_score", "high_dti"],
  human_override: false,
  override_reason: null,
};

describe("policy_context / verification / governance fields", () => {
  it("signs a receipt carrying every new block and verifies it", () => {
    const r = signReceipt({
      event: loanEvent(),
      keypair: kp,
      decision: { decision: "flag", applied_policies: ["loan-policy-v2.1"], policy_bundle_hash: "sha256:abc123", reason_codes: ["high_dti"] },
      decisionSummary,
      policyContext,
      verification,
      evidenceRefs: [
        { kind: "policy_document", hash: "sha256:doc", alg: "sha256", uri: "https://.../loan-policy-v2.1.json", status: "applied", mathematical_value: "credit_score >= 650", proof_type: "rule_check" },
      ],
    });

    // the blocks are actually on the receipt
    expect(r.receipt.policy_context?.applied_rules?.[1].rule_id).toBe("dti_ratio_max");
    expect(r.receipt.verification?.failed_rules).toEqual(["dti_ratio_max"]);
    expect(r.receipt.decision_summary?.risk_score).toBe(0.35);
    expect(r.receipt.event.subject?.system_prompt_hash).toBe("sha256:prompt...");
    expect(r.receipt.evidence_refs?.[0].proof_type).toBe("rule_check");

    // and they verify (they're covered by the canonical hash + signature)
    const v = verifyReceipt(r, { publicKeys });
    expect(v.checks.signature_valid).toBe(true);
    expect(v.checks.canonical_hash_matches).toBe(true);
  });

  it("tampering any new field breaks verification (the blocks are signed)", () => {
    const r = signReceipt({ event: loanEvent(), keypair: kp, policyContext, verification });
    // flip the verification result without re-signing
    const tampered = structuredClone(r);
    tampered.receipt.verification!.status = "verified";
    const v = verifyReceipt(tampered, { publicKeys });
    expect(v.checks.canonical_hash_matches).toBe(false);
  });

  it("is backward compatible: a receipt with none of the new blocks still verifies", () => {
    const r = signReceipt({ event: loanEvent(), keypair: kp });
    expect(r.receipt.policy_context).toBeUndefined();
    expect(r.receipt.verification).toBeUndefined();
    const v = verifyReceipt(r, { publicKeys });
    expect(v.checks.signature_valid).toBe(true);
    expect(v.checks.canonical_hash_matches).toBe(true);
  });
});
