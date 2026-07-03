/**
 * FedRAMP / NIST SP 800-53 Rev. 5 — pre-built template for US federal
 * AI deployments and contractors.
 *
 * The Office of Management and Budget M-24-10 memorandum (March 2024)
 * established AI-specific governance requirements for federal agencies.
 * Receipts produced under this template feed the agency AI inventory
 * and the AI Use Case Inventory required under EO 14110.
 */

import type { PolicyTemplate } from "./types.js";

export const FEDRAMP_NIST_AI: PolicyTemplate = {
  regulator: "NIST_RMF",
  name: "FedRAMP + NIST SP 800-53 — Federal AI Controls",
  version: "Rev-5",
  published_at: "2020-09-23",
  summary:
    "Federal control catalog for AI systems handling government data. " +
    "Aligns with OMB M-24-10, EO 14110, and NIST AI RMF. Receipts populate " +
    "AU (audit) and AC (access control) family requirements for the AI " +
    "deployment's authorization-to-operate package.",
  reason_code_prefix: "fedramp",
  articles: [
    {
      id: "AC-2",
      title: "Account Management",
      requirement:
        "Identify and authenticate users invoking AI systems. Record account-level activity in tamper-evident logs.",
      pillar: "accountability",
      satisfied_by_fields: ["event.context.user_id", "event.context.service_id"],
      severity: "high",
      source_citation: "NIST SP 800-53 Rev. 5 AC-2",
    },
    {
      id: "AC-3",
      title: "Access Enforcement",
      requirement:
        "Enforce approved authorizations for logical access to information system AI components.",
      pillar: "accountability",
      satisfied_by_fields: ["decision.decision", "decision.applied_policies"],
      severity: "high",
      source_citation: "NIST SP 800-53 Rev. 5 AC-3",
    },
    {
      id: "AU-2",
      title: "Event Logging",
      requirement:
        "Define and configure the AI system to log events necessary for audit, including all AI inference invocations and decisions.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "event.event_type", "event.captured_at"],
      severity: "critical",
      source_citation: "NIST SP 800-53 Rev. 5 AU-2",
    },
    {
      id: "AU-9",
      title: "Protection of Audit Information",
      requirement:
        "Protect audit information and audit logging tools from unauthorized access, modification, and deletion. Cryptographic hash chains satisfy this requirement.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "signatures"],
      severity: "critical",
      source_citation: "NIST SP 800-53 Rev. 5 AU-9",
    },
    {
      id: "AU-10",
      title: "Non-Repudiation",
      requirement:
        "Protect against an individual falsely denying having performed an action — including invoking an AI inference.",
      pillar: "accountability",
      satisfied_by_fields: ["signatures", "integrity.receipt_hash"],
      severity: "high",
      source_citation: "NIST SP 800-53 Rev. 5 AU-10",
    },
    {
      id: "AU-12",
      title: "Audit Record Generation",
      requirement:
        "Provide audit record generation capability for events identified in AU-2.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "event"],
      severity: "high",
      source_citation: "NIST SP 800-53 Rev. 5 AU-12",
    },
    {
      id: "SI-12",
      title: "Information Handling and Retention",
      requirement:
        "Handle and retain information within the information system and information output from the system in accordance with applicable federal laws, executive orders, directives, policies, regulations, standards, and operational requirements.",
      pillar: "data_management",
      satisfied_by_fields: ["event.payload.input_classification", "event.context.region"],
      severity: "medium",
      source_citation: "NIST SP 800-53 Rev. 5 SI-12",
    },
    {
      id: "OMB-M-24-10",
      title: "AI Use Case Inventory",
      requirement:
        "Maintain inventory of AI use cases including those that are safety-impacting or rights-impacting per OMB M-24-10.",
      pillar: "governance",
      satisfied_by_fields: ["use_case_id", "model_id", "event.subject.ai_capability"],
      severity: "high",
      source_citation: "OMB Memorandum M-24-10 §5",
    },
  ],
};
