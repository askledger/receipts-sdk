/**
 * EU AI Act, Regulation 2024/1689, pre-built policy template.
 *
 * High-risk AI system obligations become applicable on 2 August 2026.
 * Fines up to EUR 35,000,000 or 7% of global annual turnover for the
 * most serious violations.
 */

import type { PolicyTemplate } from "./types.js";

export const EU_AI_ACT: PolicyTemplate = {
  regulator: "EU_AI_ACT",
  name: "EU AI Act (Regulation 2024/1689), High-Risk Obligations",
  version: "2024.07",
  published_at: "2024-07-12",
  effective_deadline: "2026-08-02",
  summary:
    "High-risk AI system obligations under Title III. Receipts produced under " +
    "this template can be combined into the Annex IV technical documentation " +
    "package and the Article 50 transparency declarations.",
  reason_code_prefix: "eu_ai_act",
  articles: [
    {
      id: "ART9",
      title: "Risk Management System",
      requirement:
        "Establish, implement, document, and maintain a risk management system over the lifecycle of every high-risk AI system.",
      pillar: "model_risk",
      satisfied_by_fields: ["event.payload.metadata.safety", "use_case_id", "model_id"],
      severity: "critical",
      source_citation: "Regulation 2024/1689 Article 9",
    },
    {
      id: "ART10",
      title: "Data and Data Governance",
      requirement:
        "Training, validation, and testing data sets must be relevant, sufficiently representative, and free of errors and complete in view of the intended purpose.",
      pillar: "data_management",
      satisfied_by_fields: ["event.payload.input_classification", "model_id"],
      severity: "high",
      source_citation: "Regulation 2024/1689 Article 10",
    },
    {
      id: "ART11_ANNEX_IV",
      title: "Technical Documentation (Annex IV)",
      requirement:
        "Technical documentation must demonstrate compliance with all requirements. Receipts feed sections 2 (system architecture), 3 (data), 4 (monitoring), 5 (risk management), 6 (changes), 7 (standards), and 9 (post-market monitoring).",
      pillar: "transparency",
      satisfied_by_fields: ["integrity.receipt_hash", "event", "decision", "provenance"],
      severity: "critical",
      source_citation: "Regulation 2024/1689 Article 11 + Annex IV",
    },
    {
      id: "ART12",
      title: "Record-Keeping (Logs)",
      requirement:
        "High-risk AI systems must technically allow for the automatic recording of events ('logs') over their lifetime. Logs must enable post-market monitoring and incident traceability.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "integrity.chain_height", "timestamps"],
      severity: "critical",
      source_citation: "Regulation 2024/1689 Article 12",
    },
    {
      id: "ART13",
      title: "Transparency to Users",
      requirement:
        "High-risk AI systems must be sufficiently transparent to enable deployers to interpret the system's output and use it appropriately.",
      pillar: "transparency",
      satisfied_by_fields: ["event.subject.ai_vendor", "event.subject.ai_model", "decision.reason_codes"],
      severity: "high",
      source_citation: "Regulation 2024/1689 Article 13",
    },
    {
      id: "ART14",
      title: "Human Oversight",
      requirement:
        "High-risk AI systems must be designed and developed to be effectively overseen by natural persons during the period of use.",
      pillar: "human_oversight",
      satisfied_by_fields: ["decision.decision", "event.context.user_id", "provenance.parent_receipt_ids"],
      severity: "high",
      source_citation: "Regulation 2024/1689 Article 14",
    },
    {
      id: "ART15",
      title: "Accuracy, Robustness, and Cybersecurity",
      requirement:
        "High-risk AI systems must achieve appropriate levels of accuracy, robustness, and cybersecurity, and perform consistently throughout their lifecycle.",
      pillar: "robustness",
      satisfied_by_fields: ["event.payload.metadata.safety", "event.payload.metadata.injection"],
      severity: "high",
      source_citation: "Regulation 2024/1689 Article 15",
    },
    {
      id: "ART50",
      title: "Transparency for Generative & General-Purpose AI",
      requirement:
        "Providers of generative AI must ensure outputs are marked as artificially generated. Deployers of high-risk systems must inform individuals subject to AI decisions.",
      pillar: "transparency",
      satisfied_by_fields: ["event.subject.ai_capability", "event.payload.output_hash"],
      severity: "high",
      source_citation: "Regulation 2024/1689 Article 50",
    },
  ],
};
