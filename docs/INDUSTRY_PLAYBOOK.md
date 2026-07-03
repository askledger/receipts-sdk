# Industry Playbook · Adapt the SDK to Your Industry in 60 Minutes

AskLedger ships nine pre-built regulator templates and four AI vendor adapters. Your industry-specific deployment usually needs three things on top: an industry-specific event shape, a use-case registry, and a custom regulator template if your industry has one not yet bundled.

This guide is for engineers and compliance leads adapting AskLedger to a new industry. Healthcare, government, pharma, manufacturing, education, legal, telecom, retail, insurance — same pattern.

---

## What ships today, by industry

| Industry | Regulator templates | AI adapter |
|---|---|---|
| **Financial services · BFSI** | CBUAE · EU AI Act · SAMA · ISO 42001 · NIST AI RMF · GDPR · ISO 27001 | OpenAI · Anthropic · Bedrock · all gateways |
| **Healthcare · life sciences** | HIPAA Security Rule · ISO 27001 · GDPR · ISO 42001 | OpenAI · Anthropic · Bedrock · all gateways |
| **US Federal · government** | FedRAMP + NIST 800-53 · OMB M-24-10 · NIST AI RMF · ISO 27001 | All AI vendors approved for FedRAMP environment |
| **EU Public sector** | EU AI Act · GDPR · ISO 42001 | All AI vendors |
| **Cross-industry (privacy)** | GDPR · ISO 27001 | All AI vendors |
| **AI management systems (universal)** | ISO 42001 | All AI vendors |

If your industry has a regulator template not yet bundled, it ships in the same format and can be added in 30 minutes.

---

## Step 1 · Pick the templates that apply (5 minutes)

```ts
import {
  HIPAA_SECURITY_RULE,
  ISO_27001_AI,
  GDPR_AI,
  citeReceipt,
} from "@askledger/receipts-sdk";

// Healthcare AI deployment in the EU
const TEMPLATES = [HIPAA_SECURITY_RULE, ISO_27001_AI, GDPR_AI];

// Receipt automatically cites which articles it satisfies
const citations = citeReceipt(signedReceipt, TEMPLATES);
```

That's it. Receipts now carry compliance citations to every applicable framework.

## Step 2 · Define your industry-specific event types (10 minutes)

Event types are dotted identifiers. You pick the namespace that fits your industry.

```ts
// Healthcare
"clinical.decision_support"
"radiology.image_analysis"
"ambient.scribe_note"
"prior_auth.review"

// Government
"benefits.eligibility_determination"
"foia.classification"
"records.search_query"

// Manufacturing
"quality.defect_detection"
"maintenance.predictive_alert"
"supply.demand_forecast"

// Legal
"contract.clause_review"
"discovery.document_classification"
"research.case_summary"

// Education
"grading.assistance"
"plagiarism.detection"
"student.intervention_recommendation"
```

Each becomes the `event_type` field on the receipt. The SDK validates the dotted format automatically.

## Step 3 · Register your use cases (15 minutes)

Every AI use case in your industry gets a registry entry with an owner, risk tier, and approved models.

```ts
import { UseCaseRegistry } from "@askledger/receipts-sdk";

const registry = new UseCaseRegistry();

// Healthcare example
registry.upsert({
  id: "uc-clinical-decision-support",
  name: "Clinical Decision Support · Sepsis Risk",
  description: "Real-time sepsis risk scoring for inpatient nurses",
  business_owner: "chief.medical.officer@hospital.org",
  technical_owner: "ml-platform@hospital.org",
  tenant_id: "providence-health",
  risk_tier: "high",             // matches EU AI Act tier
  lifecycle: "production",
  regulators: ["NIST_RMF"],
  approved_model_ids: ["model-claude-sonnet-4-6-medical"],
  approved_data_classifications: ["pii_redacted"],
  approved_source_systems: ["ehr-integration-svc"],
});
```

The same shape works for any industry — only the values change.

## Step 4 · Configure the safety layer for your industry (10 minutes)

The PII detector ships 14 categories, several of which are healthcare-relevant (US SSN, account_number, date_of_birth). You can extend with industry-specific patterns:

```ts
import { evaluateContentSafety } from "@askledger/receipts-sdk";

const policy = {
  shadow_ai: {
    approved_vendors: ["anthropic", "openai-azure-fedramp", "bedrock"],
    approved_models: ["claude-sonnet-4-6", "gpt-4-fedramp-high"],
    approved_source_systems: ["ehr-svc", "scheduling-svc"],
    // Healthcare-specific consumer endpoints we never want PHI sent to
    consumer_endpoints: [
      "chatgpt.com", "claude.ai", "gemini.google.com",
      // healthcare-relevant additions: any public AI tool
      "perplexity.ai", "you.com", "phind.com",
    ],
  },
  block_threshold: 0.6,   // tighter than BFSI default for PHI
  flag_threshold: 0.2,
};
```

## Step 5 · Wrap your AI vendor (5 minutes)

Identical to BFSI — adapters are vendor-specific, not industry-specific:

```ts
import OpenAI from "openai";
import { wrapOpenAI, generateKeyPair } from "@askledger/receipts-sdk";

const client = wrapOpenAI(new OpenAI({ apiKey }), {
  tenantId: "providence-health",
  keypair: generateKeyPair(),
  onReceipt: async (r) => {
    await fhirCompliantAuditLog.append(r);  // your existing audit infra
  },
});

// Application code is unchanged
const resp = await client.chat.completions.create({
  model: "gpt-4-fedramp-high",
  messages: [...],
});
```

## Step 6 · Add an industry-specific regulator template (30 minutes · optional)

If your industry has a regulator we don't bundle yet, add it. The template format is identical to the 9 we already ship.

Example for the FDA:

```ts
// src/policy-templates/fda-ai-ml.ts
import type { PolicyTemplate } from "./types.js";

export const FDA_AI_ML_SOFTWARE: PolicyTemplate = {
  regulator: "NIST_RMF",  // closest existing enum
  name: "FDA AI/ML Software as a Medical Device",
  version: "2024-Action-Plan",
  published_at: "2024-03-15",
  summary: "FDA guidance on AI/ML-enabled medical device software. " +
           "Receipts populate the change control + lifecycle management plan.",
  reason_code_prefix: "fda",
  articles: [
    {
      id: "PCCP",
      title: "Predetermined Change Control Plan",
      requirement: "Changes to AI/ML models must follow the predetermined change control plan.",
      pillar: "model_risk",
      satisfied_by_fields: ["model_id", "event.subject.ai_model"],
      severity: "critical",
      source_citation: "FDA AI/ML Action Plan (2024)",
    },
    // ... more articles
  ],
};
```

Open a pull request and contribute it back — the community gets the template, and the regulator gets named in our docs.

---

## How to think about which templates apply

The 9 bundled templates cover the dominant overlap patterns:

| If your industry involves... | Pick these templates |
|---|---|
| **Any AI processing of EU resident data** | GDPR · EU AI Act · ISO 27001 |
| **Any AI managing systems** | ISO 42001 |
| **Universal info security baseline** | ISO 27001 |
| **US federal / state government** | FedRAMP + NIST · NIST AI RMF |
| **US healthcare** | HIPAA · NIST AI RMF |
| **UAE financial supervised entities** | CBUAE · ISO 42001 |
| **Saudi financial supervised entities** | SAMA · ISO 42001 |
| **Any US public-company AI** | NIST AI RMF · ISO 27001 |
| **Cross-border AI traffic** | GDPR · ISO 27001 · plus relevant local |

Most industries need 3–4 of these. The rest is industry-specific event types and use-case registry entries — both of which take less than an hour to set up.

---

## Examples to copy

The `examples/` folder contains starter scenarios for:

| Industry | File |
|---|---|
| **BFSI** | `examples/01-basic-sign-verify.ts` |
| **AI gateway with policy** | `examples/02-multiple-receipts-chain.ts` |
| **Tamper detection** | `examples/03-tamper-detection.ts` |
| **Multi-tenant** | `examples/04-multi-tenant.ts` |
| **Express middleware** | `examples/05-express-middleware.ts` |
| **Healthcare · clinical decision support** | `examples/06-healthcare-cds.ts` |
| **Government · benefits eligibility** | `examples/07-government-eligibility.ts` |

Copy, adapt, ship. Apache-2.0 — no need to ask permission.

---

## The honest scope statement

| What's universal | What's industry-specific |
|---|---|
| Cryptographic substrate (RFC 8785, Ed25519, hash chain) | Event type vocabulary |
| The 4 AI vendor adapters | Risk tiering thresholds |
| The 9 regulator templates | PII categories beyond the universal 14 |
| The safety detection layers | Use-case registry entries |
| The receipt format itself | Approved-model lists |
| The transparency log | Industry-specific reporting needs |
| TypeScript types and SDK shape | Integration with your existing audit infra |

Universal parts: 95% of the SDK. Industry-specific parts: < 5%. **You spend an hour configuring, not weeks rebuilding.**

That's the promise.
