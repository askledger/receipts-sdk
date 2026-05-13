/**
 * Project Ledger — Receipts SDK
 * Type definitions for the AI Decision Receipt envelope.
 *
 * This implements the receipt schema defined in the Project Ledger
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
  ai_provider?: string;     // "direct" | "gateway:portkey" | "gateway:litellm" | ...
  ai_capability?: string;   // "text-generation" | "code-completion" | "embedding" | ...
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

export interface Receipt {
  schema_version: "1.0";
  receipt_id: string;       // UUIDv7
  tenant_id: string;
  issued_at: string;        // RFC 3339 with nanosecond precision
  event: RawEvent;
  decision?: DecisionBlock;
  provenance?: ProvenanceBlock;
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
