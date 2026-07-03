/**
 * OPA (Open Policy Agent) decision client.
 *
 * Calls the local OPA sidecar (or remote PDP) to evaluate an
 * authorization decision, returns the verdict, AND emits a Project
 * Ledger receipt that cryptographically attests to the decision.
 *
 * Every meaningful authorization check in the platform should flow
 * through this client. Decisions become receipts; the audit trail is
 * verifiable forever.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import { signReceipt } from "../receipt.js";
import type {
  RawEvent,
  KeyPair,
  SignedReceipt,
  DecisionVerdict,
} from "../types.js";

export interface OpaDecisionRequest {
  /** Policy package path, e.g. "platform/api/v1/authz". */
  policyPath: string;
  /** Input document for OPA. */
  input: Record<string, unknown>;
  /** Tenant binding. */
  tenantId: string;
  /** Optional correlation id. */
  correlationId?: string;
}

export interface OpaDecisionResponse {
  allow: boolean;
  obligations?: string[];
  reasonCodes?: string[];
  /** Hash of the policy bundle that produced this decision. */
  bundleHash: string;
  /** sha256 of the canonical input. */
  inputHash: string;
}

export interface OpaPdpLike {
  /** Call OPA and return the raw decision. */
  evaluate(req: {
    path: string;
    input: Record<string, unknown>;
  }): Promise<{
    result?: {
      allow?: boolean;
      obligations?: string[];
      reason_codes?: string[];
    };
    bundle_hash?: string;
  }>;
}

export interface OpaClientOptions {
  pdp: OpaPdpLike;
  signingKey: KeyPair;
  /** Source system tag for the resulting decision receipt. */
  sourceSystem?: string;
  /** Where to ship the signed decision receipt. */
  onReceipt?: (receipt: SignedReceipt) => Promise<void> | void;
}

function sha256Hex(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return Buffer.from(sha256Fn(b)).toString("hex");
}

export class OpaDecisionClient {
  constructor(private readonly opts: OpaClientOptions) {}

  /**
   * Evaluate an authorization decision against OPA, sign a Project
   * Ledger receipt attesting to the decision, and return both.
   */
  async decide(
    req: OpaDecisionRequest
  ): Promise<{ decision: OpaDecisionResponse; receipt: SignedReceipt | null }> {
    const t0 = Date.now();
    const startedAt = new Date().toISOString();

    const raw = await this.opts.pdp.evaluate({
      path: req.policyPath,
      input: req.input,
    });
    const allow = Boolean(raw.result?.allow);
    const inputCanonical = JSON.stringify(req.input);
    const bundleHash = raw.bundle_hash ?? "unknown-bundle";

    const decision: OpaDecisionResponse = {
      allow,
      obligations: raw.result?.obligations,
      reasonCodes: raw.result?.reason_codes,
      bundleHash,
      inputHash: sha256Hex(inputCanonical),
    };

    const verdict: DecisionVerdict = allow ? "allow" : "block";
    const event: RawEvent = {
      schema_version: "1.0",
      tenant_id: req.tenantId,
      event_type: "policy.decision",
      source_system: this.opts.sourceSystem ?? "zta:opa",
      event_id: `opa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      captured_at: startedAt,
      context: { correlation_id: req.correlationId },
      payload: {
        input_hash: decision.inputHash,
        input_classification: "internal",
        metadata: { latency_ms: Date.now() - t0, policy_path: req.policyPath },
      },
    };

    let receipt: SignedReceipt | null = null;
    try {
      receipt = signReceipt({
        event,
        keypair: this.opts.signingKey,
        decision: {
          policy_bundle_hash: bundleHash,
          applied_policies: [req.policyPath],
          decision: verdict,
          reason_codes: decision.reasonCodes,
        },
      });
      if (this.opts.onReceipt) await this.opts.onReceipt(receipt);
    } catch (e) {
      // Decision receipt failures are LOGGED but do not block the auth
      // decision — the platform's primary path is the OPA verdict, the
      // receipt is the attestation.
      // eslint-disable-next-line no-console
      console.error("[opa-client] receipt sign failed:", e);
    }
    return { decision, receipt };
  }
}
