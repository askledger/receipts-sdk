/**
 * Tests for the RFC 3161 TSA client and stub.
 *
 * We do not hit a live TSA in CI; we verify the request encoder shape
 * and the stub's deterministic output. A real-network test is opt-in.
 */

import { describe, it, expect } from "vitest";
import { buildTimeStampReq, TSAClient, StubTSAClient } from "../src/index.js";

describe("buildTimeStampReq", () => {
  it("produces a SEQUENCE starting with version INTEGER 1", () => {
    const imprint = new Uint8Array(32).fill(0xaa);
    const req = buildTimeStampReq(imprint);
    // First byte must be SEQUENCE (0x30)
    expect(req[0]).toBe(0x30);
    // Find the INTEGER for version = 1: 02 01 01
    let found = false;
    for (let i = 0; i < req.length - 2; i++) {
      if (req[i] === 0x02 && req[i + 1] === 0x01 && req[i + 2] === 0x01) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("embeds the SHA-256 OID 2.16.840.1.101.3.4.2.1", () => {
    const imprint = new Uint8Array(32);
    const req = buildTimeStampReq(imprint);
    // The OID DER bytes for 2.16.840.1.101.3.4.2.1
    const oidBytes = [0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01];
    let found = false;
    outer: for (let i = 0; i < req.length - oidBytes.length; i++) {
      for (let j = 0; j < oidBytes.length; j++) {
        if (req[i + j] !== oidBytes[j]) continue outer;
      }
      found = true;
      break;
    }
    expect(found).toBe(true);
  });

  it("embeds the message imprint as an OCTET STRING of 32 bytes", () => {
    const imprint = new Uint8Array(32).fill(0x42);
    const req = buildTimeStampReq(imprint);
    // Find OCTET STRING (0x04) of length 32 (0x20)
    let idx = -1;
    for (let i = 0; i < req.length - 2; i++) {
      if (req[i] === 0x04 && req[i + 1] === 0x20) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThan(0);
    // The 32 bytes after must all be 0x42
    for (let i = 0; i < 32; i++) {
      expect(req[idx + 2 + i]).toBe(0x42);
    }
  });

  it("rejects non-32-byte imprints", () => {
    expect(() => buildTimeStampReq(new Uint8Array(20))).toThrow();
  });
});

describe("StubTSAClient", () => {
  it("returns a token containing imprint + timestamp", async () => {
    const stub = new StubTSAClient();
    const payload = new TextEncoder().encode("hello");
    const token = await stub.timestamp(payload);
    expect(token.tsa).toBe("stub-tsa");
    const decoded = JSON.parse(Buffer.from(token.timestamp_token, "base64").toString());
    expect(decoded.stub).toBe(true);
    expect(decoded.imprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("TSAClient with mocked fetch", () => {
  it("POSTs application/timestamp-query and returns the response bytes", async () => {
    const captured: { url?: string; body?: Uint8Array; ct?: string } = {};
    const fakeResponseBytes = new Uint8Array([0x30, 0x80, 0x02, 0x01, 0x00]);
    const mockFetch: typeof fetch = async (url, init) => {
      captured.url = String(url);
      captured.body = init?.body as Uint8Array;
      captured.ct = (init?.headers as Record<string, string>)?.["Content-Type"];
      return new Response(fakeResponseBytes, { status: 200 });
    };
    const client = new TSAClient({
      url: "https://example/tsr",
      fetchImpl: mockFetch,
    });
    const token = await client.timestamp(new TextEncoder().encode("payload"));
    expect(token.tsa).toBe("https://example/tsr");
    expect(captured.url).toBe("https://example/tsr");
    expect(captured.ct).toBe("application/timestamp-query");
    expect(Buffer.from(token.timestamp_token, "base64")).toEqual(
      Buffer.from(fakeResponseBytes)
    );
  });

  it("throws on non-200 TSA responses", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("rejected", { status: 503 });
    const client = new TSAClient({
      url: "https://example/tsr",
      fetchImpl: mockFetch,
    });
    await expect(
      client.timestamp(new TextEncoder().encode("payload"))
    ).rejects.toThrow();
  });
});
