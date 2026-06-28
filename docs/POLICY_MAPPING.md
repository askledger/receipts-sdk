# Policy Mapping

A reader-friendly cross-reference of regulatory articles to the receipt fields that satisfy them.

The same mappings live in code at [`src/policy-templates/`](../src/policy-templates/) and are applied automatically by `citeReceipt()`. This document is for auditors, compliance leads, and regulators who want to read the mappings without opening source.

## Reading guide

A receipt is said to *satisfy* an article when its body contains at least one of the fields the article requires. Confidence is the fraction of required fields present. Receipts may satisfy many articles simultaneously, across many regulators.

---

## CBUAE · Responsible AI Framework

Source: Central Bank of the UAE Principles for Responsible AI (Feb 2026). Federal Decree-Law No. 6 of 2025 Article 184 transitional deadline: **16 September 2026**. Maximum fine: AED 1,000,000,000.

| Article | Title | Receipt fields that satisfy |
|---|---|---|
| P1 | Governance & Accountability | `event.context.user_id`, `use_case_id`, `model_id`, `decision.applied_policies` |
| P2 | Fairness & Non-Discrimination | `event.payload.metadata.fairness_metrics`, `model_id` |
| P3 | Transparency & Explainability | `event.subject.ai_model`, `event.subject.ai_vendor`, `decision.reason_codes`, `event.payload.input_hash`, `event.payload.output_hash` |
| P4 | Human Oversight | `decision.decision`, `decision.applied_policies`, `provenance.parent_receipt_ids` |
| P5 | Data Management & Security | `event.payload.input_classification`, `event.payload.input_hash`, `event.payload.metadata.safety` |
| ART184 | Transitional Inspection | `integrity.receipt_hash`, `integrity.previous_receipt_hash`, `integrity.chain_height`, `timestamps` |

## EU AI Act · Regulation 2024/1689

Source: Regulation (EU) 2024/1689. High-risk obligations applicable: **2 August 2026**. Maximum fine: EUR 35M or 7% global annual turnover.

| Article | Title | Receipt fields that satisfy |
|---|---|---|
| ART9 | Risk Management System | `event.payload.metadata.safety`, `use_case_id`, `model_id` |
| ART10 | Data and Data Governance | `event.payload.input_classification`, `model_id` |
| ART11 + Annex IV | Technical Documentation | `integrity.receipt_hash`, `event`, `decision`, `provenance` |
| ART12 | Record-Keeping (logs) | `integrity.receipt_hash`, `integrity.previous_receipt_hash`, `integrity.chain_height`, `timestamps` |
| ART13 | Transparency to Users | `event.subject.ai_vendor`, `event.subject.ai_model`, `decision.reason_codes` |
| ART14 | Human Oversight | `decision.decision`, `event.context.user_id`, `provenance.parent_receipt_ids` |
| ART15 | Accuracy, Robustness, Cybersecurity | `event.payload.metadata.safety`, `event.payload.metadata.injection` |
| ART50 | Generative AI Transparency | `event.subject.ai_capability`, `event.payload.output_hash` |

## SAMA · AI Adoption Framework

Source: Saudi Central Bank AI Adoption Framework. Aligned with NCA Essential Cybersecurity Controls (ECC-1) and Saudi PDPL.

| Article | Title | Receipt fields that satisfy |
|---|---|---|
| T1 | AI System Inventory | `use_case_id`, `model_id`, `event.context.user_id` |
| T2 | Saudi Data Residency | `event.context.region`, `event.subject.ai_provider` |
| T3 | AI Decision Logging | `integrity.receipt_hash`, `integrity.previous_receipt_hash`, `decision` |
| T4 | Cybersecurity Controls (ECC-1) | `event.context.service_id`, `event.payload.metadata.safety` |
| T5 | Customer Recourse | `decision.decision`, `decision.reason_codes` |

## ISO/IEC 42001 · AI Management Systems

Source: ISO/IEC 42001:2023. Annex A controls — 38 across 8 categories.

| Article | Title | Receipt fields that satisfy |
|---|---|---|
| A.2.2 | Policy for AI | `decision.policy_bundle_hash` |
| A.4.3 | Documented Information for AI System Design | `use_case_id`, `model_id` |
| A.5.2 | AI Risk Assessment | `event.payload.metadata.safety`, `event.payload.metadata.injection` |
| A.6.2.6 | AI System Verification & Validation | `model_id`, `event.payload.metadata.validation_status` |
| A.7.4 | Resources for AI Systems | `event.subject.ai_vendor`, `event.subject.ai_provider`, `model_id` |
| A.10.2 | Third-Party Relationships | `event.subject.ai_vendor`, `event.subject.ai_provider` |

## NIST AI Risk Management Framework 1.0

Source: NIST AI RMF 1.0 (Jan 2023). Voluntary in the US; cited by CO, CA, NY state AI legislation.

| Article | Title | Receipt fields that satisfy |
|---|---|---|
| GOVERN-1.1 | Legal & Regulatory Requirements Documented | `decision.applied_policies` |
| MAP-2.3 | Scientific Integrity and TEVV | `model_id`, `event.payload.metadata.validation_status` |
| MEASURE-2.6 | AI System Performance Evaluated | `event.payload.metadata.latency_ms`, `event.payload.output_token_count` |
| MEASURE-2.10 | Privacy Risk Measured | `event.payload.input_classification`, `event.payload.metadata.safety` |
| MANAGE-2.1 | Resources for AI Risk Treatment | `integrity.receipt_hash` |

---

## How to cite a receipt against these

```ts
import { citeAgainstAll, signReceipt, generateKeyPair } from "@projectledger/receipts-sdk";

const receipt = signReceipt({ event, keypair: generateKeyPair() });
const citations = citeAgainstAll(receipt);
// → [{regulator:"CBUAE",article_id:"ART184",confidence:1.0}, ...]
```

Receipts with high field-completeness automatically satisfy more articles. The Receipt Score (separate metric) weights regulatory coverage as one of five sub-scores.

## How to add a regulator

Open a pull request adding a `src/policy-templates/<your-regulator>.ts` file with the `PolicyTemplate` shape. The template is content-addressed by SHA-256 of its canonical bytes, so consumers can verify which version a receipt was cited against. Community contributions are reviewed for accuracy of the underlying article references — not for whether your regulator is in scope. We accept everything that maps cleanly.

## Coming soon

- US Federal Reserve SR 26-2 (AI extension to SR 11-7)
- UK PRA SS1/23
- RBI FREE-AI (India)
- HKMA AI guidance (Hong Kong)
- MAS Veritas (Singapore)

Pull requests welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
