/**
 * AskLedger — Receipts SDK
 * Type definitions for the AI Decision Receipt envelope.
 *
 * This implements the receipt schema defined in the AskLedger
 * Technical Architecture v0.2 — Plane 5 (Records).
 *
 * Stable until the spec reaches v1.0 (target: Year 2, Linux Foundation AI).
 */

export type DecisionVerdict = "allow" | "block" | "flag" | "require-approval";

export type Classification =
  | "pii_redacted"
  | "pii"
  | "pci"
  | "mnpi"
  | "internal"
  | "public";

export interface EventContext {
  user_id?: string;
  session_id?: string;
  service_id?: string;
  environment?: "production" | "staging" | "development";
  region?: string;
  correlation_id?: string;
}

export interface EventSubject {
  ai_vendor?: string;       // "anthropic" | "openai" | "google" | "bedrock" | ...
  ai_model?: string;        // "claude-sonnet-4-6" | "gpt-4-turbo" | ...
  ai_model_version?: string; // pinned snapshot, e.g. "claude-sonnet-4-20250514"
  base_model?: string;       // the base a fine-tune derives from (with fine_tune_id)
  ai_provider?: string;     // "direct" | "gateway:portkey" | "gateway:litellm" | ...
  ai_capability?: string;   // "text-generation" | "code-completion" | "embedding" | ...
  model_card_hash?: string;    // digest of the model card in force
  fine_tune_id?: string;       // for internal / fine-tuned models
  system_prompt_hash?: string; // digest of the system prompt that governed the call
}

export interface EventPayload {
  input_hash?: string;
  input_classification?: Classification;
  input_size_bytes?: number;
  input_token_count?: number;
  output_hash?: string;
  output_classification?: Classification;
  output_size_bytes?: number;
  output_token_count?: number;
  tool_calls?: unknown[];
  retrieval_refs?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface EventLineage {
  parent_event_ids?: string[];
  workflow_id?: string;
  trace_id?: string;
}

export interface RawEvent {
  schema_version: string;
  tenant_id: string;
  event_type: string;
  source_system: string;
  event_id: string;
  captured_at: string; // RFC 3339
  context?: EventContext;
  subject?: EventSubject;
  payload?: EventPayload;
  lineage?: EventLineage;
}

export interface DecisionBlock {
  policy_bundle_hash: string;
  applied_policies: string[];
  decision: DecisionVerdict;
  reason_codes?: string[];
}

export interface ProvenanceBlock {
  parent_receipt_ids?: string[];
  workflow_id?: string;
  lineage_root?: string;
}

export interface IntegrityBlock {
  previous_receipt_hash: string;
  receipt_hash: string;
  chain_height: number;
  merkle_period?: string;
}

/**
 * A reference to an external evidence or attestation artifact associated with
 * a receipt (for example, a checker report or an out-of-band verification
 * artifact). The referenced artifact itself is NOT embedded — only its digest
 * (and optional locator) is recorded, so the reference is bound into the
 * receipt's canonical bytes and covered by the signature without changing any
 * cryptographic behavior.
 *
 * Each entry is a plain digest reference; the SDK does not fetch, validate, or
 * interpret the referenced artifact. Consumers dereference `uri` (when present)
 * and check the artifact against `hash` themselves.
 */
export interface EvidenceRef {
  /** Free-form category of the referenced artifact, e.g. "attestation", "external-report". */
  kind: string;
  /** Digest of the referenced artifact, hex- or base64-encoded per `alg`. */
  hash: string;
  /** Hash algorithm used to produce `hash`, e.g. "sha256". Defaults to consumer convention when omitted. */
  alg?: string;
  /** Optional locator (URI/URL/URN) where the referenced artifact can be retrieved. */
  uri?: string;
  /** Optional consumer-defined status, e.g. "pass" | "fail" | "unknown" | "applied" | "verified". */
  status?: string;
  /** Optional mathematical/logical value this artifact asserts, e.g. "credit_score >= 650". */
  mathematical_value?: string;
  /** Optional proof system the artifact came from, e.g. "lean" | "rule_check" | "smt". */
  proof_type?: string;
}

/** A single rule within a policy context (text and/or machine form). */
export interface PolicyRule {
  rule_id: string;
  expression?: string;        // human-readable, e.g. "credit_score >= 650"
  mathematical_form?: string; // machine form, e.g. "credit_score >= 650"
  source?: string;            // "internal_policy" | "regulatory" | ...
  weight?: number;
}

/**
 * OPTIONAL. The policy/ruleset that governed the decision, captured for audit
 * and as the bridge to later verification. Additive: absent on receipts that
 * don't use it; when present, part of the canonical bytes and the signature.
 * Note: `decision.policy_bundle_hash` / `applied_policies` remain the canonical
 * governance fields; this block adds the human/mathematical rule detail.
 */
export interface PolicyContext {
  policy_bundle_id?: string;
  policy_bundle_hash?: string;
  version?: string;
  domain?: string;            // "loan_decision" | "tax" | ...
  applied_rules?: PolicyRule[];
  mathematical_constraints?: string;
  rule_encoding_format?: string; // "simple_expression" | "lean" | "catala" | ...
}

/** A reference to a proof artifact produced by a verifier (by digest). */
export interface ProofArtifact {
  kind: string;               // "lean_proof" | "rule_check" | "mathematical_proof"
  hash: string;
  alg?: string;
  uri?: string;
  size_bytes?: number;
}

/**
 * OPTIONAL. The result of checking/verifying the decision against its rules.
 * Additive. NOTE: `confidence_score` is meaningful only for probabilistic
 * (rule_based/hybrid) verification; a true formal proof is binary.
 */
export interface VerificationBlock {
  enabled?: boolean;
  verification_type?: "formal" | "rule_based" | "hybrid";
  status?: "verified" | "failed" | "pending" | "not_applicable";
  proof_artifact?: ProofArtifact;
  failed_rules?: string[];
  confidence_score?: number;
  verifier_version?: string;
}

/** OPTIONAL. A human-facing summary of the decision outcome and its drivers. */
export interface DecisionSummary {
  outcome?: DecisionVerdict;
  risk_score?: number;
  reason_codes?: string[];
  human_override?: boolean;
  override_reason?: string | null;
}

export interface Receipt {
  schema_version: "1.0";
  receipt_id: string;       // UUIDv7
  tenant_id: string;
  issued_at: string;        // RFC 3339 with nanosecond precision
  event: RawEvent;
  decision?: DecisionBlock;
  decision_summary?: DecisionSummary;
  policy_context?: PolicyContext;
  verification?: VerificationBlock;
  provenance?: ProvenanceBlock;
  /**
   * OPTIONAL. References to external evidence/attestation artifacts, by digest.
   * Strictly additive: receipts without this field sign and verify identically
   * to before. When present, it is part of the canonical bytes and therefore
   * covered by both `integrity.receipt_hash` and the signature.
   */
  evidence_refs?: EvidenceRef[];
  /**
   * OPTIONAL forward-compatibility map for experimental / not-yet-standardized
   * attributes (e.g. `data_provenance`, `compliance`), keyed by a namespaced
   * name. Additive and signed like everything else — it is part of the canonical
   * bytes, so anything placed here is covered by `integrity.receipt_hash` and the
   * signature. Promote a field to a first-class receipt field only once its shape
   * is proven in real use; until then it lives here without freezing the schema.
   */
  extensions?: Record<string, unknown>;
  integrity: IntegrityBlock;
}

export interface Signature {
  alg: "EdDSA";
  kid: string;              // key identifier
  sig: string;              // base64 standard encoding
}

export interface TimestampToken {
  tsa: string;              // TSA identifier
  timestamp_token: string;  // base64-encoded RFC 3161 TST (for now, a placeholder)
  // In v0.2 we'll integrate real RFC 3161 TSAs (FreeTSA + DigiCert).
}

export interface SignedReceipt {
  receipt: Receipt;
  signatures: Signature[];
  timestamps?: TimestampToken[];
}

export interface KeyPair {
  kid: string;
  public_key: string;       // base64 standard encoding
  private_key: string;      // base64 standard encoding (HSM in production)
  algorithm: "EdDSA";
  curve: "ed25519";
  created_at: string;
}

export interface ChainState {
  tenant_id: string;
  chain_height: number;
  previous_receipt_hash: string;
  last_receipt_id?: string;
  updated_at: string;
}

export const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";
