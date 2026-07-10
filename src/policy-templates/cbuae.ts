/**
 * CBUAE Responsible AI Framework, pre-built policy template.
 *
 * Tracks the Central Bank of the UAE's "Principles for Responsible AI"
 * issued February 2026, applied to UAE-supervised financial entities.
 * The transitional Article 184 compliance deadline is September 16, 2026.
 *
 * Administrative fines under Federal Decree-Law No. 6 of 2025 can reach
 * AED 1 billion per violation.
 */

import type { PolicyTemplate } from "./types.js";

export const CBUAE_RESPONSIBLE_AI: PolicyTemplate = {
  regulator: "CBUAE",
  name: "CBUAE Principles for Responsible AI",
  version: "2026.02",
  published_at: "2026-02-15",
  effective_deadline: "2026-09-16",
  summary:
    "Five principles binding all UAE-supervised banking and insurance entities. " +
    "Receipts produced under this template are formatted for the CBUAE Article 184 transitional inspection pack.",
  reason_code_prefix: "cbuae",
  articles: [
    {
      id: "P1",
      title: "Governance & Accountability",
      requirement:
        "Each entity must designate a named accountable executive for every AI system in production, and document the governance chain from that executive to the operational team.",
      pillar: "governance",
      satisfied_by_fields: ["event.context.user_id", "use_case_id", "model_id", "decision.applied_policies"],
      severity: "high",
      source_citation: "CBUAE Responsible AI Principle 1 (Feb 2026)",
    },
    {
      id: "P2",
      title: "Fairness & Non-Discrimination",
      requirement:
        "AI systems must be evaluated for bias against protected groups. Disparity metrics must be measured at least quarterly and after every model update.",
      pillar: "fairness",
      satisfied_by_fields: ["event.payload.metadata.fairness_metrics", "model_id"],
      severity: "high",
      source_citation: "CBUAE Responsible AI Principle 2 (Feb 2026)",
    },
    {
      id: "P3",
      title: "Transparency & Explainability",
      requirement:
        "Customers materially affected by an AI decision must be informed. The entity must be able to explain decisions to the regulator on request.",
      pillar: "transparency",
      satisfied_by_fields: ["event.subject.ai_model", "event.subject.ai_vendor", "decision.reason_codes", "event.payload.input_hash", "event.payload.output_hash"],
      severity: "high",
      source_citation: "CBUAE Responsible AI Principle 3 (Feb 2026)",
    },
    {
      id: "P4",
      title: "Human Oversight",
      requirement:
        "High-risk AI decisions must have a clearly defined human review and override path. The path must be evidenced for every high-risk decision.",
      pillar: "human_oversight",
      satisfied_by_fields: ["decision.decision", "decision.applied_policies", "provenance.parent_receipt_ids"],
      severity: "critical",
      source_citation: "CBUAE Responsible AI Principle 4 (Feb 2026)",
    },
    {
      id: "P5",
      title: "Data Management & Security",
      requirement:
        "Customer data fed into AI systems must be classified, access-controlled, and logged. PII must be hashed or redacted before being captured in the audit trail.",
      pillar: "data_management",
      satisfied_by_fields: ["event.payload.input_classification", "event.payload.input_hash", "event.payload.metadata.safety"],
      severity: "critical",
      source_citation: "CBUAE Responsible AI Principle 5 (Feb 2026)",
    },
    {
      id: "ART184",
      title: "Article 184 Transitional Inspection",
      requirement:
        "By 16 September 2026, supervised entities must be able to produce a sealed evidence pack demonstrating compliance with the five principles for any AI system in production scope.",
      pillar: "incident_response",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "integrity.chain_height", "timestamps"],
      severity: "critical",
      source_citation: "Federal Decree-Law No. 6 of 2025 Article 184 (transitional)",
    },
  ],
};
