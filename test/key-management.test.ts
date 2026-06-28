/**
 * Tests for KeyRegistry — rotation, retirement, revocation, historical
 * verification windows.
 */

import { describe, it, expect } from "vitest";
import {
  KeyRegistry,
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "../src/index.js";
import type { RawEvent } from "../src/types.js";

function evt(tenant: string, n: number): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "key-mgmt-test",
    event_id: `${tenant}-${n}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "openai", ai_model: "gpt-5" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
}

describe("KeyRegistry", () => {
  it("returns active keys as trusted", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    expect(reg.trustedKeys()[k.kid]).toBe(k.public_key);
  });

  it("excludes revoked keys from trusted set", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    reg.revoke(k.kid, "compromised");
    expect(reg.trustedKeys()[k.kid]).toBeUndefined();
    expect(reg.get(k.kid)?.status).toBe("revoked");
  });

  it("retains retired keys in current trusted set, drops them when asked for a future time", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    const past = new Date("2026-05-01T00:00:00Z");
    reg.retire(k.kid, past);
    const after = new Date("2026-06-01T00:00:00Z");
    expect(reg.trustedKeys(after)[k.kid]).toBeUndefined();
    const before = new Date("2026-04-01T00:00:00Z");
    expect(reg.trustedKeys(before)[k.kid]).toBe(k.public_key);
  });

  it("verifyReceipt accepts the trusted set produced by the registry", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    const tenant = "kreg-" + Math.random().toString(36).slice(2);
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    const res = verifyReceipt(r, { publicKeys: reg.trustedKeys() });
    expect(res.valid).toBe(true);
  });

  it("verifyReceipt rejects a receipt signed by a revoked key", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    const tenant = "kreg-rev-" + Math.random().toString(36).slice(2);
    const r = signReceipt({ event: evt(tenant, 1), keypair: k });
    reg.revoke(k.kid, "key compromised");
    const res = verifyReceipt(r, { publicKeys: reg.trustedKeys() });
    expect(res.valid).toBe(false);
  });

  it("survives a JSON roundtrip via toJSON / fromJSON", () => {
    const reg = new KeyRegistry();
    const k = generateKeyPair();
    reg.add({
      kid: k.kid,
      public_key: k.public_key,
      algorithm: "EdDSA",
      curve: "ed25519",
    });
    const dumped = JSON.parse(JSON.stringify(reg.toJSON()));
    const restored = KeyRegistry.fromJSON(dumped);
    expect(restored.get(k.kid)?.public_key).toBe(k.public_key);
  });
});
