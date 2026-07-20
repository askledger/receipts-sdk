/**
 * Layer 3, Execution Traceability: deterministic workflow reconstruction.
 *
 * A multi-step run (an agent workflow, a pipeline) leaves one receipt per step,
 * each recording its parent step(s) in `provenance.parent_receipt_ids` and the
 * run in `provenance.workflow_id`. Those edges are inside the signed body, so
 * they are tamper-evident.
 *
 * This module rebuilds the execution DAG from those receipts and verifies it is
 * one intact, acyclic run with every referenced parent present. Given the same
 * receipts it always produces the same graph and the same step order, so it is
 * a DETERMINISTIC REPLAY of how the process ran, provable to a third party.
 * (It reproduces the provable record of the run; it does not re-execute the
 * non-deterministic model.)
 */

import { verifyReceipt } from "./verify.js";
import type { SignedReceipt } from "./types.js";

export interface WorkflowStep {
  receiptId: string;
  eventType: string;
  chainHeight: number;
  parents: string[]; // parent receipt ids that are present in this run
  order: number; // deterministic topological position
}

export interface WorkflowGraph {
  workflowId: string | null;
  steps: WorkflowStep[]; // topologically ordered
  order: string[]; // receipt ids in deterministic replay order (steps, flattened)
  roots: string[]; // steps with no present parent (entry points)
  leaves: string[]; // steps with no children (final outputs)
  missingParents: string[]; // parents referenced but not supplied
  acyclic: boolean;
}

function workflowIdOf(sr: SignedReceipt): string | null {
  return sr.receipt.provenance?.workflow_id ?? sr.receipt.event?.lineage?.workflow_id ?? null;
}

/**
 * Deterministically rebuild the execution DAG for a workflow from its receipts.
 * If `workflowId` is given, only receipts in that workflow are used; otherwise
 * the workflow id is inferred from the first receipt. Order is a topological
 * sort with a (chain_height, receipt_id) tie-break, so it is fully reproducible.
 */
export function reconstructWorkflow(
  receipts: SignedReceipt[],
  opts: { workflowId?: string; tenantId?: string } = {}
): WorkflowGraph {
  const targetWf = opts.workflowId ?? (receipts.length ? workflowIdOf(receipts[0]) : null);

  // Membership is scoped by TENANT as well as workflow id. `workflow_id` is an
  // attacker-chosen free-form string, so without this a second tenant signs a
  // receipt under its own perfectly valid key, reuses another tenant's
  // workflow_id, and points parent_receipt_ids at their receipt. In a
  // multi-tenant verifier (which must load the full key set) the injected step
  // became the LEAF, i.e. the authoritative final output of the victim's
  // workflow, and verifyWorkflow reported valid:true with single_workflow:true
  // and no errors. Tenant isolation cannot depend on a caller-supplied label.
  const targetTenant =
    opts.tenantId ??
    (receipts.length
      ? receipts.find((r) => workflowIdOf(r) === targetWf)?.receipt.tenant_id ?? null
      : null);

  const inRun = receipts.filter(
    (r) => workflowIdOf(r) === targetWf && (targetTenant === null || r.receipt.tenant_id === targetTenant)
  );

  const byId = new Map<string, SignedReceipt>();
  for (const r of inRun) byId.set(r.receipt.receipt_id, r);

  const missing = new Set<string>();
  const presentParents = new Map<string, string[]>();
  const childCount = new Map<string, number>();
  for (const r of inRun) childCount.set(r.receipt.receipt_id, 0);

  for (const r of inRun) {
    const recorded = r.receipt.provenance?.parent_receipt_ids ?? [];
    const present: string[] = [];
    for (const p of recorded) {
      if (byId.has(p)) {
        present.push(p);
        childCount.set(p, (childCount.get(p) ?? 0) + 1);
      } else {
        missing.add(p);
      }
    }
    presentParents.set(r.receipt.receipt_id, present);
  }

  // Kahn's algorithm with a deterministic tie-break (chain_height, then id).
  const indeg = new Map<string, number>();
  for (const r of inRun) indeg.set(r.receipt.receipt_id, (presentParents.get(r.receipt.receipt_id) ?? []).length);
  const cmp = (a: string, b: string) => {
    const ra = byId.get(a)!.receipt.integrity.chain_height;
    const rb = byId.get(b)!.receipt.integrity.chain_height;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  };

  const ready = [...inRun.map((r) => r.receipt.receipt_id)].filter((id) => (indeg.get(id) ?? 0) === 0).sort(cmp);
  const orderIds: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    orderIds.push(id);
    // decrement children
    for (const r of inRun) {
      const parents = presentParents.get(r.receipt.receipt_id) ?? [];
      if (parents.includes(id)) {
        const d = (indeg.get(r.receipt.receipt_id) ?? 0) - 1;
        indeg.set(r.receipt.receipt_id, d);
        if (d === 0) {
          ready.push(r.receipt.receipt_id);
          ready.sort(cmp);
        }
      }
    }
  }
  const acyclic = orderIds.length === inRun.length;

  const steps: WorkflowStep[] = orderIds.map((id, i) => {
    const r = byId.get(id)!;
    return {
      receiptId: id,
      eventType: r.receipt.event?.event_type ?? "unknown",
      chainHeight: r.receipt.integrity.chain_height,
      parents: presentParents.get(id) ?? [],
      order: i,
    };
  });

  const roots = inRun.filter((r) => (presentParents.get(r.receipt.receipt_id) ?? []).length === 0).map((r) => r.receipt.receipt_id);
  const leaves = inRun.filter((r) => (childCount.get(r.receipt.receipt_id) ?? 0) === 0).map((r) => r.receipt.receipt_id);

  return { workflowId: targetWf, steps, order: steps.map((s) => s.receiptId), roots, leaves, missingParents: [...missing], acyclic };
}

export interface WorkflowVerifyResult {
  valid: boolean;
  workflowId: string | null;
  stepCount: number;
  order: string[]; // deterministic replay order (receipt ids)
  checks: {
    all_receipts_verified: boolean;
    graph_complete: boolean; // every referenced parent is present
    acyclic: boolean;
    single_workflow: boolean;
  };
  missingParents: string[];
  errors: string[];
}

/**
 * Verify a full workflow end to end: every receipt's hash and signature, the
 * DAG is complete (no dangling parents) and acyclic, and it is a single run.
 * Returns the deterministic replay order.
 */
export function verifyWorkflow(
  receipts: SignedReceipt[],
  opts: { publicKeys: Record<string, string>; workflowId?: string; tenantId?: string }
): WorkflowVerifyResult {
  const errors: string[] = [];
  const g = reconstructWorkflow(receipts, { workflowId: opts.workflowId, tenantId: opts.tenantId });

  // Scope by tenant here too, or the two functions disagree about membership
  // and the graft slips back in through this path.
  const runTenant =
    opts.tenantId ??
    receipts.find((r) => workflowIdOf(r) === g.workflowId)?.receipt.tenant_id ??
    null;
  const inRun = receipts.filter(
    (r) => workflowIdOf(r) === g.workflowId && (runTenant === null || r.receipt.tenant_id === runTenant)
  );

  // A receipt claiming this workflow_id from a DIFFERENT tenant is not a
  // harmless extra: it is an attempt to graft a step onto someone else's run.
  // Report it loudly rather than silently dropping it.
  const foreign = receipts.filter(
    (r) => workflowIdOf(r) === g.workflowId && runTenant !== null && r.receipt.tenant_id !== runTenant
  );
  if (foreign.length > 0) {
    errors.push(
      `${foreign.length} receipt(s) claim workflow ${g.workflowId} from a different tenant (${[
        ...new Set(foreign.map((r) => r.receipt.tenant_id)),
      ].join(", ")}); excluded from the run`
    );
  }

  let allVerified = true;
  for (const r of inRun) {
    const res = verifyReceipt(r, { publicKeys: opts.publicKeys });
    // For a workflow DAG we require content integrity (hash + signature); the
    // linear per-tenant chain position is Layer 2's job (verifyChain).
    if (!(res.checks.canonical_hash_matches && res.checks.signature_valid && res.checks.timestamp_imprint_matches !== false)) {
      allVerified = false;
      errors.push(`receipt ${r.receipt.receipt_id} failed content verification`);
    }
  }

  const graph_complete = g.missingParents.length === 0;
  if (!graph_complete) errors.push(`workflow references ${g.missingParents.length} parent receipt(s) not supplied`);
  if (!g.acyclic) errors.push("workflow graph contains a cycle");

  const single_workflow = receipts.every((r) => workflowIdOf(r) === g.workflowId);
  if (!single_workflow) errors.push("receipts span more than one workflow_id");

  // A cross-tenant graft must make the whole verification fail, not merely add
  // a note. The victim's run reported valid:true with the intruder as its
  // authoritative final output.
  const valid = allVerified && graph_complete && g.acyclic && single_workflow && foreign.length === 0;
  return {
    valid,
    workflowId: g.workflowId,
    stepCount: g.steps.length,
    order: g.steps.map((s) => s.receiptId),
    checks: { all_receipts_verified: allVerified, graph_complete, acyclic: g.acyclic, single_workflow },
    missingParents: g.missingParents,
    errors,
  };
}
