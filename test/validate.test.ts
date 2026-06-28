/**
 * Tests for the input validation layer (src/validate.ts).
 *
 * These prove the SDK fails fast with clear errors when given malformed
 * input — production-grade behavior expected by any enterprise consumer.
 */

import { describe, it, expect } from "vitest";
import {
  validateEvent,
  validateKeyPair,
  ReceiptsValidationError,
  generateKeyPair,
  signReceipt,
} from "../src/index.js";
import type { RawEvent, KeyPair } from "../src/types.js";

function goodEvent(): RawEvent {
  return {
    schema_version: "1.0",
    tenant_id: "demo-tenant-01",
    event_type: "ide.completion",
    source_system: "test-runner",
    event_id: "evt-validate-001",
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
    },
  };
}

describe("validateEvent", () => {
  it("accepts a well-formed event", () => {
    expect(() => validateEvent(goodEvent())).not.toThrow();
  });

  it("rejects wrong schema_version", () => {
    const e = goodEvent();
    e.schema_version = "0.9";
    expect(() => validateEvent(e)).toThrow(ReceiptsValidationError);
    expect(() => validateEvent(e)).toThrow(/schema_version/);
  });

  it("rejects empty tenant_id", () => {
    const e = goodEvent();
    e.tenant_id = "";
    expect(() => validateEvent(e)).toThrow(/tenant_id/);
  });

  it("rejects tenant_id with forbidden chars", () => {
    const e = goodEvent();
    e.tenant_id = "evil tenant; DROP TABLE";
    expect(() => validateEvent(e)).toThrow(/tenant_id/);
  });

  it("rejects malformed event_type (no dots)", () => {
    const e = goodEvent();
    e.event_type = "ideEvent";
    expect(() => validateEvent(e)).toThrow(/event_type/);
  });

  it("rejects malformed event_type (uppercase)", () => {
    const e = goodEvent();
    e.event_type = "IDE.Completion";
    expect(() => validateEvent(e)).toThrow(/event_type/);
  });

  it("rejects empty source_system", () => {
    const e = goodEvent();
    e.source_system = "";
    expect(() => validateEvent(e)).toThrow(/source_system/);
  });

  it("rejects malformed captured_at", () => {
    const e = goodEvent();
    e.captured_at = "2026-05-13 10:00:00";
    expect(() => validateEvent(e)).toThrow(/captured_at/);
  });

  it("rejects invalid environment enum", () => {
    const e = goodEvent();
    e.context = { environment: "qa" as RawEvent["context"]["environment"] as never };
    expect(() => validateEvent(e)).toThrow(/environment/);
  });

  it("rejects invalid input_classification", () => {
    const e = goodEvent();
    e.payload = { input_classification: "top_secret" as never };
    expect(() => validateEvent(e)).toThrow(/input_classification/);
  });

  it("rejects invalid output_classification", () => {
    const e = goodEvent();
    e.payload = { output_classification: "spicy" as never };
    expect(() => validateEvent(e)).toThrow(/output_classification/);
  });

  it("accepts event without optional blocks", () => {
    const e = goodEvent();
    delete e.context;
    delete e.subject;
    delete e.payload;
    expect(() => validateEvent(e)).not.toThrow();
  });
});

describe("validateKeyPair", () => {
  it("accepts a valid keypair", () => {
    const k = generateKeyPair();
    expect(() => validateKeyPair(k)).not.toThrow();
  });

  it("rejects missing kid", () => {
    const k = generateKeyPair();
    (k as Partial<KeyPair>).kid = "";
    expect(() => validateKeyPair(k)).toThrow(/kid/);
  });

  it("rejects truncated public key", () => {
    const k = generateKeyPair();
    k.public_key = Buffer.from(new Uint8Array(16)).toString("base64");
    expect(() => validateKeyPair(k)).toThrow(/public_key/);
  });

  it("rejects truncated private key", () => {
    const k = generateKeyPair();
    k.private_key = Buffer.from(new Uint8Array(16)).toString("base64");
    expect(() => validateKeyPair(k)).toThrow(/private_key/);
  });

  it("rejects invalid base64 key material", () => {
    const k = generateKeyPair();
    k.public_key = "!!!not-base64!!!";
    expect(() => validateKeyPair(k)).toThrow();
  });
});

describe("signReceipt validation integration", () => {
  it("fails fast on malformed event before any chain mutation", () => {
    const k = generateKeyPair();
    const e = goodEvent();
    e.event_type = "BAD UPPERCASE WITH SPACES";
    expect(() => signReceipt({ event: e, keypair: k })).toThrow(
      ReceiptsValidationError
    );
  });

  it("fails fast on malformed keypair before any chain mutation", () => {
    const k = generateKeyPair();
    k.public_key = "not-base64-at-all";
    expect(() => signReceipt({ event: goodEvent(), keypair: k })).toThrow();
  });
});
