/**
 * HIPAA Security Rule (45 CFR Part 164 Subpart C), pre-built template.
 *
 * Applies to covered entities and business associates handling Protected
 * Health Information (PHI). Increasingly relevant to AI deployments
 * processing patient data, clinical decision support tools, ambient
 * scribes, and diagnostic AI.
 *
 * Maximum civil penalties: up to $2.067M per calendar year per category
 * (2025 inflation-adjusted). Criminal penalties for willful neglect.
 */

import type { PolicyTemplate } from "./types.js";

export const HIPAA_SECURITY_RULE: PolicyTemplate = {
  regulator: "ISO_42001",  // closest existing enum; HIPAA-specific Regulator key in future revision
  name: "HIPAA Security Rule, AI processing of PHI",
  version: "45-CFR-164-Subpart-C",
  published_at: "2003-02-20",
  summary:
    "US healthcare privacy and security standards. Applies to AI systems " +
    "processing Protected Health Information. Receipts populate audit-log " +
    "requirements under §164.312(b) and access-control requirements " +
    "under §164.308(a)(1)(ii)(D).",
  reason_code_prefix: "hipaa",
  articles: [
    {
      id: "164.308.a.1.ii.D",
      title: "Information System Activity Review",
      requirement:
        "Implement procedures to regularly review records of information system activity, including AI invocations that touch PHI.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "event.context.user_id", "event.payload.input_classification"],
      severity: "high",
      source_citation: "45 CFR § 164.308(a)(1)(ii)(D)",
    },
    {
      id: "164.308.a.3",
      title: "Workforce Security",
      requirement:
        "Authorization and supervision of workforce members who work with electronic PHI, including those invoking AI on PHI data.",
      pillar: "accountability",
      satisfied_by_fields: ["event.context.user_id", "decision.applied_policies"],
      severity: "high",
      source_citation: "45 CFR § 164.308(a)(3)",
    },
    {
      id: "164.308.a.4",
      title: "Information Access Management",
      requirement:
        "Access to PHI must be authorized and recorded, including access through AI inference systems.",
      pillar: "accountability",
      satisfied_by_fields: ["event.context.user_id", "event.context.service_id", "decision.decision"],
      severity: "high",
      source_citation: "45 CFR § 164.308(a)(4)",
    },
    {
      id: "164.312.b",
      title: "Audit Controls",
      requirement:
        "Implement hardware, software, and procedural mechanisms that record and examine activity in information systems containing or using PHI.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "integrity.chain_height", "timestamps"],
      severity: "critical",
      source_citation: "45 CFR § 164.312(b)",
    },
    {
      id: "164.312.c",
      title: "Integrity Controls",
      requirement:
        "Protect electronic PHI from improper alteration or destruction. Hash-chained receipts provide cryptographic integrity for any AI-derived data record.",
      pillar: "data_management",
      satisfied_by_fields: ["integrity.receipt_hash", "event.payload.input_hash", "event.payload.output_hash"],
      severity: "critical",
      source_citation: "45 CFR § 164.312(c)",
    },
    {
      id: "164.312.e",
      title: "Transmission Security",
      requirement:
        "Implement technical security measures to guard against unauthorized access to electronic PHI being transmitted, including to AI inference endpoints.",
      pillar: "security",
      satisfied_by_fields: ["event.subject.ai_provider", "event.context.region"],
      severity: "high",
      source_citation: "45 CFR § 164.312(e)",
    },
    {
      id: "164.404",
      title: "Breach Notification",
      requirement:
        "Notification required following discovery of breach of unsecured PHI. Cryptographic receipts allow rapid scoping of what was accessed and when.",
      pillar: "incident_response",
      satisfied_by_fields: ["integrity.receipt_hash", "event.captured_at", "event.payload.metadata.safety"],
      severity: "high",
      source_citation: "45 CFR § 164.404",
    },
  ],
};
