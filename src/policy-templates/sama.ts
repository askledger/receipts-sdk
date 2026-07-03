/**
 * SAMA (Saudi Central Bank) AI guidance — pre-built policy template.
 *
 * Tracks SAMA's AI Adoption Framework guidance for Saudi-supervised
 * financial entities (banks, insurers, fintechs operating under SAMA
 * licensing). Aligned with Vision 2030 and Saudi 2026 Year of AI.
 */

import type { PolicyTemplate } from "./types.js";

export const SAMA_AI_GUIDANCE: PolicyTemplate = {
  regulator: "SAMA",
  name: "SAMA AI Adoption Framework",
  version: "2025.11",
  published_at: "2025-11-05",
  summary:
    "Risk-tiered AI controls for KSA financial sector. Aligns with NCA Essential " +
    "Cybersecurity Controls (ECC-1) and Saudi PDPL. Receipts under this template " +
    "are formatted for SAMA's annual supervisory review cycle.",
  reason_code_prefix: "sama",
  articles: [
    {
      id: "T1",
      title: "AI System Inventory",
      requirement:
        "Maintain a complete inventory of every AI system in production with named owner, risk tier, and data sensitivity classification.",
      pillar: "governance",
      satisfied_by_fields: ["use_case_id", "model_id", "event.context.user_id"],
      severity: "high",
      source_citation: "SAMA AI Adoption Framework §3.1",
    },
    {
      id: "T2",
      title: "Saudi Data Residency",
      requirement:
        "Customer data processed by AI systems must remain within KSA borders unless a specific cross-border exemption is granted by SAMA.",
      pillar: "data_management",
      satisfied_by_fields: ["event.context.region", "event.subject.ai_provider"],
      severity: "critical",
      source_citation: "SAMA AI Adoption Framework §4.2 + PDPL Article 29",
    },
    {
      id: "T3",
      title: "AI Decision Logging",
      requirement:
        "Every AI decision affecting a customer must be logged with sufficient detail to reproduce the decision in a regulator inquiry.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "decision"],
      severity: "high",
      source_citation: "SAMA AI Adoption Framework §5.3",
    },
    {
      id: "T4",
      title: "Cybersecurity Controls (ECC-1 alignment)",
      requirement:
        "AI systems must comply with applicable controls of the National Cybersecurity Authority's Essential Cybersecurity Controls (ECC-1).",
      pillar: "security",
      satisfied_by_fields: ["event.context.service_id", "event.payload.metadata.safety"],
      severity: "high",
      source_citation: "SAMA AI Adoption Framework §6 + NCA ECC-1",
    },
    {
      id: "T5",
      title: "Customer Recourse",
      requirement:
        "Customers must have a documented channel to dispute AI-driven decisions and obtain human review within a defined SLA.",
      pillar: "human_oversight",
      satisfied_by_fields: ["decision.decision", "decision.reason_codes"],
      severity: "high",
      source_citation: "SAMA AI Adoption Framework §7",
    },
  ],
};
