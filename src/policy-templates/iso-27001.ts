/**
 * ISO/IEC 27001:2022, Information Security Management Systems.
 *
 * The universal information security standard. Applies to every
 * industry: financial services, healthcare, manufacturing, government,
 * education, telecom, retail. If an organization handles information
 * that could matter to anyone, ISO 27001 is in scope.
 *
 * Annex A contains 93 controls grouped into four themes. This template
 * maps the AI-relevant subset to receipt fields.
 */

import type { PolicyTemplate } from "./types.js";

export const ISO_27001_AI: PolicyTemplate = {
  regulator: "ISO_42001",
  name: "ISO/IEC 27001:2022, AI-Relevant Controls",
  version: "2022",
  published_at: "2022-10-25",
  summary:
    "Universal information security management standard. Applies to AI " +
    "systems across every industry. This template maps the 12 most " +
    "AI-relevant Annex A controls to receipt fields.",
  reason_code_prefix: "iso27001",
  articles: [
    {
      id: "A.5.10",
      title: "Acceptable Use of Information",
      requirement:
        "Rules for the acceptable use of information and assets, including AI systems, shall be identified, documented, and implemented.",
      pillar: "governance",
      satisfied_by_fields: ["decision.applied_policies", "event.context.user_id"],
      source_citation: "ISO/IEC 27001:2022 Annex A.5.10",
    },
    {
      id: "A.5.34",
      title: "Privacy and Protection of PII",
      requirement:
        "The organization shall identify and meet the requirements regarding the preservation of privacy and protection of personally identifiable information when processed by AI systems.",
      pillar: "data_management",
      satisfied_by_fields: ["event.payload.input_classification", "event.payload.metadata.safety"],
      source_citation: "ISO/IEC 27001:2022 Annex A.5.34",
    },
    {
      id: "A.8.15",
      title: "Logging",
      requirement:
        "Logs that record activities, exceptions, faults, and other relevant events shall be produced, stored, protected, and analyzed.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "event.captured_at"],
      source_citation: "ISO/IEC 27001:2022 Annex A.8.15",
    },
    {
      id: "A.8.16",
      title: "Monitoring Activities",
      requirement:
        "Networks, systems, and applications, including AI systems, shall be monitored for anomalous behavior and appropriate actions taken.",
      pillar: "performance_monitoring",
      satisfied_by_fields: ["event.payload.metadata.safety", "event.payload.metadata.injection"],
      source_citation: "ISO/IEC 27001:2022 Annex A.8.16",
    },
    {
      id: "A.8.25",
      title: "Secure Development Life Cycle",
      requirement:
        "Rules for the secure development of software and systems, including AI components, shall be established and applied.",
      pillar: "model_risk",
      satisfied_by_fields: ["model_id", "event.payload.metadata.validation_status"],
      source_citation: "ISO/IEC 27001:2022 Annex A.8.25",
    },
    {
      id: "A.8.32",
      title: "Change Management",
      requirement:
        "Changes to information processing facilities, including AI model versions, shall be subject to change management procedures.",
      pillar: "model_risk",
      satisfied_by_fields: ["model_id", "event.subject.ai_model"],
      source_citation: "ISO/IEC 27001:2022 Annex A.8.32",
    },
  ],
};
