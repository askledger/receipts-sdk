/**
 * Policy template library, pre-built regulatory framework mappings.
 *
 * Five templates ship today: CBUAE, EU AI Act, SAMA, ISO 42001, NIST RMF.
 * More are added in subsequent releases (SR 26-2, PRA SS1/23, RBI FREE-AI).
 *
 * Usage:
 *
 *   import { CBUAE_RESPONSIBLE_AI, EU_AI_ACT, citeReceipt } from
 *     "@askledger/receipts-sdk/policy-templates";
 *
 *   const citations = citeReceipt(signedReceipt, [
 *     CBUAE_RESPONSIBLE_AI,
 *     EU_AI_ACT,
 *   ]);
 *   // Returns the article ids the receipt helps satisfy.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type { SignedReceipt } from "../types.js";
import { canonicalSigningPayload } from "../receipt.js";
import type { PolicyTemplate, Citation, ControlArticle, Regulator } from "./types.js";

export {
  type Regulator,
  type ControlPillar,
  type ControlArticle,
  type PolicyTemplate,
  type Citation,
} from "./types.js";

export { CBUAE_RESPONSIBLE_AI } from "./cbuae.js";
export { EU_AI_ACT } from "./eu-ai-act.js";
export { SAMA_AI_GUIDANCE } from "./sama.js";
export { ISO_42001 } from "./iso-42001.js";
export { NIST_AI_RMF } from "./nist-ai-rmf.js";
export { HIPAA_SECURITY_RULE } from "./hipaa.js";
export { FEDRAMP_NIST_AI } from "./fedramp.js";
export { ISO_27001_AI } from "./iso-27001.js";
export { GDPR_AI } from "./gdpr.js";

import { CBUAE_RESPONSIBLE_AI } from "./cbuae.js";
import { EU_AI_ACT } from "./eu-ai-act.js";
import { SAMA_AI_GUIDANCE } from "./sama.js";
import { ISO_42001 } from "./iso-42001.js";
import { NIST_AI_RMF } from "./nist-ai-rmf.js";
import { HIPAA_SECURITY_RULE } from "./hipaa.js";
import { FEDRAMP_NIST_AI } from "./fedramp.js";
import { ISO_27001_AI } from "./iso-27001.js";
import { GDPR_AI } from "./gdpr.js";

/** All bundled templates. */
export const TEMPLATES: PolicyTemplate[] = [
  // BFSI / Finance
  CBUAE_RESPONSIBLE_AI,
  EU_AI_ACT,
  SAMA_AI_GUIDANCE,
  // Universal info security
  ISO_42001,
  ISO_27001_AI,
  NIST_AI_RMF,
  // Healthcare
  HIPAA_SECURITY_RULE,
  // US federal / government
  FEDRAMP_NIST_AI,
  // Cross-industry privacy
  GDPR_AI,
];

export function templateId(template: PolicyTemplate): string {
  const canon = JSON.stringify(template);  // canonicalize is not strictly needed; template is internal
  return Buffer.from(sha256Fn(new TextEncoder().encode(canon))).toString("hex");
}

/**
 * Walk a receipt and return the article citations it satisfies.
 *
 * An article is "satisfied" when at least one of its required fields is
 * present in the receipt. Confidence is proportional to the fraction
 * of required fields that are populated.
 */
export function citeReceipt(
  signed: SignedReceipt,
  templates: PolicyTemplate[]
): Citation[] {
  const citations: Citation[] = [];
  for (const template of templates) {
    const tid = templateId(template);
    for (const art of template.articles) {
      // Resolve each required field against the receipt body AND the outer
      // envelope, so evidence that lives on the SignedReceipt (e.g. timestamps)
      // is credited instead of always reading as absent.
      const rec = signed.receipt as unknown as Record<string, unknown>;
      const env = signed as unknown as Record<string, unknown>;
      const present = art.satisfied_by_fields.filter(
        (path) => getByPath(rec, path) !== undefined || getByPath(env, path) !== undefined
      );
      if (present.length === 0) continue;
      const confidence = Number((present.length / art.satisfied_by_fields.length).toFixed(2));
      citations.push({
        template_id: tid,
        regulator: template.regulator,
        article_id: art.id,
        confidence,
      });
    }
  }
  return citations;
}

/**
 * Convenience: cite against every bundled template.
 */
export function citeAgainstAll(signed: SignedReceipt): Citation[] {
  return citeReceipt(signed, TEMPLATES);
}

/**
 * Build a compact regulator-pillar map for a receipt, for the demo UI.
 */
export function summarizeCoverage(citations: Citation[]): Record<Regulator, number> {
  const out = {} as Record<Regulator, number>;
  for (const c of citations) {
    out[c.regulator] = (out[c.regulator] ?? 0) + 1;
  }
  return out;
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Pretty-print a citation for the demo UI.
 */
export function formatCitation(c: Citation, templates: PolicyTemplate[]): string {
  const template = templates.find((t) => templateId(t) === c.template_id);
  const article = template?.articles.find((a) => a.id === c.article_id);
  return article ? `${c.regulator} ${c.article_id} · ${article.title}` : `${c.regulator} ${c.article_id}`;
}
