/**
 * GDPR, Regulation (EU) 2016/679.
 *
 * Cross-industry privacy regulation. Applies to any AI system
 * processing personal data of EU residents, regardless of where the
 * organization is based.
 *
 * Article 22 (automated individual decision-making) is the central AI
 * provision. Receipts produced under this template establish the
 * auditable record needed for Article 22 compliance and the
 * accountability principle under Article 5(2).
 */

import type { PolicyTemplate } from "./types.js";

export const GDPR_AI: PolicyTemplate = {
  regulator: "EU_AI_ACT",
  name: "GDPR, AI Article 22 + Accountability",
  version: "2016-679",
  published_at: "2016-04-27",
  summary:
    "EU privacy regulation. Applies cross-industry to any AI processing " +
    "personal data of EU residents. Receipts establish the auditable " +
    "record for Article 22 (automated decision-making) and the broader " +
    "accountability principle.",
  reason_code_prefix: "gdpr",
  articles: [
    {
      id: "ART5.1.a",
      title: "Lawfulness, Fairness and Transparency",
      requirement:
        "Personal data shall be processed lawfully, fairly, and in a transparent manner. AI invocations on personal data must be recorded with sufficient detail to demonstrate this.",
      pillar: "fairness",
      satisfied_by_fields: ["event.payload.input_classification", "decision.applied_policies", "event.subject.ai_model"],
      source_citation: "Regulation (EU) 2016/679 Article 5(1)(a)",
    },
    {
      id: "ART5.2",
      title: "Accountability",
      requirement:
        "The controller shall be responsible for, and be able to demonstrate compliance with, the principles relating to processing of personal data. Tamper-evident receipts are the canonical demonstration mechanism.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "integrity.previous_receipt_hash", "signatures"],
      source_citation: "Regulation (EU) 2016/679 Article 5(2)",
    },
    {
      id: "ART22",
      title: "Automated Individual Decision-Making",
      requirement:
        "The data subject has the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her, or significantly affects him or her.",
      pillar: "human_oversight",
      satisfied_by_fields: ["decision.decision", "decision.reason_codes", "event.context.user_id"],
      source_citation: "Regulation (EU) 2016/679 Article 22",
    },
    {
      id: "ART30",
      title: "Records of Processing Activities",
      requirement:
        "Each controller shall maintain a record of processing activities under its responsibility. Cryptographic receipts populate the record directly.",
      pillar: "accountability",
      satisfied_by_fields: ["integrity.receipt_hash", "event.event_type", "event.captured_at"],
      source_citation: "Regulation (EU) 2016/679 Article 30",
    },
    {
      id: "ART32",
      title: "Security of Processing",
      requirement:
        "Implement appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including the pseudonymisation and encryption of personal data.",
      pillar: "security",
      satisfied_by_fields: ["event.payload.input_hash", "event.payload.output_hash", "event.payload.metadata.safety"],
      source_citation: "Regulation (EU) 2016/679 Article 32",
    },
    {
      id: "ART33",
      title: "Notification of Personal Data Breach",
      requirement:
        "Within 72 hours of becoming aware of a personal data breach, notify the supervisory authority. Cryptographic receipts enable rapid breach scoping.",
      pillar: "incident_response",
      satisfied_by_fields: ["integrity.receipt_hash", "event.captured_at", "event.payload.metadata.safety"],
      source_citation: "Regulation (EU) 2016/679 Article 33",
    },
    {
      id: "ART35",
      title: "Data Protection Impact Assessment",
      requirement:
        "Where processing, particularly using new technologies, is likely to result in high risk, the controller shall carry out a DPIA prior to processing.",
      pillar: "model_risk",
      satisfied_by_fields: ["use_case_id", "model_id", "event.payload.metadata.safety"],
      source_citation: "Regulation (EU) 2016/679 Article 35",
    },
  ],
};
