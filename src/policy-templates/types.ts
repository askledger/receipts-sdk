/**
 * Policy template types — Credo AI-style pre-built regulatory mappings.
 *
 * Every template maps a regulator's published controls to the specific
 * receipt fields that satisfy them. When a receipt is signed under a
 * template, the SDK can cite which articles / controls the receipt
 * helps satisfy — directly in the receipt's metadata.regulatory_citations.
 *
 * Templates are themselves content-addressed: a SHA-256 of the canonical
 * JSON form is the template's stable id. Customers can verify they are
 * running the template version the regulator endorsed.
 */

export type Regulator =
  | "CBUAE"      // UAE — Central Bank of UAE Responsible AI
  | "EU_AI_ACT"  // EU — Regulation 2024/1689
  | "SAMA"       // Saudi Arabia — SAMA AI guidance
  | "NIST_RMF"   // US — NIST AI Risk Management Framework
  | "ISO_42001"  // International — ISO/IEC 42001
  | "SR_26_2"    // US — Federal Reserve SR 26-2 (model risk for AI)
  | "PRA_SS1_23" // UK — Prudential Regulation Authority SS1/23
  | "RBI_FREE_AI"; // India — RBI Framework for Responsible & Ethical AI

export type ControlPillar =
  | "governance"
  | "accountability"
  | "fairness"
  | "transparency"
  | "explainability"
  | "human_oversight"
  | "data_management"
  | "model_risk"
  | "performance_monitoring"
  | "security"
  | "robustness"
  | "supply_chain"
  | "incident_response"
  | "third_party_risk";

export interface ControlArticle {
  /** Stable identifier — regulator's own article numbering. */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** What the article requires, paraphrased in plain English. */
  requirement: string;
  /** Pillar this article belongs to. */
  pillar: ControlPillar;
  /** Receipt fields that, when present, contribute to satisfying this article. */
  satisfied_by_fields: string[];
  /** Risk severity if the article is violated (regulator-defined where stated). */
  severity?: "low" | "medium" | "high" | "critical";
  /** Citation back to source document. */
  source_citation: string;
}

export interface PolicyTemplate {
  regulator: Regulator;
  /** Human-readable name. */
  name: string;
  /** Version of the regulator document this template tracks. */
  version: string;
  /** RFC 3339 publication date of the regulator document. */
  published_at: string;
  /** Compliance deadline if there is a hard one. */
  effective_deadline?: string;
  /** Short summary of the framework. */
  summary: string;
  /** The ordered list of controls. */
  articles: ControlArticle[];
  /** Pre-built reason codes the OPA bundle uses when a receipt satisfies this. */
  reason_code_prefix: string;
}

export interface Citation {
  template_id: string;       // content hash of the template
  regulator: Regulator;
  article_id: string;
  /** Confidence this receipt actually satisfies the article. */
  confidence: number;
}
