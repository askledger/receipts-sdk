/**
 * Example 08 — The four layers, end to end (prevent, then prove)
 *
 * One runnable script that walks a single real agent action through all four
 * technical layers of AskLedger, then shows where Layer 5 fits.
 *
 * Scenario: an accounts-payable agent runs a multi-step "vendor payment"
 * workflow whose final step is an irreversible $40,000 wire. We:
 *
 *   L4  stop the wire until an INDEPENDENT reviewer signs off   (prevent)
 *   L1  sign every step into a per-tenant hash chain            (record)
 *   L2  reconstruct + verify the whole run as a DAG             (trace)
 *   L3  check the decision against its policy, and grade it     (prove correct)
 *   L5  package all of the above into governance + verified ROI (the program)
 *
 * Run:  node --loader tsx examples/08-four-layers-end-to-end.ts
 */

import {
  generateKeyPair,
  signReceipt,
  verifyChain,
  verifyWorkflow,
  signPreVerdict,
  verifyPreVerdict,
  reviewNofM,
  assertActionCleared,
  preVerdictEvidenceRef,
  checkRules,
  assuranceLevel,
  type RawEvent,
  type SignedReceipt,
  type ProposedAction,
  type PolicyContext,
} from "../src/index.js";

// Unique per run so a persisted chain state never collides with a re-run.
const TENANT = "acme-ap-" + Date.now();
const WF = "vendor-payment-run";

let seq = 0;
function evt(type: string, payload: Record<string, unknown>): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: TENANT,
    event_type: type, // dotted identifier, e.g. "agent.decide"
    source_system: "ap-agent",
    event_id: `evt-${type}-${++seq}`,
    captured_at: new Date().toISOString(),
    context: { environment: "production", workflow: WF },
    subject: { ai_vendor: "openai", ai_model: "gpt-5", ai_capability: "agent" },
    payload,
  };
}

function banner(tag: string, title: string): void {
  const line = "=".repeat(72);
  console.log(`\n${line}\n  ${tag}   ${title}\n${line}`);
}

function main(): void {
  // The agent signs receipts with its own key. The reviewers have their own
  // keys, so a verdict can never be signed by the party it is meant to check.
  const agentKp = generateKeyPair();
  const publicKeys = { [agentKp.kid]: agentKp.public_key };

  const riskKp = generateKeyPair();
  const controllerKp = generateKeyPair();
  const verdictKeys = {
    [riskKp.kid]: riskKp.public_key,
    [controllerKp.kid]: controllerKp.public_key,
  };

  let ok = true;
  const check = (cond: boolean, label: string): void => {
    if (!cond) ok = false;
    console.log(`  [${cond ? "ok" : "XX"}] ${label}`);
  };

  // -------------------------------------------------------------------------
  banner("L4", "Pre-execution guardian — stop the wrong action before it runs");
  // -------------------------------------------------------------------------
  const wire: ProposedAction = {
    tenant_id: TENANT,
    action_type: "payment.execute",
    payload: { vendor: "Globex Ltd", amount_usd: 40000, currency: "USD", iban: "GB00GLBX..." },
    actor: "agent-ap",
  };

  // 4a. Independence is enforced: the actor cannot sign its own clearance.
  let selfApprovalBlocked = false;
  try {
    signPreVerdict(wire, { verdict: "approve", reviewer: "agent-ap" }, { keypair: riskKp, reviewedAt: new Date().toISOString() });
  } catch {
    selfApprovalBlocked = true;
  }
  check(selfApprovalBlocked, "self-approval refused: reviewer must be independent of the actor");

  // 4b. A reject is a hard veto: the action cannot run.
  const rejected = signPreVerdict(wire, { verdict: "reject", reviewer: "risk-engine", reasons: ["vendor not on approved list"] }, { keypair: riskKp, reviewedAt: new Date().toISOString() });
  let rejectBlocked = false;
  try {
    assertActionCleared(rejected, wire, { publicKeys: verdictKeys });
  } catch {
    rejectBlocked = true;
  }
  check(rejectBlocked, "a reject verdict blocks execution");

  // 4c. Two independent approvers clear the high-risk wire (N-of-M).
  const approveRisk = signPreVerdict(wire, { verdict: "approve", reviewer: "risk-engine" }, { keypair: riskKp, reviewedAt: new Date().toISOString() });
  const approveCtrl = signPreVerdict(wire, { verdict: "approve", reviewer: "controller" }, { keypair: controllerKp, reviewedAt: new Date().toISOString() });
  const nofm = reviewNofM(wire, [approveRisk, approveCtrl], { publicKeys: verdictKeys, threshold: 2 });
  check(nofm.cleared, `N-of-M cleared with ${nofm.approvals} distinct approvers (threshold 2)`);

  // 4d. The verdict binds to THIS exact action; "approve A, run B" fails.
  const tampered: ProposedAction = { ...wire, payload: { ...(wire.payload as Record<string, unknown>), amount_usd: 400000 } };
  const bind = verifyPreVerdict(approveRisk, tampered, { publicKeys: verdictKeys });
  check(!bind.checks.binds_to_action, "verdict does NOT clear a modified action (approve A, run B is caught)");

  // The clearance rides into the receipt as tamper-evident evidence (L4 -> L1).
  const verdictRef = preVerdictEvidenceRef(approveRisk);

  // -------------------------------------------------------------------------
  banner("L1 + L2", "Record every step into a hash chain, trace the run as a DAG");
  // -------------------------------------------------------------------------
  // Layer 3 policy + rule check, computed here so the decision receipt carries it.
  const policy: PolicyContext = {
    applied_rules: [
      { rule_id: "amount_within_limit", mathematical_form: "amount_usd <= 50000" },
      { rule_id: "vendor_approved", mathematical_form: 'vendor_status == "approved"' },
    ],
  };
  const ruleResult = checkRules(policy, { amount_usd: 40000, vendor_status: "approved" });

  // Four workflow steps. Each links to the previous by receipt id (the DAG),
  // and signReceipt hash-chains them per tenant (the linear chain).
  const r1 = signReceipt({ event: evt("agent.plan", { goal: "pay invoice INV-8842" }), keypair: agentKp, provenance: { workflow_id: WF, parent_receipt_ids: [] } });
  const r2 = signReceipt({ event: evt("agent.retrieve", { invoice: "INV-8842", vendor: "Globex Ltd" }), keypair: agentKp, provenance: { workflow_id: WF, parent_receipt_ids: [r1.receipt.receipt_id] } });
  const r3 = signReceipt({ event: evt("agent.decide", { decision: "pay", amount_usd: 40000 }), keypair: agentKp, provenance: { workflow_id: WF, parent_receipt_ids: [r2.receipt.receipt_id] }, policyContext: policy, verification: ruleResult.verification });
  const r4 = signReceipt({ event: evt("payment.execute", { vendor: "Globex Ltd", amount_usd: 40000 }), keypair: agentKp, provenance: { workflow_id: WF, parent_receipt_ids: [r3.receipt.receipt_id] }, evidenceRefs: [verdictRef] });
  const chain: SignedReceipt[] = [r1, r2, r3, r4];

  const chainRes = verifyChain(chain, { publicKeys });
  check(chainRes.valid && chainRes.completeFromGenesis, `L1 hash chain verified end to end (length ${chainRes.length}, complete from genesis)`);

  const wf = verifyWorkflow(chain, { publicKeys, workflowId: WF });
  check(wf.valid, `L2 workflow DAG verified (${wf.order.length} steps, complete and acyclic)`);
  console.log(`     order: ${chain.map((r) => r.receipt.event.event_type).join("  ->  ")}`);

  // -------------------------------------------------------------------------
  banner("L3", "Prove the decision was sound, and grade the evidence");
  // -------------------------------------------------------------------------
  check(ruleResult.status === "verified", `rule check status = ${ruleResult.status}`);
  for (const e of ruleResult.evaluations) {
    console.log(`     [${e.passed ? "pass" : "FAIL"}]  ${e.expression}`);
  }
  const grade = assuranceLevel(r3);
  console.log(`  assurance level of the decision receipt: ${grade.level} (${grade.name})`);
  console.log("     (software key + chain = L1 Signed; add HSM/KMS for L2 Attested, a timestamp for L3 Anchored)");

  // -------------------------------------------------------------------------
  banner("L5", "Enablement & ROI — the program around the engine (no new API)");
  // -------------------------------------------------------------------------
  console.log("  Layers 1-4 above are cryptographically verifiable. Layer 5 packages them:");
  console.log("    - the signed savings baseline from the cost engine   ->  Verified ROI");
  console.log("    - the Layer 3 rule packs shown above                 ->  Compliance");
  console.log("    - the assurance ladder                               ->  Audit success");
  console.log("  Every number is proven against signed evidence, never claimed.");

  // -------------------------------------------------------------------------
  banner("RESULT", ok ? "All four layers verified end to end" : "Something did not verify");
  // -------------------------------------------------------------------------
  process.exitCode = ok ? 0 : 1;
}

main();
