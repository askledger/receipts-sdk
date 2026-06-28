/**
 * Example 07 — US Government · Benefits Eligibility Determination
 *
 * A state benefits worker invokes an AI eligibility-recommendation
 * model. Under OMB M-24-10 this is a "rights-impacting" AI use case,
 * requiring stronger evidence of fairness and human oversight.
 *
 * The receipt establishes the AI invocation, the data classification,
 * the explicit human-review path, and the FedRAMP-validated provider
 * the model is hosted under. It satisfies NIST 800-53 AU-2, AU-9,
 * AU-10, and AU-12 simultaneously.
 */

import {
  generateKeyPair,
  signReceipt,
  verifyReceipt,
  citeReceipt,
  FEDRAMP_NIST_AI,
  NIST_AI_RMF,
  type RawEvent,
} from "../src/index.js";

function main() {
  const keypair = generateKeyPair();
  const publicKeys = { [keypair.kid]: keypair.public_key };

  const event: RawEvent = {
    schema_version: "1.0",
    tenant_id: "state-of-michigan-dhhs",
    event_type: "benefits.eligibility_determination",
    source_system: "dhhs-eligibility-svc",
    event_id: "evt-eligibility-" + Date.now(),
    captured_at: new Date().toISOString(),
    context: {
      user_id: "case-worker-78321",
      service_id: "spiffe://michigan-dhhs/svc/eligibility",
      environment: "production",
      region: "us-gov-east-1",       // FedRAMP region
    },
    subject: {
      ai_vendor: "openai",
      ai_model: "gpt-4-fedramp-high",  // FedRAMP High authorized
      ai_provider: "azure-government-cloud",
      ai_capability: "eligibility-classification",
    },
    payload: {
      input_hash: "applicant-record-hash-abc...",
      input_classification: "pii",
      output_hash: "eligibility-rec-hash-def...",
      output_classification: "internal",
      metadata: {
        recommendation: "eligible_pending_human_review",
        confidence: 0.84,
        // M-24-10 requires evidence of human oversight for rights-impacting AI
        human_review_required: true,
        human_review_sla_hours: 48,
      },
    },
  };

  const receipt = signReceipt({
    event,
    keypair,
    decision: {
      policy_bundle_hash: "policy-bundle-mi-eligibility-v3-abc...",
      applied_policies: ["benefits/eligibility/v3", "audit/m-24-10/v1"],
      decision: "require-approval",     // mandatory for rights-impacting AI
      reason_codes: ["human_review_required_per_M-24-10"],
    },
  });

  console.log("Receipt signed · chain_height =", receipt.receipt.integrity.chain_height);

  const verified = verifyReceipt(receipt, { publicKeys });
  console.log("Verification:", verified.valid ? "VALID" : "INVALID");

  const citations = citeReceipt(receipt, [FEDRAMP_NIST_AI, NIST_AI_RMF]);
  console.log("\nFederal control citations:");
  for (const c of citations) {
    console.log(`  · ${c.regulator} ${c.article_id}  (confidence ${c.confidence})`);
  }

  console.log(
    "\nA FedRAMP authorization-to-operate (ATO) inspection consumes this\n" +
    "directly. The receipt proves AC-2, AC-3, AU-2, AU-9, AU-10, AU-12,\n" +
    "and the M-24-10 AI Use Case Inventory requirement all at once."
  );
}

main();
