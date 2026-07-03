/**
 * ISO/IEC 42001 — AI Management Systems — pre-built policy template.
 *
 * The first international standard for AI management systems. Already
 * appearing in approximately 40% of EU enterprise AI procurement RFPs.
 */

import type { PolicyTemplate } from "./types.js";

export const ISO_42001: PolicyTemplate = {
  regulator: "ISO_42001",
  name: "ISO/IEC 42001 — AI Management Systems",
  version: "2023",
  published_at: "2023-12-18",
  summary:
    "International standard for establishing and operating an AI Management " +
    "System (AIMS). Maps to Annex A controls (38 controls across 8 categories).",
  reason_code_prefix: "iso42001",
  articles: [
    {
      id: "A.2.2",
      title: "Policy for AI",
      requirement:
        "Top management shall establish and maintain an AI policy that supports the strategic direction of the organization.",
      pillar: "governance",
      satisfied_by_fields: ["decision.policy_bundle_hash"],
      source_citation: "ISO/IEC 42001:2023 Annex A.2.2",
    },
    {
      id: "A.4.3",
      title: "Documented Information for AI System Design",
      requirement:
        "AI systems shall be designed in a manner that allows for their operation, behavior, and impact to be documented.",
      pillar: "transparency",
      satisfied_by_fields: ["use_case_id", "model_id"],
      source_citation: "ISO/IEC 42001:2023 Annex A.4.3",
    },
    {
      id: "A.5.2",
      title: "AI Risk Assessment",
      requirement:
        "Risks associated with AI systems shall be identified, analyzed, and treated.",
      pillar: "model_risk",
      satisfied_by_fields: ["event.payload.metadata.safety", "event.payload.metadata.injection"],
      source_citation: "ISO/IEC 42001:2023 Annex A.5.2",
    },
    {
      id: "A.6.2.6",
      title: "AI System Verification & Validation",
      requirement:
        "AI systems shall be verified and validated to ensure they meet specified requirements.",
      pillar: "performance_monitoring",
      satisfied_by_fields: ["model_id", "event.payload.metadata.validation_status"],
      source_citation: "ISO/IEC 42001:2023 Annex A.6.2.6",
    },
    {
      id: "A.7.4",
      title: "Resources for AI Systems",
      requirement:
        "Resources used to operate AI systems shall be documented, including data and computing resources.",
      pillar: "supply_chain",
      satisfied_by_fields: ["event.subject.ai_vendor", "event.subject.ai_provider", "model_id"],
      source_citation: "ISO/IEC 42001:2023 Annex A.7.4",
    },
    {
      id: "A.10.2",
      title: "Third-Party Relationships",
      requirement:
        "Risks associated with third-party AI providers and components shall be assessed.",
      pillar: "third_party_risk",
      satisfied_by_fields: ["event.subject.ai_vendor", "event.subject.ai_provider"],
      source_citation: "ISO/IEC 42001:2023 Annex A.10.2",
    },
  ],
};
