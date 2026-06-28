/**
 * Zero Trust module tests.
 */

import { describe, it, expect } from "vitest";
import {
  parseSpiffeId,
  spiffeIdToServiceId,
  authorizePeer,
  OpaDecisionClient,
  generateKeyPair,
  verifyReceipt,
} from "../src/index.js";

describe("SPIFFE helpers", () => {
  it("parses valid SPIFFE IDs", () => {
    const id = parseSpiffeId("spiffe://example.com/payments/api");
    expect(id.trustDomain).toBe("example.com");
    expect(id.path).toBe("payments/api");
  });

  it("rejects malformed SPIFFE IDs", () => {
    expect(() => parseSpiffeId("not-a-spiffe-id")).toThrow();
  });

  it("spiffeIdToServiceId returns the full URI", () => {
    const id = parseSpiffeId("spiffe://example.com/svc/x");
    expect(spiffeIdToServiceId(id)).toBe("spiffe://example.com/svc/x");
  });

  it("authorizePeer matches exact patterns", () => {
    const id = parseSpiffeId("spiffe://example.com/svc/x");
    expect(authorizePeer(id, ["spiffe://example.com/svc/x"])).toBe(
      "spiffe://example.com/svc/x"
    );
    expect(authorizePeer(id, ["spiffe://other/svc/x"])).toBeNull();
  });

  it("authorizePeer matches wildcards", () => {
    const id = parseSpiffeId("spiffe://example.com/svc/payments");
    expect(authorizePeer(id, ["spiffe://example.com/svc/*"])).toBe(
      "spiffe://example.com/svc/*"
    );
  });
});

describe("OpaDecisionClient", () => {
  it("emits a Project Ledger receipt for every decision", async () => {
    const kp = generateKeyPair();
    const got: unknown[] = [];

    const fakePdp = {
      async evaluate(req: { path: string; input: Record<string, unknown> }) {
        return {
          result: { allow: true, obligations: [] },
          bundle_hash: "abc123",
        };
      },
    };

    const client = new OpaDecisionClient({
      pdp: fakePdp,
      signingKey: kp,
      sourceSystem: "test:zta",
      onReceipt: (r) => {
        got.push(r);
      },
    });

    const tenant = "zta-" + Math.random().toString(36).slice(2);
    const res = await client.decide({
      policyPath: "platform/api/v1/authz",
      input: { user: "alice", action: "read" },
      tenantId: tenant,
    });
    expect(res.decision.allow).toBe(true);
    expect(res.receipt).not.toBeNull();
    expect(got.length).toBe(1);
    expect(
      verifyReceipt(res.receipt!, {
        publicKeys: { [kp.kid]: kp.public_key },
      }).valid
    ).toBe(true);
  });

  it("records block decision", async () => {
    const kp = generateKeyPair();
    const fakePdp = {
      async evaluate() {
        return {
          result: { allow: false, reason_codes: ["pii_in_prompt"] },
          bundle_hash: "abc123",
        };
      },
    };
    const client = new OpaDecisionClient({ pdp: fakePdp, signingKey: kp });
    const res = await client.decide({
      policyPath: "platform/api/v1/authz",
      input: {},
      tenantId: "tenant-block-" + Math.random().toString(36).slice(2),
    });
    expect(res.decision.allow).toBe(false);
    expect(res.receipt?.receipt.decision?.decision).toBe("block");
    expect(res.receipt?.receipt.decision?.reason_codes).toEqual(["pii_in_prompt"]);
  });
});
