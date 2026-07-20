/**
 * Layer 4, Rule-Based Correctness / Assurance.
 *
 * Two pieces:
 *  1. `assuranceLevel()` classifies a receipt L0 to L3 by what it actually
 *     carries, so "assurance level" is computed from evidence, not asserted.
 *  2. `checkRules()` is a deterministic, bounded rule evaluator: it checks a
 *     decision's values against the policy_context's rules and produces a
 *     VerificationBlock ready to sign into the receipt. It is a rule-check, and
 *     it is labelled as one (verification_type = "rule_based"); it is never
 *     dressed up as a mathematical proof.
 *
 * Assurance ladder:
 *   L0 Recorded        , a receipt exists (may be unsigned / imported).
 *   L1 Signed & chained, Ed25519 signature + hash-chain integrity (tamper-evident).
 *   L2 Governed & timed, L1 + the policy that applied is recorded + a timestamp.
 *   L3 Verified        , L2 + rules checked and passed, or an external proof bound.
 */

import type { SignedReceipt, PolicyContext, VerificationBlock } from "./types.js";
import { verifyReceipt } from "./verify.js";

export type AssuranceLevel = "L0" | "L1" | "L2" | "L3";

export type AssuranceName = "Declared" | "Signed" | "Attested" | "Anchored";

export interface AssuranceAssessment {
  level: AssuranceLevel;
  name: AssuranceName;
  reasons: string[];
  criteria: {
    signed: boolean; // >=1 signature over a chained record (L1)
    attested: boolean; // signer bound to an attested HSM/KMS/workload key (L2)
    anchored: boolean; // external timestamp or transparency-log anchor (L3)
  };
}

const LEVEL_NAME: Record<AssuranceLevel, AssuranceName> = {
  L0: "Declared",
  L1: "Signed",
  L2: "Attested",
  L3: "Anchored",
};

/**
 * Classify a receipt on the published assurance ladder (matches
 * /trust/assurance-levels): L0 Declared, L1 Signed, L2 Attested, L3 Anchored.
 * The ladder is cumulative. "Attested" (L2) depends on the signing key being
 * hardware/workload-backed, which the receipt cannot self-report, so the caller
 * declares which kids are attested via `opts.attestedKids` (they know their own
 * key management). Without it the ceiling is L1.
 */
export function assuranceLevel(
  signed: SignedReceipt,
  opts: { attestedKids?: string[]; publicKeys?: Record<string, string>; verifiedAnchor?: boolean } = {}
): AssuranceAssessment {
  const r = signed.receipt;
  const sigs = Array.isArray(signed.signatures) ? signed.signatures : [];
  const chained = !!r?.integrity?.receipt_hash && typeof r?.integrity?.chain_height === "number";

  const reasons: string[] = [];

  // L1 requires a signature that VERIFIES, not merely a signatures array with
  // something in it. This used to be `sigs.length > 0 && chained`, so an
  // all-zero signature over a tampered body, or a kid nobody has ever heard of,
  // was reported as "a known signer signed the chained record". The ladder was
  // describing field presence, not evidence.
  let isSigned = false;
  if (sigs.length > 0 && chained) {
    if (opts.publicKeys) {
      isSigned = verifyReceipt(signed, { publicKeys: opts.publicKeys }).valid;
      if (!isSigned) reasons.push("signature did not verify against the supplied keys");
    } else {
      reasons.push("signatures were NOT checked: pass publicKeys to establish L1 or above");
    }
  }

  const attestedSet = new Set(opts.attestedKids ?? []);
  const attested = isSigned && sigs.some((s) => attestedSet.has(s.kid));

  // L3 requires an anchor that was actually verified. It used to be
  // `timestamps.length > 0`, and `timestamps` sits OUTSIDE the signed bytes, so
  // appending a few bytes of base64 to an untouched receipt promoted L2 to L3
  // with no key access and no re-signing. The SDK cannot check an RFC 3161 TSA
  // signature itself, and a "local" token carries no authority signature at
  // all, so the caller must confirm an anchor was independently verified.
  const hasAnchor = Array.isArray(signed.timestamps) && signed.timestamps.length > 0;
  const anchored = hasAnchor && opts.verifiedAnchor === true;
  if (hasAnchor && !anchored) {
    reasons.push(
      "a timestamp is attached but was not independently verified; verify the TSA signature (or transparency-log inclusion) and pass verifiedAnchor"
    );
  }

  let level: AssuranceLevel = "L0";

  if (!isSigned) {
    reasons.push("L0 Declared: no verified signature over a chained record");
  } else {
    level = "L1";
    reasons.push("L1 Signed: a known signer signed the chained record");
    if (attested) {
      level = "L2";
      reasons.push("L2 Attested: signer bound to an attested (HSM/KMS) key");
      if (anchored) {
        level = "L3";
        reasons.push("L3 Anchored: externally timestamped or logged");
      } else {
        reasons.push("no external anchor / timestamp (needed for L3)");
      }
    } else {
      reasons.push("signer not declared attested (needed for L2); pass attestedKids for HSM/KMS keys");
    }
  }

  return { level, name: LEVEL_NAME[level], reasons, criteria: { signed: isSigned, attested, anchored } };
}

// ---------- deterministic rule evaluator ----------

type Scalar = number | string | boolean;

export interface RuleEvaluation {
  rule_id: string;
  expression: string;
  passed: boolean;
  reason?: string;
}

export interface RuleCheckResult {
  status: "verified" | "failed";
  failed_rules: string[];
  evaluations: RuleEvaluation[];
  /** Ready to pass into `signReceipt({ verification })`. */
  verification: VerificationBlock;
}

const NUM_OPS: Record<string, (a: number, b: number) => boolean> = {
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
};

// "field OP literal", e.g. "credit_score >= 650" or "region == \"EU\"".
const RULE_RE = /^\s*([A-Za-z_][\w.]*)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$/;

function evalExpr(expr: string, values: Record<string, Scalar>): { passed: boolean; reason?: string } {
  const m = RULE_RE.exec(expr);
  if (!m) return { passed: false, reason: "could not parse rule" };
  const [, field, op, rawRhs] = m;
  if (!(field in values)) return { passed: false, reason: `missing value for "${field}"` };
  const lhs = values[field];
  const rhsStr = rawRhs.replace(/^["']|["']$/g, ""); // strip quotes
  const rhsNum = Number(rawRhs);

  // numeric comparison when both sides are numbers
  if (typeof lhs === "number" && Number.isFinite(rhsNum) && /^[><=!]/.test(op[0])) {
    return { passed: NUM_OPS[op](lhs, rhsNum) };
  }
  // equality on strings/booleans
  if (op === "==" || op === "!=") {
    const eq = String(lhs) === rhsStr;
    return { passed: op === "==" ? eq : !eq };
  }
  return { passed: false, reason: `operator ${op} not valid for non-numeric "${field}"` };
}

/**
 * Evaluate a policy's rules against a decision's recorded values. Deterministic
 * and bounded: no code execution, only comparisons on the supplied values.
 * Returns a VerificationBlock you sign into the receipt (Layer 4 evidence).
 */
export function checkRules(
  policy: PolicyContext,
  values: Record<string, Scalar>,
  opts: { verifierVersion?: string } = {}
): RuleCheckResult {
  const rules = policy.applied_rules ?? [];
  const evaluations: RuleEvaluation[] = rules.map((rule) => {
    const expression = rule.mathematical_form ?? rule.expression ?? "";
    const { passed, reason } = expression ? evalExpr(expression, values) : { passed: false, reason: "empty rule" };
    return { rule_id: rule.rule_id, expression, passed, reason };
  });

  const failed = evaluations.filter((e) => !e.passed);
  const status: "verified" | "failed" = failed.length === 0 && evaluations.length > 0 ? "verified" : "failed";

  const verification: VerificationBlock = {
    enabled: true,
    verification_type: "rule_based",
    status,
    failed_rules: failed.map((e) => e.rule_id),
    verifier_version: opts.verifierVersion ?? "askledger-rulecheck-1",
  };

  return { status, failed_rules: verification.failed_rules ?? [], evaluations, verification };
}
