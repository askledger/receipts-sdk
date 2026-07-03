/**
 * Industry framework adapter types.
 *
 * Distinct from policy templates (regulatory): industry frameworks are
 * thought-leadership publications by named authors that customers adopt
 * voluntarily to structure their AI governance/security/agency programs.
 *
 * The adapter ships the verified outer structure of each framework as
 * published by its author. Specific pillar/tower/principle text is
 * loaded from author-supplied JSON — we never reverse-engineer or
 * paraphrase copyrighted book content.
 *
 * Author verification states:
 *   - "verified" — pillar text supplied by the author or directly
 *                  quoted from their publicly published material
 *   - "awaiting" — outer structure published; specific text awaiting
 *                  author input. We will publish in a versioned update.
 *   - "inferred" — structure inferred from public signal; explicitly
 *                  tagged as such so consumers know the source.
 */

export type AuthorVerificationState = "verified" | "awaiting" | "inferred";

export interface FrameworkAuthor {
  name: string;
  /** Public role or affiliation when cited. */
  affiliation?: string;
  /** Author's official site, if any. */
  url?: string;
  /** ORCID, LinkedIn, or other professional identifier. */
  identifier?: string;
}

export interface FrameworkComponent {
  /** Stable identifier within the framework — e.g. "QAG-P1" */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** Verification state of THIS specific component's content. */
  verification: AuthorVerificationState;
  /** Author's published description, when verified. */
  description?: string;
  /** Receipt fields that, when present, signal alignment with this component. */
  satisfied_by_fields?: string[];
  /** Source citation — book chapter, article, panel, etc. */
  source_citation: string;
  /** Whether this component is a structural pillar/tower/principle. */
  kind: "pillar" | "tower" | "principle" | "stage";
}

export interface IndustryFramework {
  /** Stable framework identifier. */
  id: string;
  /** Human-readable name (e.g. "QAG"). */
  name: string;
  /** Long-form title (e.g. "Quantitative AI Governance"). */
  long_title: string;
  /** One-sentence tagline as published. */
  tagline: string;
  /** Author information. */
  author: FrameworkAuthor;
  /** Where the framework was published. */
  publication: {
    type: "book" | "paper" | "site" | "talk";
    title?: string;
    asin?: string;
    isbn?: string;
    url?: string;
    year?: number;
  };
  /** Verification state of the framework's OUTER structure
   *  (the count and naming of its components — not the per-component text). */
  structure_verification: AuthorVerificationState;
  /** Verification source for the outer structure. */
  structure_source: string;
  /** Components in published order. */
  components: FrameworkComponent[];
  /** What kind of demand this framework is on the supply side. */
  composes_with: ("AskLedger Records Plane" | "AskLedger Decision Plane" | "AskLedger Telemetry Ingest" | "AskLedger Evidence Engine" | "AskLedger Console")[];
  /** When this framework was last reviewed for accuracy. */
  last_reviewed_at: string;
}
