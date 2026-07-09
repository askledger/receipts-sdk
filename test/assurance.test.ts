import { describe, it, expect } from "vitest";
import {
  signReceiptWithStore,
  timestampReceipt,
  StubTSAClient,
  assuranceLevel,
  checkRules,
  generateKeyPair,
} from "../src/index.js";
import { MemoryChainStateStore } from "../src/chain-store.js";
import type { RawEvent, PolicyContext } from "../src/types.js";

const kp = generateKeyPair();
const at = "2026-06-01T00:00:00.000Z";
const evt = (): RawEvent => ({
  schema_version: "1.0",
  tenant_id: "acme",
  event_type: "loan.decision",
  source_system: "underwriting",
  event_id: "e1",
  captured_at: at,
  subject: { ai_vendor: "openai", ai_model: "gpt-5" },
});

const policy: PolicyContext = {
  domain: "loan_decision",
  applied_rules: [
    { rule_id: "min_score", mathematical_form: "credit_score >= 650" },
    { rule_id: "max_dti", mathematical_form: "debt_ratio <= 0.43" },
  ],
};

describe("Layer 3 — rule engine", () => {
  it("verifies when all rules pass", () => {
    const rc = checkRules(policy, { credit_score: 700, debt_ratio: 0.4 });
    expect(rc.status).toBe("verified");
    expect(rc.failed_rules).toEqual([]);
    expect(rc.verification.verification_type).toBe("rule_based");
  });

  it("fails and names the broken rule", () => {
    const rc = checkRules(policy, { credit_score: 600, debt_ratio: 0.4 });
    expect(rc.status).toBe("failed");
    expect(rc.failed_rules).toContain("min_score");
  });

  it("fails a rule whose value is missing", () => {
    const rc = checkRules(policy, { credit_score: 700 });
    expect(rc.status).toBe("failed");
    expect(rc.failed_rules).toContain("max_dti");
    expect(rc.evaluations.find((e) => e.rule_id === "max_dti")?.reason).toMatch(/missing value/);
  });

  it("supports string equality rules", () => {
    const p: PolicyContext = { applied_rules: [{ rule_id: "region", mathematical_form: 'region == "EU"' }] };
    expect(checkRules(p, { region: "EU" }).status).toBe("verified");
    expect(checkRules(p, { region: "US" }).status).toBe("failed");
  });
});

// Ladder matches /trust/assurance-levels: L0 Declared, L1 Signed, L2 Attested, L3 Anchored.
describe("Layer 3 — assurance ladder (Declared/Signed/Attested/Anchored)", () => {
  const sign = () => signReceiptWithStore({ event: evt(), keypair: kp }, new MemoryChainStateStore());

  it("L0 Declared for an unsigned record", async () => {
    const stripped = { ...(await sign()), signatures: [] };
    const a = assuranceLevel(stripped);
    expect(a.level).toBe("L0");
    expect(a.name).toBe("Declared");
  });

  it("L1 Signed for a plain signed receipt", async () => {
    const a = assuranceLevel(await sign());
    expect(a.level).toBe("L1");
    expect(a.name).toBe("Signed");
  });

  it("L2 Attested when the signing key is declared HSM/KMS-backed", async () => {
    const a = assuranceLevel(await sign(), { attestedKids: [kp.kid] });
    expect(a.level).toBe("L2");
    expect(a.name).toBe("Attested");
  });

  it("L3 Anchored when attested AND externally timestamped", async () => {
    const stamped = await timestampReceipt(await sign(), new StubTSAClient("tsa"));
    const a = assuranceLevel(stamped, { attestedKids: [kp.kid] });
    expect(a.level).toBe("L3");
    expect(a.name).toBe("Anchored");
    expect(a.criteria).toMatchObject({ signed: true, attested: true, anchored: true });
  });

  it("anchored but not attested stays L1 (the ladder is cumulative)", async () => {
    const stamped = await timestampReceipt(await sign(), new StubTSAClient("tsa"));
    expect(assuranceLevel(stamped).level).toBe("L1");
  });
});
