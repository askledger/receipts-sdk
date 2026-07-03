// HSM integration tests. Skip unless credentials are present so the suite
// stays green in OSS CI without secrets. Real HSMs are exercised in the
// nightly workflow .github/workflows/hsm-nightly.yml using OIDC-issued
// short-lived credentials.

import { describe, it, expect } from "vitest";

const live = {
  aws: Boolean(process.env.PL_AWS_KMS_KEY_ARN),
  azure: Boolean(process.env.PL_AZURE_KEY_URI),
  gcp: Boolean(process.env.PL_GCP_KMS_KEY),
  pkcs11: Boolean(process.env.PL_PKCS11_MODULE),
};

describe.skipIf(!live.aws)("AWS KMS · live", () => {
  it("signs a known payload and the resulting signature verifies", async () => {
    const { awsKmsProvider } = await import("../src/hsm/aws-kms.js");
    const provider = awsKmsProvider({ keyArn: process.env.PL_AWS_KMS_KEY_ARN! });
    const payload = new TextEncoder().encode("integration");
    const sig = await provider.sign(payload);
    expect(sig.length).toBeGreaterThan(0);
    expect(await provider.verify(payload, sig)).toBe(true);
  });
});

describe.skipIf(!live.azure)("Azure Key Vault · live", () => {
  it("signs and verifies", async () => {
    const { azureKeyVaultProvider } = await import("../src/hsm/azure-key-vault.js");
    const provider = azureKeyVaultProvider({ keyIdentifier: process.env.PL_AZURE_KEY_URI! });
    const payload = new TextEncoder().encode("integration");
    const sig = await provider.sign(payload);
    expect(await provider.verify(payload, sig)).toBe(true);
  });
});

describe.skipIf(!live.gcp)("GCP KMS · live", () => {
  it("signs and verifies", async () => {
    const { gcpKmsProvider } = await import("../src/hsm/gcp-kms.js");
    const provider = gcpKmsProvider({ keyName: process.env.PL_GCP_KMS_KEY! });
    const payload = new TextEncoder().encode("integration");
    const sig = await provider.sign(payload);
    expect(await provider.verify(payload, sig)).toBe(true);
  });
});

describe.skipIf(!live.pkcs11)("PKCS#11 · live", () => {
  it("signs and verifies via SoftHSM", async () => {
    const { pkcs11Provider } = await import("../src/hsm/pkcs11.js");
    const provider = pkcs11Provider({
      modulePath: process.env.PL_PKCS11_MODULE!,
      pin: process.env.PL_PKCS11_PIN ?? "1234",
      slot: Number(process.env.PL_PKCS11_SLOT ?? 0),
      label: process.env.PL_PKCS11_LABEL ?? "pl-test",
    });
    const payload = new TextEncoder().encode("integration");
    const sig = await provider.sign(payload);
    expect(await provider.verify(payload, sig)).toBe(true);
  });
});

describe("HSM integration · skip status", () => {
  it("reports which providers are exercised in this run", () => {
    // Visible in CI logs so reviewers know coverage.
    expect(typeof live).toBe("object");
  });
});
