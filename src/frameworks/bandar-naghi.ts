/**
 * Bandar Naghi · industry framework adapter (open shell).
 *
 * Three frameworks ship as verified outer structure:
 *   1. AI Governance (QAG) — 5-pillar framework
 *   2. AI Security (QAIS) — 3-tower framework
 *   3. AI Agency — 7-pillar framework
 *
 * Verified-from-source: structure (count + framework name) is taken
 * directly from bandarnaghi.com (homepage and the three sub-page hero
 * sections). The specific per-pillar text is the author's published
 * book content (Amazon Kindle, see ASIN per framework) and is loaded
 * via an author-supplied JSON or marked "awaiting" until the author
 * verifies/contributes the text.
 *
 * This file does NOT reverse-engineer or paraphrase the book content.
 * Doing so would (a) be a copyright issue, (b) be intellectually
 * dishonest, and (c) produce inferior mappings to what the author
 * himself can provide.
 *
 * The adapter is built so the moment Bandar supplies verified pillar
 * text — via JSON, email, or co-authored PR — we publish a versioned
 * update under joint credit. See docs/strategy/BANDAR_FRAMEWORK_ADAPTER.md.
 */

import type { IndustryFramework } from "./types.js";

const AUTHOR = {
  name: "Bandar Naghi",
  affiliation:
    "Founder, Disruptive.Innovation · VP, Head of Digital, AI & Cloud Transformation, Mphasis · Top 50 CxO Middle East 2023",
  url: "https://bandarnaghi.com",
} as const;

const LAST_REVIEWED = "2026-06-10";

const PENDING_NOTE =
  "[AWAITING_AUTHOR_VERIFICATION] — outer structure verified from bandarnaghi.com; specific text published with author input.";

// =============================================================================
// QAG — Quantitative AI Governance · 5-Pillar Framework
// =============================================================================

export const QAG_FRAMEWORK: IndustryFramework = {
  id: "bn-qag",
  name: "QAG",
  long_title: "Quantitative AI Governance",
  tagline:
    "The 5-Pillar Framework to Scale AI with Unbreakable Trust — Fortune 100 companies",
  author: AUTHOR,
  publication: {
    type: "book",
    title: "AI Governance",
    asin: "B0FQ5Y6KVY",
    url: "https://www.amazon.com/dp/B0FQ5Y6KVY",
    year: 2025,
  },
  structure_verification: "verified",
  structure_source:
    "https://bandarnaghi.com (homepage AI Governance section: 'The 5-Pillar Framework to Scale AI with Unbreakable Trust · Quantitative AI Governance (QAG) framework for Fortune 100 companies')",
  composes_with: [
    "Project Ledger Records Plane",
    "Project Ledger Evidence Engine",
    "Project Ledger Decision Plane",
  ],
  components: [
    {
      id: "QAG-P1",
      title: "Pillar 1",
      kind: "pillar",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: ["decision.applied_policies", "event.context.user_id"],
      source_citation:
        "Bandar Naghi · QAG · Pillar 1 · Amazon Kindle B0FQ5Y6KVY (2025)",
    },
    {
      id: "QAG-P2",
      title: "Pillar 2",
      kind: "pillar",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: [
        "event.payload.metadata.safety",
        "event.payload.metadata.injection",
      ],
      source_citation:
        "Bandar Naghi · QAG · Pillar 2 · Amazon Kindle B0FQ5Y6KVY (2025)",
    },
    {
      id: "QAG-P3",
      title: "Pillar 3",
      kind: "pillar",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: ["decision.policy_bundle_hash", "decision.reason_codes"],
      source_citation:
        "Bandar Naghi · QAG · Pillar 3 · Amazon Kindle B0FQ5Y6KVY (2025)",
    },
    {
      id: "QAG-P4",
      title: "Pillar 4",
      kind: "pillar",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: [
        "event.payload.input_token_count",
        "event.payload.output_token_count",
        "event.payload.metadata.latency_ms",
      ],
      source_citation:
        "Bandar Naghi · QAG · Pillar 4 · Amazon Kindle B0FQ5Y6KVY (2025)",
    },
    {
      id: "QAG-P5",
      title: "Pillar 5",
      kind: "pillar",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: ["use_case_id", "event.context.service_id"],
      source_citation:
        "Bandar Naghi · QAG · Pillar 5 · Amazon Kindle B0FQ5Y6KVY (2025)",
    },
  ],
  last_reviewed_at: LAST_REVIEWED,
};

// =============================================================================
// QAIS — Quantitative AI Security · 3-Tower Framework
// =============================================================================

export const QAIS_FRAMEWORK: IndustryFramework = {
  id: "bn-qais",
  name: "QAIS",
  long_title: "Quantitative AI Security",
  tagline:
    "Three Towers to Protect the Castle — Breach-Proof AI · from $50B+ infrastructure experience",
  author: AUTHOR,
  publication: {
    type: "book",
    title: "AI Security",
    asin: "B0FR3766G9",
    url: "https://www.amazon.com/dp/B0FR3766G9",
    year: 2025,
  },
  structure_verification: "verified",
  structure_source:
    "https://bandarnaghi.com (homepage AI Security section: 'Three Towers to Protect the Castle - Breach-Proof AI · Quantitative AI Security (QAIS) Framework')",
  composes_with: [
    "Project Ledger Decision Plane",
    "Project Ledger Telemetry Ingest",
    "Project Ledger Records Plane",
  ],
  components: [
    {
      id: "QAIS-T1",
      title: "Tower 1",
      kind: "tower",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: [
        "event.context.user_id",
        "event.context.service_id",
        "decision.applied_policies",
      ],
      source_citation:
        "Bandar Naghi · QAIS · Tower 1 · Amazon Kindle B0FR3766G9 (2025)",
    },
    {
      id: "QAIS-T2",
      title: "Tower 2",
      kind: "tower",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: [
        "event.payload.input_classification",
        "event.payload.input_hash",
        "event.payload.metadata.safety",
        "model_id",
      ],
      source_citation:
        "Bandar Naghi · QAIS · Tower 2 · Amazon Kindle B0FR3766G9 (2025)",
    },
    {
      id: "QAIS-T3",
      title: "Tower 3",
      kind: "tower",
      verification: "awaiting",
      description: PENDING_NOTE,
      satisfied_by_fields: [
        "event.payload.metadata.safety",
        "event.payload.metadata.injection",
        "integrity.receipt_hash",
        "timestamps",
      ],
      source_citation:
        "Bandar Naghi · QAIS · Tower 3 · Amazon Kindle B0FR3766G9 (2025)",
    },
  ],
  last_reviewed_at: LAST_REVIEWED,
};

// =============================================================================
// AI Agency · 7-Pillar Framework
// =============================================================================

export const AI_AGENCY_FRAMEWORK: IndustryFramework = {
  id: "bn-ai-agency",
  name: "AI Agency",
  long_title: "AI Agency",
  tagline:
    "The 7-Pillar Framework for Exponential Experience — Blueprint for deploying AI agents achieving 10x productivity",
  author: AUTHOR,
  publication: {
    type: "book",
    title: "AI Agency",
    asin: "B0FRF3B5P7",
    url: "https://www.amazon.com/dp/B0FRF3B5P7",
    year: 2025,
  },
  structure_verification: "verified",
  structure_source:
    "https://bandarnaghi.com (homepage AI Agency section: 'The 7-Pillar Framework for Exponential Experience · Blueprint for deploying AI agents achieving 10x productivity')",
  composes_with: [
    "Project Ledger Telemetry Ingest",
    "Project Ledger Records Plane",
    "Project Ledger Console",
  ],
  components: Array.from({ length: 7 }, (_, i) => ({
    id: `AGENCY-P${i + 1}`,
    title: `Pillar ${i + 1}`,
    kind: "pillar" as const,
    verification: "awaiting" as const,
    description: PENDING_NOTE,
    satisfied_by_fields: ["event.subject.ai_capability", "event.payload.metadata.tool_name"],
    source_citation:
      `Bandar Naghi · AI Agency · Pillar ${i + 1} · Amazon Kindle B0FRF3B5P7 (2025)`,
  })),
  last_reviewed_at: LAST_REVIEWED,
};

// =============================================================================
// Executive Philosophy — the 6 published priorities (homepage verified)
// =============================================================================

/**
 * Six executive priorities Bandar publishes on bandarnaghi.com under
 * "Executive Philosophy". Receipts produced under Project Ledger
 * contribute measurable evidence to each priority.
 *
 * VERIFIED directly from the homepage as of 2026-06-10.
 */
export const EXECUTIVE_PHILOSOPHY = [
  {
    id: "EXEC-1",
    title: "Shareholder Value",
    description:
      "Deliver top quartile Total Shareholder Return (TSR) through disciplined capital allocation and 15%+ growth.",
    contribution_from_receipts:
      "Receipts provide the cryptographic audit trail that satisfies regulator-grade disclosure requirements, lowering the compliance discount applied by analysts.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
  {
    id: "EXEC-2",
    title: "Market Leadership",
    description: "Establish and maintain #1 or #2 position through strategic differentiation.",
    contribution_from_receipts:
      "Cryptographic AI evidence is a board-grade differentiator vs competitors who can only self-attest.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
  {
    id: "EXEC-3",
    title: "Talent & Culture",
    description: "Build cultures where engagement exceeds 85% and innovation flourishes.",
    contribution_from_receipts:
      "Receipts protect the developer from being blamed for AI errors — the chain proves which model produced which output.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
  {
    id: "EXEC-4",
    title: "Customer Excellence",
    description: "Achieve NPS >70 and customer retention >95% through innovation.",
    contribution_from_receipts:
      "Independently verifiable evidence of AI fairness builds the customer trust that underpins NPS.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
  {
    id: "EXEC-5",
    title: "Operational Excellence",
    description: "Drive industry-leading margins through AI-enabled operations.",
    contribution_from_receipts:
      "Receipts capture token economics per use case, enabling the AI cost discipline that protects margin.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
  {
    id: "EXEC-6",
    title: "Sustainable Growth",
    description: "Balance aggressive growth with ESG leadership for long-term value.",
    contribution_from_receipts:
      "ESG/AI auditability is increasingly bundled into ESG ratings — receipts make this measurable.",
    source: "bandarnaghi.com homepage · 'Executive Philosophy' section (verified 2026-06-10)",
  },
] as const;

// =============================================================================
// Bundle
// =============================================================================

export const BANDAR_FRAMEWORKS: IndustryFramework[] = [
  QAG_FRAMEWORK,
  QAIS_FRAMEWORK,
  AI_AGENCY_FRAMEWORK,
];

/**
 * Replace pending pillar text with author-verified content.
 *
 * Call this when an author supplies a JSON contribution. The contribution
 * MUST include the author's signature so the audit trail records who
 * verified the text and when.
 *
 * Returns the count of components updated.
 */
export interface AuthorContribution {
  framework_id: string;
  /** Map component id → verified content. */
  components: Record<
    string,
    { title?: string; description?: string; satisfied_by_fields?: string[] }
  >;
  /** Author's published name + verification timestamp. */
  attribution: { author: string; verified_at: string; signature_kid?: string };
}

export function applyAuthorContribution(
  framework: IndustryFramework,
  contribution: AuthorContribution
): { framework: IndustryFramework; updated: number } {
  if (framework.id !== contribution.framework_id) {
    throw new Error(
      `Contribution targets ${contribution.framework_id} but framework is ${framework.id}`
    );
  }
  let updated = 0;
  const components = framework.components.map((c) => {
    const verified = contribution.components[c.id];
    if (!verified) return c;
    updated += 1;
    return {
      ...c,
      title: verified.title ?? c.title,
      description: verified.description ?? c.description,
      satisfied_by_fields: verified.satisfied_by_fields ?? c.satisfied_by_fields,
      verification: "verified" as const,
      source_citation: `${c.source_citation} · verified by ${contribution.attribution.author} on ${contribution.attribution.verified_at}`,
    };
  });
  return {
    framework: { ...framework, components, last_reviewed_at: contribution.attribution.verified_at },
    updated,
  };
}
