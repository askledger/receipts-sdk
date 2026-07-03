/**
 * Example 06 — Healthcare · Clinical Decision Support
 *
 * A nurse asks an AI sepsis-risk model to evaluate a patient. The
 * receipt establishes who asked, which model answered, what
 * classification of data was involved, and what the recommended
 * action was. The receipt satisfies HIPAA §164.312(b) audit-control
 * requirements directly.
 *
 * No PHI is included in the receipt — only hashes of input/output.
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  citeReceipt,
  HIPAA_SECURITY_RULE,
  ISO_27001_AI,
  type RawEvent,
} from "../src/index.js";

function main() {
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };

  const event: RawEvent = {
    schema_version: "1.0",
    tenant_id: "providence-health",
    event_type: "clinical.decision_support",
    source_system: "ehr-sepsis-svc",
    event_id: "evt-sepsis-" + Date.now(),
    captured_at: new Date().toISOString(),
    context: {
      user_id: "nurse-id-44182",            // never the patient
      service_id: "spiffe://providence/svc/sepsis-svc",
      environment: "production",
      region: "us-west-2",
    },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6-medical",
      ai_capability: "clinical-risk-scoring",
    },
    payload: {
      // PHI is hashed only. The hash is meaningful for audit trail
      // (you can prove what was processed) without exposing PHI itself.
      input_hash: "abc123...",      // SHA-256 of the encounter summary
      input_classification: "pii",  // PHI is PII
      output_hash: "def456...",     // SHA-256 of the risk score + rationale
      output_classification: "pii_redacted",
      metadata: {
        risk_score: 0.72,           // OK to record the score (no PHI)
        risk_band: "HIGH",
        recommended_action: "escalate-attending",
      },
    },
  };

  const receipt = signReceipt({ event, keypair });
  console.log("Receipt signed · chain_height =", receipt.receipt.integrity.chain_height);

  const verified = verifyReceipt(receipt, { publicKeys });
  console.log("Verification:", verified.valid ? "VALID" : "INVALID");

  // Cite which HIPAA and ISO 27001 articles this receipt satisfies
  const citations = citeReceipt(receipt, [HIPAA_SECURITY_RULE, ISO_27001_AI]);
  console.log("\nRegulatory citations:");
  for (const c of citations) {
    console.log(`  · ${c.regulator} ${c.article_id}  (confidence ${c.confidence})`);
  }
  console.log(
    "\nIn an audit, the hospital can produce this receipt as proof that\n" +
    "the AI was invoked, by whom, with what data classification, and what\n" +
    "the outcome was — without ever exposing the PHI itself."
  );
}

main();
