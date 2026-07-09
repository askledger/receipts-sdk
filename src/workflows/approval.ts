/**
 * Human-in-the-loop approval workflow.
 *
 * Some receipts require approval before they are considered final
 * (high-risk policy decisions, plan changes, key rotation, evidence
 * pack export to a regulator).
 *
 * States: pending → approved → done
 *         pending → rejected → done
 *         pending → expired → done
 */

import { StateMachine, type Transition } from "./state-machine.js";

export type ApprovalState =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "done";

const TRANSITIONS: Transition<ApprovalState>[] = [
  { from: "pending", to: "approved" },
  { from: "pending", to: "rejected" },
  { from: "pending", to: "expired" },
  { from: "approved", to: "done" },
  { from: "rejected", to: "done" },
  { from: "expired", to: "done" },
];

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  requestedAt: string;
  /** Free-form context the approvers see in the UI. */
  context: Record<string, unknown>;
  /** Approvers — at least N of M must approve. */
  approvers: string[];
  threshold: number;
  expiresAt: string;
}

export interface ApprovalDecision {
  approver: string;
  decision: "approve" | "reject";
  at: string;
  comment?: string;
}

export class ApprovalWorkflow {
  private readonly sm: StateMachine<ApprovalState>;
  private readonly decisions: ApprovalDecision[] = [];

  constructor(private readonly request: ApprovalRequest) {
    this.sm = new StateMachine<ApprovalState>("pending", TRANSITIONS);
  }

  get state(): ApprovalState {
    return this.sm.state;
  }

  /**
   * Record an approver's decision. Auto-transitions to approved/rejected
   * when threshold is met.
   */
  async submit(d: ApprovalDecision): Promise<ApprovalState> {
    if (this.sm.state !== "pending") {
      throw new Error(`Cannot submit decision; workflow is ${this.sm.state}`);
    }
    // Reject decisions submitted after the approval window closed. A malformed
    // or missing expiresAt parses to NaN, which is never "past", so it is a no-op.
    const deadline = Date.parse(this.request.expiresAt);
    if (Number.isFinite(deadline) && Date.now() >= deadline) {
      await this.sm.transition("expired", { actor: d.approver });
      await this.sm.transition("done");
      throw new Error(`Cannot submit decision; approval window expired at ${this.request.expiresAt}`);
    }
    if (!this.request.approvers.includes(d.approver)) {
      throw new Error(`Approver ${d.approver} not in allowed set`);
    }
    if (this.decisions.some((x) => x.approver === d.approver)) {
      throw new Error(`Approver ${d.approver} already decided`);
    }
    this.decisions.push(d);

    const approvals = this.decisions.filter((x) => x.decision === "approve").length;
    const rejections = this.decisions.filter((x) => x.decision === "reject").length;
    if (rejections > 0) {
      await this.sm.transition("rejected", { actor: d.approver });
      await this.sm.transition("done");
      return this.sm.state;
    }
    if (approvals >= this.request.threshold) {
      await this.sm.transition("approved", { actor: d.approver });
      await this.sm.transition("done");
      return this.sm.state;
    }
    return this.sm.state;
  }

  /** Mark as expired when the deadline passes. */
  async expire(): Promise<ApprovalState> {
    if (this.sm.state !== "pending") return this.sm.state;
    await this.sm.transition("expired");
    await this.sm.transition("done");
    return this.sm.state;
  }

  log(): ReadonlyArray<unknown> {
    return [...this.sm.log, ...this.decisions];
  }
}
