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

  const pub = { [kp.kid]: kp.public_key };

  it("L1 Signed for a plain signed receipt whose signature verifies", async () => {
    const a = assuranceLevel(await sign(), { publicKeys: pub });
    expect(a.level).toBe("L1");
    expect(a.name).toBe("Signed");
  });

  it("stays L0 when no keys are supplied, because nothing was actually checked", async () => {
    // The ladder used to grant L1 for `signatures.length > 0`, i.e. for the
    // PRESENCE of a signature rather than a valid one.
    const a = assuranceLevel(await sign());
    expect(a.level).toBe("L0");
    expect(a.reasons.join(" ")).toMatch(/signatures were NOT checked/);
  });

  it("a forged signature over a tampered body is L0, not L1", async () => {
    const good = await sign();
    const forged = {
      ...good,
      receipt: { ...good.receipt, event: { ...good.receipt.event, event_type: "loan.approved" } },
    };
    expect(assuranceLevel(forged, { publicKeys: pub }).level).toBe("L0");
  });

  it("L2 Attested when the signing key is declared HSM/KMS-backed", async () => {
    const a = assuranceLevel(await sign(), { attestedKids: [kp.kid], publicKeys: pub });
    expect(a.level).toBe("L2");
    expect(a.name).toBe("Attested");
  });

  it("L3 Anchored only when the anchor was independently verified", async () => {
    const stamped = await timestampReceipt(await sign(), new StubTSAClient("tsa"));
    const a = assuranceLevel(stamped, { attestedKids: [kp.kid], publicKeys: pub, verifiedAnchor: true });
    expect(a.level).toBe("L3");
    expect(a.name).toBe("Anchored");
    expect(a.criteria).toMatchObject({ signed: true, attested: true, anchored: true });
  });

  it("an attached but unverified timestamp does NOT reach L3", async () => {
    // `timestamps` sits OUTSIDE the signed bytes, so anyone can append one to an
    // untouched receipt with no key access. Presence alone used to promote L2 to L3.
    const stamped = await timestampReceipt(await sign(), new StubTSAClient("tsa"));
    const a = assuranceLevel(stamped, { attestedKids: [kp.kid], publicKeys: pub });
    expect(a.level).toBe("L2");
    expect(a.reasons.join(" ")).toMatch(/not independently verified/);
  });

  it("a self-minted anchor bolted onto a receipt cannot lift it past L2", async () => {
    const good = await sign();
    const bolted = { ...good, timestamps: [{ tsa: "DigiCert TSA", timestamp_token: "Zm9yZ2Vk" }] };
    expect(assuranceLevel(bolted, { attestedKids: [kp.kid], publicKeys: pub }).level).toBe("L2");
  });

  it("anchored but not attested stays L1 (the ladder is cumulative)", async () => {
    const stamped = await timestampReceipt(await sign(), new StubTSAClient("tsa"));
    expect(assuranceLevel(stamped, { publicKeys: pub, verifiedAnchor: true }).level).toBe("L1");
  });
});
