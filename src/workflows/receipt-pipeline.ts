/**
 * End-to-end receipt pipeline workflow.
 *
 * Captures the real production flow:
 *
 *   captured → policy_evaluating → policy_decided
 *            → signing → signed → timestamping → timestamped
 *            → persisting → persisted → notifying → done
 *
 * Each step is observable, retryable, and contributes to the audit log.
 *
 * Failures at any step transition to `failed` and a human review queue.
 */

import { signReceipt } from "../receipt.js";
import { StateMachine, type Transition } from "./state-machine.js";
import type {
  RawEvent,
  KeyPair,
  SignedReceipt,
  TimestampToken,
  DecisionBlock,
} from "../types.js";
import type { TSAClient, StubTSAClient } from "../tsa.js";
import type { OpaDecisionClient } from "../zta/opa-client.js";

export type PipelineState =
  | "captured"
  | "policy_evaluating"
  | "policy_decided"
  | "signing"
  | "signed"
  | "timestamping"
  | "timestamped"
  | "persisting"
  | "persisted"
  | "notifying"
  | "done"
  | "failed";

const TRANSITIONS: Transition<PipelineState>[] = [
  { from: "captured", to: "policy_evaluating" },
  { from: "captured", to: "signing" }, // policy-skip path
  { from: "policy_evaluating", to: "policy_decided" },
  { from: "policy_evaluating", to: "failed" },
  { from: "policy_decided", to: "signing" },
  { from: "signing", to: "signed" },
  { from: "signing", to: "failed" },
  { from: "signed", to: "timestamping" },
  { from: "signed", to: "persisting" }, // timestamp-skip path
  { from: "timestamping", to: "timestamped" },
  { from: "timestamping", to: "failed" },
  { from: "timestamped", to: "persisting" },
  { from: "persisting", to: "persisted" },
  { from: "persisting", to: "failed" },
  { from: "persisted", to: "notifying" },
  { from: "persisted", to: "done" }, // notify-skip path
  { from: "notifying", to: "done" },
  { from: "notifying", to: "failed" },
];

export interface PipelineOptions {
  signingKey: KeyPair;
  /** Optional OPA decision client. If set, every receipt is evaluated. */
  policy?: {
    client: OpaDecisionClient;
    policyPath: string;
  };
  /** Optional TSA client. If set, receipts are RFC 3161 timestamped. */
  tsa?: TSAClient | StubTSAClient;
  /** Persistent storage adapter. Required for production. */
  store?: (receipt: SignedReceipt) => Promise<void>;
  /** Optional notification adapter (email, webhook, in-app). */
  notify?: (receipt: SignedReceipt) => Promise<void>;
}

export interface PipelineResult {
  state: PipelineState;
  receipt?: SignedReceipt;
  timestamps?: TimestampToken[];
  decision?: DecisionBlock;
  history: ReadonlyArray<{ from: PipelineState; to: PipelineState; at: string }>;
  error?: string;
}

/**
 * Run the full pipeline for one event. Returns the final state and
 * every artifact produced along the way. Never throws — failures are
 * captured in the result.
 */
export async function runPipeline(
  event: RawEvent,
  opts: PipelineOptions
): Promise<PipelineResult> {
  const sm = new StateMachine<PipelineState>("captured", TRANSITIONS);
  let receipt: SignedReceipt | undefined;
  let decision: DecisionBlock | undefined;
  let timestamps: TimestampToken[] | undefined;
  let errorMsg: string | undefined;

  try {
    // 1. Policy
    if (opts.policy) {
      await sm.transition("policy_evaluating");
      const decRes = await opts.policy.client.decide({
        policyPath: opts.policy.policyPath,
        input: { event },
        tenantId: event.tenant_id,
      });
      if (!decRes.decision.allow) {
        errorMsg = `policy denied: ${decRes.decision.reasonCodes?.join(",") ?? "no-reason"}`;
        decision = {
          policy_bundle_hash: decRes.decision.bundleHash,
          applied_policies: [opts.policy.policyPath],
          decision: "block",
          reason_codes: decRes.decision.reasonCodes,
        };
        await sm.transition("failed", { metadata: { reason: errorMsg } });
        return { state: sm.state, decision, history: sm.log, error: errorMsg };
      }
      decision = {
        policy_bundle_hash: decRes.decision.bundleHash,
        applied_policies: [opts.policy.policyPath],
        decision: "allow",
        reason_codes: decRes.decision.reasonCodes,
      };
      await sm.transition("policy_decided");
      await sm.transition("signing");
    } else {
      await sm.transition("signing");
    }

    // 2. Sign
    receipt = signReceipt({
      event,
      keypair: opts.signingKey,
      decision,
    });
    await sm.transition("signed");

    // 3. Timestamp
    if (opts.tsa) {
      await sm.transition("timestamping");
      const { canonicalSigningPayload } = await import("../receipt.js");
      const canon = canonicalSigningPayload(receipt.receipt);
      const token = await opts.tsa.timestamp(canon);
      timestamps = [token];
      receipt.timestamps = timestamps;
      await sm.transition("timestamped");
      await sm.transition("persisting");
    } else {
      await sm.transition("persisting");
    }

    // 4. Persist
    if (opts.store) {
      await opts.store(receipt);
    }
    await sm.transition("persisted");

    // 5. Notify
    if (opts.notify) {
      await sm.transition("notifying");
      await opts.notify(receipt);
      await sm.transition("done");
    } else {
      await sm.transition("done");
    }

    return { state: sm.state, receipt, timestamps, decision, history: sm.log };
  } catch (e) {
    errorMsg = (e as Error).message;
    try {
      await sm.transition("failed", { metadata: { reason: errorMsg } });
    } catch {
      // already at failed
    }
    return {
      state: sm.state,
      receipt,
      timestamps,
      decision,
      history: sm.log,
      error: errorMsg,
    };
  }
}
