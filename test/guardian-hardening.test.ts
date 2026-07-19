import { describe, it, expect } from "vitest";
import { signPreVerdict, verifyPreVerdict, assertActionCleared, reviewNofM, generateKeyPair, type ProposedAction } from "../src/index.js";

const kp = generateKeyPair();
// Separation of duty is counted by KEY, so a realistic N-of-M test needs
// genuinely distinct reviewer keys, not one key under several names.
const kp2 = generateKeyPair();
const kp3 = generateKeyPair();
const keys = {
  [kp.kid]: kp.public_key,
  [kp2.kid]: kp2.public_key,
  [kp3.kid]: kp3.public_key,
};

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

  it("compares expiry as an instant, not as a string (timezone offsets)", () => {
    // Regression: "2026-07-20T02:00:00+09:00" IS "2026-07-19T17:00:00Z", already
    // past at 18:00Z, yet it sorts AFTER it lexicographically. A string compare
    // therefore accepted an expired verdict on an irreversible action.
    const a = action();
    const signed = signPreVerdict(a, { verdict: "approve", reviewer: "risk" }, {
      keypair: kp, reviewedAt: "2026-07-19T10:00:00.000Z", expiresAt: "2026-07-20T02:00:00+09:00",
    });
    const r = verifyPreVerdict(signed, a, { publicKeys: keys, now: "2026-07-19T18:00:00.000Z" });
    expect(r.checks.not_expired).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("treats differing fractional-second precision correctly", () => {
    const a = action();
    const signed = signPreVerdict(a, { verdict: "approve", reviewer: "risk" }, {
      keypair: kp, reviewedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-06-01T12:00:00Z",
    });
    // 11:00Z is before the 12:00Z expiry, even though "Z" > "." byte-wise.
    expect(
      verifyPreVerdict(signed, a, { publicKeys: keys, now: "2026-06-01T11:00:00.000Z" }).checks.not_expired
    ).toBe(true);
  });

  it("a verdict with no expiry never expires", () => {
    const a = action();
    const signed = signPreVerdict(a, { verdict: "approve", reviewer: "risk" }, { keypair: kp, reviewedAt: "2026-06-01T00:00:00.000Z" });
    expect(verifyPreVerdict(signed, a, { publicKeys: keys, now: "2099-01-01T00:00:00.000Z" }).checks.not_expired).toBe(true);
  });
});

describe("Layer 4 hardening — N-of-M", () => {
  const at = "2026-06-01T00:00:00.000Z";
  // Each reviewer signs with their OWN key, which is what separation of duty means.
  const v = (
    reviewer: string,
    verdict: "approve" | "reject" | "concerns",
    a: ProposedAction,
    keypair = kp
  ) => signPreVerdict(a, { verdict, reviewer }, { keypair, reviewedAt: at });

  it("clears with the threshold of distinct approving keys", () => {
    const a = action();
    const r = reviewNofM(
      a,
      [v("risk-1", "approve", a, kp), v("risk-2", "approve", a, kp2), v("risk-3", "approve", a, kp3)],
      { publicKeys: keys, threshold: 2, now: at }
    );
    expect(r.cleared).toBe(true);
    expect(r.approvals).toBe(3);
  });

  it("one key cannot clear an N-of-M gate by signing under several reviewer names", () => {
    // Regression: `reviewer` is free-form text in the signed body and is not
    // bound to the signing key. Counting names let a single key holder forge a
    // separation-of-duty gate on an irreversible action.
    const a = action();
    const r = reviewNofM(
      a,
      [
        v("risk-officer", "approve", a, kp),
        v("controller", "approve", a, kp),
        v("cfo", "approve", a, kp),
      ],
      { publicKeys: keys, threshold: 3, now: at }
    );
    expect(r.approvals).toBe(1); // one key counts once
    expect(r.cleared).toBe(false);
    expect(r.errors.join(" ")).toMatch(/multiple reviewer names/);
  });

  it("rejects a nonsensical threshold instead of clearing on an empty set", () => {
    const a = action();
    const r = reviewNofM(a, [], { publicKeys: keys, threshold: 0, now: at });
    expect(r.cleared).toBe(false);
    expect(r.errors.join(" ")).toMatch(/threshold/);
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
