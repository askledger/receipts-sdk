/**
 * Layer 4, Pre-Execution Guardian / Verdict.
 *
 * Layers 1 to 3 PROVE what happened, how, and why, after the fact. This layer
 * PREVENTS: before an irreversible action runs, an independent reviewer issues a
 * verdict (approve / concerns / reject), and that verdict is signed and
 * cryptographically BOUND to the exact action it judged. The action proceeds
 * only if it clears, and the pre-verdict is itself a first-class, auditable
 * artifact that plugs into a receipt as evidence (linking Layer 4 back to Layer 1).
 *
 * The SDK does NOT decide the verdict. A reviewer (a policy engine, a separate
 * model, or a human) does. The SDK binds, signs, verifies, and gates, and
 * enforces that the reviewer is independent of the actor proposing the action.
 * So even the guardian is accountable, not a black box: its verdict can be
 * verified by anyone with the public key.
 */

import { canonicalizeBytes } from "./canonicalize.js";
import { sha256, sign, verify as verifySig } from "./crypto.js";
import type { KeyPair, EvidenceRef } from "./types.js";

export type Verdict = "approve" | "concerns" | "reject";

/** The exact action a reviewer judges, before it runs. */
export interface ProposedAction {
  tenant_id: string;
  action_type: string; // "wire.transfer" | "email.send" | "db.delete" | ...
  payload: unknown; // the exact parameters that define the action
  actor?: string; // the agent or user proposing the action
}

export interface ReviewDecision {
  verdict: Verdict;
  reviewer: string; // who/what reviewed, must be independent of action.actor
  reasons?: string[];
}

export interface PreVerdict {
  schema_version: "1.0";
  kind: "askledger.preverdict";
  tenant_id: string;
  action_type: string;
  action_hash: string; // sha256 of the canonical action, binds this verdict to THIS action
  verdict: Verdict;
  reviewer: string;
  independent_of: string | null; // the actor the reviewer is independent of
  reasons: string[];
  reviewed_at: string; // RFC 3339
  expires_at: string | null; // RFC 3339; null = no expiry. Bound into the signature.
}

export interface SignedPreVerdict {
  pre_verdict: PreVerdict;
  hash: string; // sha256 of canonical(pre_verdict)
  signature: { alg: "EdDSA"; kid: string; sig: string };
}

/** Canonical SHA-256 hash of the exact action being judged. */
export function actionHash(action: ProposedAction): string {
  return sha256(
    canonicalizeBytes({
      tenant_id: action.tenant_id,
      action_type: action.action_type,
      payload: action.payload,
    })
  );
}

/**
 * Produce a signed pre-execution verdict bound to `action`. `reviewedAt` is
 * passed in so the function stays pure and testable. Throws if the reviewer is
 * the same actor proposing the action (a verdict must be independent).
 */
export function signPreVerdict(
  action: ProposedAction,
  review: ReviewDecision,
  opts: { keypair: KeyPair; reviewedAt: string; expiresAt?: string }
): SignedPreVerdict {
  if (action.actor && review.reviewer === action.actor) {
    throw new Error(
      `reviewer "${review.reviewer}" is the actor proposing the action; a pre-execution verdict must be independent`
    );
  }
  const pre_verdict: PreVerdict = {
    schema_version: "1.0",
    kind: "askledger.preverdict",
    tenant_id: action.tenant_id,
    action_type: action.action_type,
    action_hash: actionHash(action),
    verdict: review.verdict,
    reviewer: review.reviewer,
    independent_of: action.actor ?? null,
    reasons: review.reasons ?? [],
    reviewed_at: opts.reviewedAt,
    expires_at: opts.expiresAt ?? null,
  };
  const hash = sha256(canonicalizeBytes(pre_verdict));
  const sig = sign(canonicalizeBytes(pre_verdict), opts.keypair);
  return { pre_verdict, hash, signature: { alg: "EdDSA", kid: opts.keypair.kid, sig } };
}

export interface PreVerdictVerification {
  valid: boolean;
  verdict: Verdict | null;
  checks: {
    signature_valid: boolean;
    hash_matches: boolean;
    binds_to_action: boolean; // the verdict's action_hash matches the action supplied
    not_expired: boolean;
  };
  errors: string[];
}

/**
 * Verify a signed pre-verdict AND that it binds to `action`. `binds_to_action`
 * is false if the verdict was issued for a different action (approve A, run B),
 * which is the core attack this layer closes.
 */
export function verifyPreVerdict(
  signed: SignedPreVerdict,
  action: ProposedAction,
  opts: { publicKeys: Record<string, string>; now?: string }
): PreVerdictVerification {
  const errors: string[] = [];
  const pv = signed.pre_verdict;

  const hash_matches = sha256(canonicalizeBytes(pv)) === signed.hash;
  if (!hash_matches) errors.push("pre-verdict hash does not match its contents");

  let signature_valid = false;
  if (signed.signature.alg !== "EdDSA") {
    errors.push(`unsupported signature alg ${signed.signature.alg} (only EdDSA)`);
  } else {
    const pub = opts.publicKeys[signed.signature.kid];
    if (!pub) {
      errors.push(`no public key supplied for kid ${signed.signature.kid}`);
    } else {
      signature_valid = verifySig(canonicalizeBytes(pv), signed.signature.sig, pub);
      if (!signature_valid) errors.push("pre-verdict signature invalid");
    }
  }

  const binds_to_action = pv.action_hash === actionHash(action);
  if (!binds_to_action) {
    errors.push("pre-verdict does not bind to this action (action_hash mismatch)");
  }

  const now = opts.now ?? new Date().toISOString();
  const not_expired = pv.expires_at === null || now <= pv.expires_at;
  if (!not_expired) errors.push(`pre-verdict expired at ${pv.expires_at}`);

  const valid = hash_matches && signature_valid && binds_to_action && not_expired;
  return {
    valid,
    verdict: valid ? pv.verdict : null,
    checks: { signature_valid, hash_matches, binds_to_action, not_expired },
    errors,
  };
}

/**
 * Gate an irreversible action: throw unless it is cleared to run. Verifies the
 * signed verdict binds to `action`, is validly signed, and permits execution.
 * "approve" always passes; "concerns" passes only when `allowConcerns` is set;
 * "reject", or an invalid/mismatched verdict, always blocks.
 */
export function assertActionCleared(
  signed: SignedPreVerdict,
  action: ProposedAction,
  opts: { publicKeys: Record<string, string>; allowConcerns?: boolean; now?: string }
): void {
  const v = verifyPreVerdict(signed, action, { publicKeys: opts.publicKeys, now: opts.now });
  if (!v.valid) {
    throw new Error(`action blocked: pre-verdict did not verify (${v.errors.join("; ")})`);
  }
  if (v.verdict === "approve") return;
  if (v.verdict === "concerns" && opts.allowConcerns) return;
  throw new Error(`action blocked: pre-verdict is "${v.verdict}"`);
}

/**
 * Turn a signed pre-verdict into an EvidenceRef so the action's receipt
 * (Layer 1) can carry a signed reference to its own pre-approval. This links
 * Layer 4 to Layer 1: the permanent record shows the action was cleared before
 * it ran, by whom, and with what verdict.
 */
export function preVerdictEvidenceRef(signed: SignedPreVerdict): EvidenceRef {
  return {
    kind: "pre_execution_verdict",
    hash: signed.hash,
    alg: "sha256",
    status: signed.pre_verdict.verdict,
    proof_type: "guardian_verdict",
  };
}

export interface MultiReviewResult {
  cleared: boolean;
  approvals: number; // distinct approving reviewers
  rejects: number;
  reviewers: string[]; // the distinct reviewers who approved
  threshold: number;
  errors: string[];
}

/**
 * N-of-M multi-reviewer gate for high-risk actions. Every verdict must bind to
 * the SAME action and verify (signature, hash, not expired). Clears only when at
 * least `threshold` DISTINCT reviewers approve AND no reviewer rejects (a reject
 * is a hard veto). The same reviewer cannot count twice toward the threshold.
 */
export function reviewNofM(
  action: ProposedAction,
  verdicts: SignedPreVerdict[],
  opts: { publicKeys: Record<string, string>; threshold: number; now?: string; allowConcerns?: boolean }
): MultiReviewResult {
  const errors: string[] = [];
  const approvers = new Set<string>();
  let rejects = 0;

  for (const v of verdicts) {
    const res = verifyPreVerdict(v, action, { publicKeys: opts.publicKeys, now: opts.now });
    if (!res.valid) {
      errors.push(`a verdict by "${v.pre_verdict.reviewer}" did not verify: ${res.errors.join("; ")}`);
      continue;
    }
    if (res.verdict === "reject") {
      rejects++;
      errors.push(`rejected by "${v.pre_verdict.reviewer}"`);
    } else if (res.verdict === "approve" || (res.verdict === "concerns" && opts.allowConcerns)) {
      approvers.add(v.pre_verdict.reviewer);
    }
  }

  const cleared = rejects === 0 && approvers.size >= opts.threshold;
  if (!cleared && rejects === 0) {
    errors.push(`need ${opts.threshold} approvals, have ${approvers.size}`);
  }
  return { cleared, approvals: approvers.size, rejects, reviewers: [...approvers].sort(), threshold: opts.threshold, errors };
}
