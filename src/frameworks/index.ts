/**
 * Industry framework adapter — composable thought-leadership frameworks.
 *
 * Distinct from regulatory policy templates (CBUAE / EU AI Act / etc.):
 * industry frameworks are voluntary publications by named authors that
 * customers adopt to structure their AI program.
 *
 * Project Ledger ships verified outer structures. Specific pillar text
 * is loaded from author-supplied JSON or marked [AWAITING_AUTHOR_VERIFICATION]
 * — we never reverse-engineer copyrighted book content.
 */

export type {
  IndustryFramework,
  FrameworkComponent,
  FrameworkAuthor,
  AuthorVerificationState,
} from "./types.js";

export {
  QAG_FRAMEWORK,
  QAIS_FRAMEWORK,
  AI_AGENCY_FRAMEWORK,
  BANDAR_FRAMEWORKS,
  EXECUTIVE_PHILOSOPHY,
  applyAuthorContribution,
  type AuthorContribution,
} from "./bandar-naghi.js";

import type { IndustryFramework } from "./types.js";
import { BANDAR_FRAMEWORKS } from "./bandar-naghi.js";

/** All bundled industry frameworks. */
export const ALL_INDUSTRY_FRAMEWORKS: IndustryFramework[] = [...BANDAR_FRAMEWORKS];

/**
 * Walk a receipt and return the industry-framework components it
 * contributes evidence toward. Returns one entry per component the
 * receipt fields signal alignment with.
 */
export function frameworkAlignment(
  signed: { receipt: Record<string, unknown> },
  frameworks: IndustryFramework[] = ALL_INDUSTRY_FRAMEWORKS
): { framework_id: string; component_id: string; confidence: number }[] {
  const out: { framework_id: string; component_id: string; confidence: number }[] = [];
  for (const fw of frameworks) {
    for (const c of fw.components) {
      if (!c.satisfied_by_fields?.length) continue;
      const present = c.satisfied_by_fields.filter(
        (p) => getByPath(signed.receipt, p) !== undefined
      );
      if (present.length === 0) continue;
      out.push({
        framework_id: fw.id,
        component_id: c.id,
        confidence: Number((present.length / c.satisfied_by_fields.length).toFixed(2)),
      });
    }
  }
  return out;
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
