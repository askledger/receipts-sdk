/**
 * Tests for the SigningProvider abstraction.
 */

import { describe, it, expect } from "vitest";
import {
  SoftwareSigningProvider,
  HSMSigningProvider,
  signWithProvider,
  canonicalize,
  verify as edVerify,
} from "../src/index.js";

describe("SoftwareSigningProvider", () => {
  it("generates a fresh keypair and signs deterministically against itself", async () => {
    const p = await SoftwareSigningProvider.generate();
    const payload = new TextEncoder().encode(canonicalize({ a: 1, b: 2 }));
    const sig = await signWithProvider(payload, p);
    expect(sig.alg).toBe("EdDSA");
    expect(sig.kid).toBe(p.kid);
    expect(edVerify(payload, sig.sig, await p.publicKey())).toBe(true);
  });

  it("two providers produce different signatures", async () => {
    const p1 = await SoftwareSigningProvider.generate();
    const p2 = await SoftwareSigningProvider.generate();
    const payload = new TextEncoder().encode("hello");
    const s1 = await p1.sign(payload);
    const s2 = await p2.sign(payload);
    expect(s1).not.toBe(s2);
    expect(edVerify(payload, s1, await p1.publicKey())).toBe(true);
    expect(edVerify(payload, s1, await p2.publicKey())).toBe(false);
  });

  it("fromKeyPair restores the same signer", async () => {
    const p1 = await SoftwareSigningProvider.generate();
    const kp = p1.exportKeyPair();
    const p2 = SoftwareSigningProvider.fromKeyPair(kp);
    const payload = new TextEncoder().encode("roundtrip");
    const s1 = await p1.sign(payload);
    const s2 = await p2.sign(payload);
    expect(s1).toBe(s2);
  });
});

describe("HSMSigningProvider", () => {
  it("delegates to the supplied HSM callbacks", async () => {
    const sw = await SoftwareSigningProvider.generate();
    const pubBytes = Buffer.from(await sw.publicKey(), "base64");
    const calls = { sign: 0, pk: 0 };
    const hsm = new HSMSigningProvider({
      kid: "fake-hsm-key",
      handle: { stub: true },
      signWithHsm: async (payload) => {
        calls.sign++;
        const sigB64 = await sw.sign(payload);
        return Buffer.from(sigB64, "base64");
      },
      publicKeyFromHsm: async () => {
        calls.pk++;
        return pubBytes;
      },
    });
    const payload = new TextEncoder().encode("from-hsm");
    const sig = await hsm.sign(payload);
    expect(calls.sign).toBe(1);
    expect(edVerify(payload, sig, await hsm.publicKey())).toBe(true);
    expect(calls.pk).toBeGreaterThan(0);
  });
});
