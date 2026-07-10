/**
 * NIST AI Risk Management Framework (AI RMF 1.0), pre-built template.
 *
 * Voluntary US framework with four functions: Govern, Map, Measure, Manage.
 * Adopted by many US federal contractors and increasingly cited by state
 * AI bills (CO, CA, NY).
 */

import type { PolicyTemplate } from "./types.js";

export const NIST_AI_RMF: PolicyTemplate = {
  regulator: "NIST_RMF",
  name: "NIST AI Risk Management Framework 1.0",
  version: "1.0",
  published_at: "2023-01-26",
  summary:
    "Voluntary framework with four functions (Govern, Map, Measure, Manage) " +
    "and AI risk characteristics (Valid, Reliable, Safe, Secure, Resilient, " +
    "Accountable, Transparent, Explainable, Interpretable, Privacy-Enhanced, Fair).",
  reason_code_prefix: "nist_rmf",
  articles: [
    {
      id: "GOVERN-1.1",
      title: "Legal and Regulatory Requirements Understood and Documented",
      requirement:
        "Legal and regulatory requirements involving AI are understood and documented.",
      pillar: "governance",
      satisfied_by_fields: ["decision.applied_policies"],
      source_citation: "NIST AI RMF 1.0 GOVERN 1.1",
    },
    {
      id: "MAP-2.3",
      title: "Scientific Integrity and TEVV (Test, Evaluation, Verification, Validation)",
      requirement:
        "Scientific integrity and TEVV considerations are identified and documented.",
      pillar: "model_risk",
      satisfied_by_fields: ["model_id", "event.payload.metadata.validation_status"],
      source_citation: "NIST AI RMF 1.0 MAP 2.3",
    },
    {
      id: "MEASURE-2.6",
      title: "AI System Performance Evaluated",
      requirement:
        "AI system performance is evaluated regularly in deployment to ensure assumptions still hold.",
      pillar: "performance_monitoring",
      satisfied_by_fields: ["event.payload.metadata.latency_ms", "event.payload.output_token_count"],
      source_citation: "NIST AI RMF 1.0 MEASURE 2.6",
    },
    {
      id: "MEASURE-2.10",
      title: "Privacy Risk Measured",
      requirement:
        "Privacy risk of the AI system is examined and documented.",
      pillar: "data_management",
      satisfied_by_fields: ["event.payload.input_classification", "event.payload.metadata.safety"],
      source_citation: "NIST AI RMF 1.0 MEASURE 2.10",
    },
    {
      id: "MANAGE-2.1",
      title: "Resources for AI Risk Treatment",
      requirement:
        "Resources required to manage AI risks are documented and allocated.",
      pillar: "incident_response",
      satisfied_by_fields: ["integrity.receipt_hash"],
      source_citation: "NIST AI RMF 1.0 MANAGE 2.1",
    },
  ],
};
