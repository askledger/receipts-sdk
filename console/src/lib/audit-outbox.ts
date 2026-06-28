// Transactional outbox for security-relevant audit events.
//
// Privileged actions (role change, key op, plan change, export, support
// impersonation, deploy) MUST write a signed receipt to the platform audit
// log. We can't lose those receipts if the process crashes mid-handler, so
// the write goes through the outbox: emit-on-commit, with a separate
// dispatcher draining to the signer + chain store with at-least-once
// delivery semantics.
//
// In single-pod dev the outbox is in-memory; production swaps in a
// Postgres-backed implementation with the same interface (TX inserts the
// event; a separate worker reads & dispatches, marking sent).

import { randomUUID } from "node:crypto";

export type AuditAction =
  | "role.granted" | "role.revoked"
  | "key.rotated" | "key.revoked"
  | "plan.changed"
  | "evidence.exported" | "receipts.exported"
  | "integration.configured"
  | "support.impersonate.started" | "support.impersonate.ended"
  | "deploy.applied"
  | "scim.user.provisioned" | "scim.user.deprovisioned"
  | "billing.subscription.updated";

export interface AuditEvent {
  id: string;
  tenant_id: string;
  actor_sub: string;
  actor_email: string;
  action: AuditAction;
  target?: string;
  metadata: Record<string, unknown>;
  at: string;
}

export interface AuditOutbox {
  enqueue(e: Omit<AuditEvent, "id" | "at">): Promise<AuditEvent>;
  drain(handler: (e: AuditEvent) => Promise<void>): Promise<number>;
  pendingCount(): number;
}

export class InMemoryOutbox implements AuditOutbox {
  private readonly pending: AuditEvent[] = [];

  async enqueue(e: Omit<AuditEvent, "id" | "at">): Promise<AuditEvent> {
    const event: AuditEvent = { ...e, id: randomUUID(), at: new Date().toISOString() };
    this.pending.push(event);
    return event;
  }

  async drain(handler: (e: AuditEvent) => Promise<void>): Promise<number> {
    let sent = 0;
    while (this.pending.length) {
      const ev = this.pending[0];
      try {
        await handler(ev);
        this.pending.shift();
        sent++;
      } catch {
        // Stop draining on first failure; the next tick will retry from
        // head. At-least-once delivery: a successful handler call must
        // be idempotent on the receiving side.
        break;
      }
    }
    return sent;
  }

  pendingCount(): number { return this.pending.length; }
}

export const outbox: AuditOutbox = new InMemoryOutbox();
