/**
 * HSM driver tests.
 *
 * Each driver is exercised against a mocked client that mimics the
 * real cloud/HSM API surface (sufficient to prove call shape, response
 * parsing, FIPS attestation guards, and signing wire compatibility
 * with the rest of the SDK).
 *
 * No real cloud calls. Cross-language conformance against TS-software
 * signed receipts proves end-to-end byte fidelity.
 */

import { describe, it, expect } from "vitest";
import {
  SoftwareSigningProvider,
  AwsKmsSigningProvider,
  AzureKeyVaultSigningProvider,
  GcpKmsSigningProvider,
  Pkcs11SigningProvider,
  FipsSigningProvider,
  isNodeOpensslFipsActive,
  requireFipsMode,
  verify as edVerify,
} from "../src/index.js";

// ---------- AWS KMS ----------

describe("AwsKmsSigningProvider", () => {
  it("signs via a mocked KMSClient and produces a wire-compatible signature", async () => {
    const sw = await SoftwareSigningProvider.generate();
    const pubB64 = await sw.publicKey();
    const pubRaw = new Uint8Array(Buffer.from(pubB64, "base64"));
    // SPKI wrap the raw key (44 bytes)
    const spki = new Uint8Array([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
      ...pubRaw,
    ]);

    class MockSignCommand {
      constructor(public input: { Message?: Uint8Array; KeyId?: string }) {}
    }
    class MockGetPublicKeyCommand {
      constructor(public input: { KeyId?: string }) {}
    }

    const mockClient = {
      async send(cmd: { constructor: { name: string }; input: { Message?: Uint8Array; KeyId?: string } }) {
        if (cmd.constructor.name === "MockGetPublicKeyCommand") {
          return { PublicKey: spki, KeySpec: "ED25519" };
        }
        if (cmd.constructor.name === "MockSignCommand") {
          const sigB64 = await sw.sign(cmd.input.Message!);
          return { Signature: new Uint8Array(Buffer.from(sigB64, "base64")) };
        }
        throw new Error("unexpected command");
      },
    };

    // Avoid the dynamic @aws-sdk import by constructing directly.
    const provider = Object.create(AwsKmsSigningProvider.prototype) as AwsKmsSigningProvider;
    Object.assign(provider, {
      client: mockClient,
      keyId: "arn:aws:kms:test:000:key/test",
      kid: "kms-test",
      fipsEndpoint: true,
      SignCommand: MockSignCommand,
      GetPublicKeyCommand: MockGetPublicKeyCommand,
    });

    const recoveredPub = await provider.publicKey();
    expect(recoveredPub).toBe(pubB64);

    const payload = new TextEncoder().encode("hello kms");
    const sig = await provider.sign(payload);
    expect(edVerify(payload, sig, pubB64)).toBe(true);

    const fips = provider.asFipsProvider();
    expect(fips.attestation.provider).toMatch(/AWS KMS/);
  });

  it("refuses asFipsProvider() when not configured with fipsEndpoint", () => {
    const provider = Object.create(AwsKmsSigningProvider.prototype) as AwsKmsSigningProvider;
    Object.assign(provider, { fipsEndpoint: false, kid: "x" });
    expect(() => provider.asFipsProvider()).toThrow(/fipsEndpoint/);
  });
});

// ---------- Azure Key Vault ----------

describe("AzureKeyVaultSigningProvider", () => {
  it("signs via mocked KeyClient + CryptographyClient", async () => {
    const sw = await SoftwareSigningProvider.generate();
    const pubB64 = await sw.publicKey();
    const pubRaw = new Uint8Array(Buffer.from(pubB64, "base64"));

    const inst = Object.create(AzureKeyVaultSigningProvider.prototype) as AzureKeyVaultSigningProvider;
    const keyClient = {
      async getKey() {
        return { id: "https://v.vault/keys/k/v1", key: { kid: "kid1", x: pubRaw } };
      },
    };
    const cryptoClient = {
      async sign() {
        throw new Error("should not be called");
      },
      async signData(_alg: string, data: Uint8Array) {
        const sigB64 = await sw.sign(data);
        return { result: new Uint8Array(Buffer.from(sigB64, "base64")) };
      },
    };
    Object.assign(inst, {
      keyClient,
      cryptoClient,
      keyName: "k",
      keyVersion: "v1",
      kid: "akv-test",
      hsmBacked: true,
    });

    const payload = new TextEncoder().encode("hello azure");
    const sig = await inst.sign(payload);
    expect(edVerify(payload, sig, pubB64)).toBe(true);

    const fips = inst.asFipsProvider();
    expect(fips).toBeInstanceOf(FipsSigningProvider);
    expect(fips.attestation.provider).toMatch(/Azure/);
  });
});

// ---------- GCP KMS ----------

describe("GcpKmsSigningProvider", () => {
  it("signs via mocked KMS client and parses PEM SPKI", async () => {
    const sw = await SoftwareSigningProvider.generate();
    const pubB64 = await sw.publicKey();
    const pubRaw = new Uint8Array(Buffer.from(pubB64, "base64"));
    const spki = new Uint8Array([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
      ...pubRaw,
    ]);
    const pem =
      "-----BEGIN PUBLIC KEY-----\n" +
      Buffer.from(spki).toString("base64") +
      "\n-----END PUBLIC KEY-----\n";

    const inst = Object.create(GcpKmsSigningProvider.prototype) as GcpKmsSigningProvider;
    const client = {
      async getPublicKey() {
        return [{ pem, algorithm: "EC_SIGN_ED25519", protectionLevel: "HSM" }];
      },
      async asymmetricSign(req: { name: string; data?: Uint8Array }) {
        const sigB64 = await sw.sign(req.data!);
        return [{ signature: new Uint8Array(Buffer.from(sigB64, "base64")) }];
      },
    };
    Object.assign(inst, {
      client,
      name: "projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1",
      kid: "gcp-test",
      hsmBacked: true,
    });

    const recoveredPub = await inst.publicKey();
    expect(recoveredPub).toBe(pubB64);

    const payload = new TextEncoder().encode("hello gcp");
    const sig = await inst.sign(payload);
    expect(edVerify(payload, sig, pubB64)).toBe(true);

    const fips = inst.asFipsProvider();
    expect(fips.attestation.provider).toMatch(/Google/);
  });
});

// ---------- PKCS#11 ----------

describe("Pkcs11SigningProvider", () => {
  it("signs via a mocked PKCS#11 binding", async () => {
    const sw = await SoftwareSigningProvider.generate();
    const pubB64 = await sw.publicKey();
    const pubRaw = new Uint8Array(Buffer.from(pubB64, "base64"));

    let session: unknown = null;
    const client = {
      async openAndLogin() {
        session = { id: "s1" };
        return session;
      },
      async findKeyByLabel() {
        return { privateHandle: "priv", publicHandle: "pub" };
      },
      async readEd25519PublicKey() {
        return pubRaw;
      },
      async signEdDSA(_s: unknown, _h: unknown, msg: Uint8Array) {
        const sigB64 = await sw.sign(msg);
        return new Uint8Array(Buffer.from(sigB64, "base64"));
      },
      async close() {
        session = null;
      },
    };

    const provider = await Pkcs11SigningProvider.fromKeyLabel({
      client,
      slotIndex: 0,
      tokenPin: "1234",
      keyLabel: "test-key",
      kid: "pkcs11-test",
      fipsValidated: true,
      fipsProvider: "SoftHSM (TEST-ONLY)",
      cmvpCertificate: "n/a (test)",
    });
    expect(await provider.publicKey()).toBe(pubB64);
    const payload = new TextEncoder().encode("hello pkcs11");
    const sig = await provider.sign(payload);
    expect(edVerify(payload, sig, pubB64)).toBe(true);
    const fips = provider.asFipsProvider();
    expect(fips.attestation.attestation).toBe(true);
    await provider.close();
  });
});

// ---------- FIPS posture ----------

describe("FIPS posture", () => {
  it("isNodeOpensslFipsActive returns boolean", () => {
    expect(typeof isNodeOpensslFipsActive()).toBe("boolean");
  });

  it("requireFipsMode('disabled') is a no-op", () => {
    expect(() => requireFipsMode("disabled")).not.toThrow();
  });

  it("requireFipsMode('required-strict') throws when OpenSSL FIPS not active", () => {
    if (!isNodeOpensslFipsActive()) {
      expect(() => requireFipsMode("required-strict")).toThrow(/FIPS/);
    }
  });
});
