import { describe, it, expect } from "vitest";
import { generateKeyPair, signReceipt, verifyReceipt } from "../src/index.js";
import type { RawEvent } from "../src/types.js";

const kp = generateKeyPair();
const publicKeys = { [kp.kid]: kp.public_key };

function event(): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: "acme",
    event_type: "ai.generation",
    source_system: "app",
    event_id: "e-1",
    captured_at: "2026-07-08T10:00:00.000Z",
    context: { environment: "production" },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      fine_tune_id: "ft-abc123",
      base_model: "claude-sonnet-4-6", // new
    },
    payload: { input_token_count: 100, output_token_count: 50 },
  };
}

describe("base_model + extensions map", () => {
  it("carries base_model on the subject, signed and verifiable", () => {
    const r = signReceipt({ event: event(), keypair: kp });
    expect(r.receipt.event.subject?.base_model).toBe("claude-sonnet-4-6");
    expect(verifyReceipt(r, { publicKeys }).valid).toBe(true);
  });

  it("carries experimental attributes (data_provenance, compliance) in extensions, signed", () => {
    const r = signReceipt({
      event: event(),
      keypair: kp,
      extensions: {
        data_provenance: {
          sources: [{ source_id: "kb-2026", consent_status: "granted", hash: "sha256:src..." }],
        },
        compliance: { compliance_standard: "eu-ai-act", audit_ready: true },
      },
    });
    expect((r.receipt.extensions as any).compliance.compliance_standard).toBe("eu-ai-act");
    expect((r.receipt.extensions as any).data_provenance.sources[0].consent_status).toBe("granted");
    const v = verifyReceipt(r, { publicKeys });
    expect(v.checks.signature_valid).toBe(true);
    expect(v.checks.canonical_hash_matches).toBe(true);
  });

  it("tampering an extensions value breaks verification (it is signed)", () => {
    const r = signReceipt({ event: event(), keypair: kp, extensions: { compliance: { audit_ready: false } } });
    const tampered = structuredClone(r);
    (tampered.receipt.extensions as any).compliance.audit_ready = true;
    expect(verifyReceipt(tampered, { publicKeys }).checks.canonical_hash_matches).toBe(false);
  });

  it("stays backward compatible: no extensions field when unused", () => {
    const r = signReceipt({ event: event(), keypair: kp });
    expect(r.receipt.extensions).toBeUndefined();
    expect(verifyReceipt(r, { publicKeys }).valid).toBe(true);
  });
});
