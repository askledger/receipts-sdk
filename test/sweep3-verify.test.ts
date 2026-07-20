/**
 * Sweep-3 regressions.
 *
 * Every test here is a working exploit against the pre-fix code, kept as a
 * test so the exploit can never come back. Grouped by the defect it proves:
 *
 *   1. forged unsigned timestamp reported as verified evidence of time
 *   2. verifiers throwing on malformed envelopes instead of rejecting them
 *   3. shadow-AI guardrail failing OPEN when metadata is simply omitted
 *   4. non-atomic workflow transitions executing two exclusive branches
 *   5. pipeline claiming `persisted` with no store configured
 */

import { describe, it, expect } from "vitest";
import {
  signReceiptWithStore,
  generateKeyPair,
  verifyReceipt,
  verifyChain,
  verifyReceiptTimestamps,
  receiptTimestampImprint,
  detectShadowAi,
  evaluateContentSafety,
} from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import { StateMachine, WorkflowError } from "../src/workflows/state-machine.js";
import { runPipeline } from "../src/workflows/receipt-pipeline.js";
import type { RawEvent, SignedReceipt } from "../src/types.js";
import type { SafetyPolicy } from "../src/safety/content-safety.js";

const kp = generateKeyPair();
const keys = { [kp.kid]: kp.public_key };

const evt = (id = "e1"): RawEvent => ({
  schema_version: "1.0",
  tenant_id: "acme",
  event_type: "ai.generation",
  source_system: "test",
  event_id: id,
  captured_at: "2026-06-01T00:00:00.000Z",
  subject: { ai_vendor: "openai", ai_model: "gpt-5" },
  payload: { input_token_count: 10, output_token_count: 20 },
});

async function makeReceipt(id = "e1"): Promise<SignedReceipt> {
  const store = new MemoryChainStateStore();
  return signReceiptWithStore({ event: evt(id), keypair: kp }, store);
}

// ---------------------------------------------------------------------------
// 1. Forged timestamp (HIGH)
// ---------------------------------------------------------------------------

describe("sweep-3 #1: an unsigned local timestamp is never evidence of time", () => {
  /**
   * The attack: `timestamps[]` is OUTSIDE the signed receipt bytes, and
   * `receiptTimestampImprint()` is a public pure function. So anyone holding a
   * receipt can mint a token from thin air with the correct imprint plus an
   * `issued_at` and `tsa` of their choosing, and staple it on. The receipt's
   * own signature still verifies, because the token is not covered by it.
   */
  function forgeBackdatedToken(signed: SignedReceipt): SignedReceipt {
    const token = {
      stub: true,
      tsa: "DigiCert Timestamp 2019",
      issued_at: "2019-01-01T00:00:00.000Z",
      imprint: receiptTimestampImprint(signed), // publicly computable
    };
    return {
      ...signed,
      timestamps: [
        {
          tsa: "DigiCert Timestamp 2019",
          timestamp_token: Buffer.from(JSON.stringify(token)).toString("base64"),
        },
      ],
    };
  }

  it("does not report a verified-looking timestamp check for a forged token", async () => {
    const forged = forgeBackdatedToken(await makeReceipt());
    const v = verifyReceipt(forged, { publicKeys: keys });

    // Pre-fix this was `true`, which is the whole exploit: a verifier-endorsed
    // backdate to before an incident (or forward-date to claim a control was
    // already in place). It must never be reported as a passing check.
    expect(v.checks.timestamp_imprint_matches).not.toBe(true);
    expect(v.checks.timestamp_time_attested).toBe(false);
  });

  it("marks the verdict unauthenticated and says so in the note", async () => {
    const forged = forgeBackdatedToken(await makeReceipt());
    const [verdict] = verifyReceiptTimestamps(forged);

    expect(verdict.authenticated).toBe(false);
    // The imprint field genuinely does match; that statement stays true. What
    // must not survive is any implication that the TIME was attested.
    expect(verdict.imprintMatches).toBe(true);
    expect(verdict.note).toMatch(/UNAUTHENTICATED/);
    expect(verdict.note).toMatch(/not.*attested|NOT attested/i);
    // Pre-fix note was exactly "imprint binds to this receipt", which reads to
    // an auditor as "the timestamp checks out".
    expect(verdict.note).not.toBe("imprint binds to this receipt");
  });

  it("still fails a receipt whose token imprint does NOT match (real tamper signal)", async () => {
    const signed = await makeReceipt();
    const stamped = forgeBackdatedToken(signed);
    (stamped.receipt.event.payload as Record<string, unknown>).output_token_count = 99999;

    const v = verifyReceipt(stamped, { publicKeys: keys });
    expect(v.checks.timestamp_imprint_matches).toBe(false);
    expect(v.valid).toBe(false);
  });

  it("reports RFC 3161 tokens as unauthenticated too (nothing verified here)", async () => {
    const signed = await makeReceipt();
    const withDer: SignedReceipt = {
      ...signed,
      timestamps: [{ tsa: "freetsa", timestamp_token: Buffer.from([0x30, 0x82, 0x01]).toString("base64") }],
    };
    const [verdict] = verifyReceiptTimestamps(withDer);
    expect(verdict.format).toBe("rfc3161");
    expect(verdict.authenticated).toBe(false);
    expect(verifyReceipt(withDer, { publicKeys: keys }).checks.timestamp_time_attested).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Malformed envelopes must reject, not throw (MEDIUM)
// ---------------------------------------------------------------------------

describe("sweep-3 #2: malformed envelopes reject instead of throwing", () => {
  /**
   * A verifier is fed bytes by the party it exists to hold accountable. When a
   * malformed envelope escapes as a TypeError, the wrapping service returns a
   * 500 and the incident is triaged as an infrastructure fault, so tampering
   * is filed as flakiness. Each case below threw pre-fix.
   */
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["signatures missing", async () => { const r: any = await makeReceipt(); delete r.signatures; return r; }],
    ["signatures null", async () => ({ ...(await makeReceipt()), signatures: null })],
    ["signatures not an array", async () => ({ ...(await makeReceipt()), signatures: "nope" })],
    ["signatures containing null", async () => ({ ...(await makeReceipt()), signatures: [null] })],
    ["integrity missing", async () => { const r: any = await makeReceipt(); delete r.receipt.integrity; return r; }],
    ["receipt missing", async () => { const r: any = await makeReceipt(); delete r.receipt; return r; }],
    ["receipt null", async () => ({ ...(await makeReceipt()), receipt: null })],
    ["timestamps not an array", async () => ({ ...(await makeReceipt()), timestamps: 42 })],
  ];

  for (const [name, build] of cases) {
    it(`returns valid:false with an error for: ${name}`, async () => {
      const bad = (await build()) as SignedReceipt;
      const v = verifyReceipt(bad, { publicKeys: keys });
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
      expect(v.errors.join(" ")).toMatch(/Malformed receipt envelope/);
    });
  }

  it("rejects a deeply nested payload instead of blowing the stack", async () => {
    // Canonicalization is recursive, so ~20k levels of nesting is a remote
    // RangeError: an unauthenticated DoS on any verifying endpoint.
    const signed = await makeReceipt();
    let nested: Record<string, unknown> = {};
    const root = nested;
    for (let i = 0; i < 20000; i++) {
      const next: Record<string, unknown> = {};
      nested.n = next;
      nested = next;
    }
    (signed.receipt.event.payload as Record<string, unknown>).deep = root;

    const v = verifyReceipt(signed, { publicKeys: keys });
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it("verifyChain reports the broken index instead of aborting the whole audit", async () => {
    // The realistic case: a 10,000-receipt export where ONE receipt has been
    // altered. Pre-fix the audit threw and the auditor never learned WHICH.
    const store = new MemoryChainStateStore();
    const chain: SignedReceipt[] = [];
    for (let i = 0; i < 6; i++) {
      chain.push(await signReceiptWithStore({ event: evt(`e${i}`), keypair: kp }, store));
    }
    delete (chain[3] as any).signatures;

    const res = verifyChain(chain, { publicKeys: keys });
    expect(res.valid).toBe(false);
    expect(res.brokenAt).toBe(3);
    // The rest of the audit still ran: only the tampered member is reported.
    expect(res.errors.some((e) => e.includes("receipt 3"))).toBe(true);
    expect(res.length).toBe(6);
  });

  it("verifyChain survives a fully null member", async () => {
    const store = new MemoryChainStateStore();
    const chain: SignedReceipt[] = [
      await signReceiptWithStore({ event: evt("a"), keypair: kp }, store),
      await signReceiptWithStore({ event: evt("b"), keypair: kp }, store),
    ];
    chain.push(null as unknown as SignedReceipt);

    const res = verifyChain(chain, { publicKeys: keys });
    expect(res.valid).toBe(false);
    expect(res.brokenAt).not.toBeNull();
  });

  it("a well-formed receipt still verifies (no false positives from the shape guard)", async () => {
    const v = verifyReceipt(await makeReceipt(), { publicKeys: keys });
    expect(v.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Shadow-AI guardrail must fail closed (HIGH)
// ---------------------------------------------------------------------------

const POLICY: SafetyPolicy = {
  shadow_ai: {
    approved_vendors: ["anthropic"],
    approved_models: ["claude-sonnet-4-6"],
    approved_source_systems: ["ai-gateway-prod"],
  },
};

const SENSITIVE_TEXT =
  "Help me debug this customer record: jane.doe@client.ae, SSN 444-55-6789, IBAN GB82WEST12345698765432, card 4111111111111111";

describe("sweep-3 #3: shadow-AI checks fail closed on absent metadata", () => {
  it("flags missing vendor/model/source rather than returning a clean result", () => {
    const r = detectShadowAi({}, POLICY.shadow_ai);
    // Pre-fix: is_shadow false, severity 0, zero reasons. The party running
    // shadow AI is the party who fills these fields in, so a truthiness gate
    // only ever caught callers who volunteered that they were violating it.
    expect(r.is_shadow).toBe(true);
    expect(r.reasons).toContain("vendor_metadata_missing");
    expect(r.reasons).toContain("model_metadata_missing");
    expect(r.reasons).toContain("source_metadata_missing");
    expect(r.severity).toBeGreaterThan(0);
  });

  it("treats empty and whitespace-only strings as absent, not as values", () => {
    const r = detectShadowAi(
      { ai_vendor: "", ai_model: "   ", source_system: "" },
      POLICY.shadow_ai
    );
    expect(r.reasons).toContain("vendor_metadata_missing");
    expect(r.reasons).toContain("model_metadata_missing");
    expect(r.reasons).toContain("source_metadata_missing");
  });

  it("does not silently swallow an unparseable endpoint URL", () => {
    // A deliberately malformed URL was the cheapest way to hide a consumer
    // endpoint: `new URL()` threw and the catch block dropped the finding.
    const r = detectShadowAi(
      {
        ai_vendor: "anthropic",
        ai_model: "claude-sonnet-4-6",
        source_system: "ai-gateway-prod",
        endpoint_url: "ht!tp:/chatgpt.com//c/abc",
      },
      POLICY.shadow_ai
    );
    expect(r.reasons).toContain("endpoint_unparseable");
    expect(r.is_shadow).toBe(true);
  });

  it("the same sensitive payload cannot be allowed by omitting the fields", () => {
    const honest = evaluateContentSafety(
      {
        input_text: SENSITIVE_TEXT,
        output_text: "Sure! Here's the analysis…",
        input_classification: "pii",
        output_classification: "internal",
        shadow: {
          ai_vendor: "openai",
          ai_model: "gpt-4o",
          source_system: "personal-browser",
          endpoint_url: "https://chatgpt.com/c/abc",
        },
      },
      POLICY
    );
    const omitted = evaluateContentSafety(
      {
        input_text: SENSITIVE_TEXT,
        output_text: "Sure! Here's the analysis…",
        input_classification: "pii",
        output_classification: "internal",
        shadow: {},
      },
      POLICY
    );

    expect(honest.verdict).toBe("block");
    // Pre-fix this was "allow": identical data, identical risk, zero controls.
    expect(omitted.verdict).toBe("block");
  });

  it("with the fail-closed switch disabled, unattributable traffic still never reads as allow", () => {
    const r = evaluateContentSafety(
      { input_text: "hello", output_text: "hi", shadow: {} },
      { ...POLICY, block_on_missing_shadow_metadata: false }
    );
    expect(r.verdict).not.toBe("allow");
  });

  it("a fully declared, approved invocation is still clean (no false positives)", () => {
    const r = detectShadowAi(
      {
        ai_vendor: "anthropic",
        ai_model: "claude-sonnet-4-6",
        source_system: "ai-gateway-prod",
      },
      POLICY.shadow_ai
    );
    expect(r.is_shadow).toBe(false);
    expect(r.severity).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Atomic transitions (MEDIUM)
// ---------------------------------------------------------------------------

describe("sweep-3 #4: workflow transitions are atomic", () => {
  type ApprovalState = "pending" | "approved" | "rejected";

  const makeSm = (ran: string[]) =>
    new StateMachine<ApprovalState>("pending", [
      {
        from: "pending",
        to: "approved",
        guard: async () => { await new Promise((r) => setTimeout(r, 5)); return true; },
        action: async () => { ran.push("approved"); },
      },
      {
        from: "pending",
        to: "rejected",
        guard: async () => { await new Promise((r) => setTimeout(r, 5)); return true; },
        action: async () => { ran.push("rejected"); },
      },
    ]);

  it("only one of two concurrent exclusive transitions executes", async () => {
    // Pre-fix both `await`s inside transition() yielded before `_state` was
    // assigned, so both callers validated against `pending`, both guards
    // passed, and BOTH actions ran on one approval workflow.
    const ran: string[] = [];
    const sm = makeSm(ran);

    const results = await Promise.allSettled([
      sm.transition("approved"),
      sm.transition("rejected"),
    ]);

    expect(ran).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WorkflowError);
  });

  it("never records a transition that is not in the table", async () => {
    // The pre-fix audit history contained `approved -> rejected`, which does
    // not exist in the transition table at all: an audit log asserting a state
    // change that the machine was never configured to permit.
    const ran: string[] = [];
    const sm = makeSm(ran);
    await Promise.allSettled([sm.transition("approved"), sm.transition("rejected")]);

    const permitted = new Set(["pending=>approved", "pending=>rejected"]);
    for (const h of sm.log) {
      expect(permitted.has(`${h.from}=>${h.to}`)).toBe(true);
    }
    expect(sm.log).toHaveLength(1);
  });

  it("a rejected transition does not poison later queued transitions", async () => {
    const ran: string[] = [];
    const sm = makeSm(ran);
    await expect(sm.transition("nonexistent" as ApprovalState)).rejects.toBeInstanceOf(WorkflowError);
    await expect(sm.transition("approved")).resolves.toBe("approved");
    expect(sm.state).toBe("approved");
  });

  it("sequential transitions still work normally", async () => {
    const ran: string[] = [];
    const sm = makeSm(ran);
    await sm.transition("approved");
    expect(sm.state).toBe("approved");
    expect(ran).toEqual(["approved"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Pipeline must not claim work it did not do (LOW)
// ---------------------------------------------------------------------------

describe("sweep-3 #5: pipeline does not claim `persisted` without a store", () => {
  it("records persist_skipped when no store is configured", async () => {
    // Pre-fix the trace asserted the receipt was persisted while nothing was
    // written anywhere, unlike the timestamping/notifying steps which already
    // had explicit skip paths.
    const res = await runPipeline(evt(), { signingKey: kp });
    expect(res.error).toBeUndefined();
    expect(res.state).toBe("done");
    const states = res.history.map((h) => h.to);
    expect(states).toContain("persist_skipped");
    expect(states).not.toContain("persisted");
  });

  it("records persisted only when a store actually wrote the receipt", async () => {
    const written: SignedReceipt[] = [];
    const res = await runPipeline(evt(), {
      signingKey: kp,
      store: async (r) => { written.push(r); },
    });
    expect(res.state).toBe("done");
    expect(written).toHaveLength(1);
    const states = res.history.map((h) => h.to);
    expect(states).toContain("persisted");
    expect(states).not.toContain("persist_skipped");
  });

  it("the notify path still runs after a skipped persist", async () => {
    const notified: SignedReceipt[] = [];
    const res = await runPipeline(evt(), {
      signingKey: kp,
      notify: async (r) => { notified.push(r); },
    });
    expect(res.state).toBe("done");
    expect(notified).toHaveLength(1);
    expect(res.history.map((h) => h.to)).toContain("persist_skipped");
  });
});
