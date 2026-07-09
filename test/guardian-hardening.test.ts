import { describe, it, expect } from "vitest";
import { signPreVerdict, verifyPreVerdict, assertActionCleared, reviewNofM, generateKeyPair, type ProposedAction } from "../src/index.js";

const kp = generateKeyPair();
const keys = { [kp.kid]: kp.public_key };

const action = (): ProposedAction => ({
  tenant_id: "acme",
  action_type: "wire.transfer",
  payload: { to: "IBAN123", amount: 500000 },
  actor: "agent-treasury",
});

describe("Layer 4 hardening — expiry", () => {
  it("blocks an expired verdict and passes a live one", () => {
    const a = action();
    const signed = signPreVerdict(a, { verdict: "approve", reviewer: "risk" }, {
      keypair: kp, reviewedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-06-01T01:00:00.000Z",
    });

    // an hour later: still valid
    expect(verifyPreVerdict(signed, a, { publicKeys: keys, now: "2026-06-01T00:30:00.000Z" }).checks.not_expired).toBe(true);

    // a day later: expired -> not valid, gate throws
    const late = verifyPreVerdict(signed, a, { publicKeys: keys, now: "2026-06-02T00:00:00.000Z" });
    expect(late.checks.not_expired).toBe(false);
    expect(late.valid).toBe(false);
    expect(() => assertActionCleared(signed, a, { publicKeys: keys, now: "2026-06-02T00:00:00.000Z" })).toThrow(/expired|did not verify/);
  });

  it("a verdict with no expiry never expires", () => {
    const a = action();
    const signed = signPreVerdict(a, { verdict: "approve", reviewer: "risk" }, { keypair: kp, reviewedAt: "2026-06-01T00:00:00.000Z" });
    expect(verifyPreVerdict(signed, a, { publicKeys: keys, now: "2099-01-01T00:00:00.000Z" }).checks.not_expired).toBe(true);
  });
});

describe("Layer 4 hardening — N-of-M", () => {
  const at = "2026-06-01T00:00:00.000Z";
  const v = (reviewer: string, verdict: "approve" | "reject" | "concerns", a: ProposedAction) =>
    signPreVerdict(a, { verdict, reviewer }, { keypair: kp, reviewedAt: at });

  it("clears with the threshold of distinct approvals", () => {
    const a = action();
    const r = reviewNofM(a, [v("risk-1", "approve", a), v("risk-2", "approve", a), v("risk-3", "approve", a)], { publicKeys: keys, threshold: 2, now: at });
    expect(r.cleared).toBe(true);
    expect(r.approvals).toBe(3);
  });

  it("a single reject vetoes even with enough approvals", () => {
    const a = action();
    const r = reviewNofM(a, [v("risk-1", "approve", a), v("risk-2", "approve", a), v("risk-3", "reject", a)], { publicKeys: keys, threshold: 2, now: at });
    expect(r.cleared).toBe(false);
    expect(r.rejects).toBe(1);
  });

  it("the same reviewer cannot count twice toward the threshold", () => {
    const a = action();
    const r = reviewNofM(a, [v("risk-1", "approve", a), v("risk-1", "approve", a)], { publicKeys: keys, threshold: 2, now: at });
    expect(r.approvals).toBe(1);
    expect(r.cleared).toBe(false);
  });

  it("verdicts must bind to the same action", () => {
    const a = action();
    const other: ProposedAction = { ...a, payload: { to: "IBAN123", amount: 999 } };
    // one approval is for a different action -> does not count
    const r = reviewNofM(a, [v("risk-1", "approve", a), v("risk-2", "approve", other)], { publicKeys: keys, threshold: 2, now: at });
    expect(r.approvals).toBe(1);
    expect(r.cleared).toBe(false);
  });
});
