/**
 * Azure Key Vault Managed HSM signing provider.
 *
 * Delegates Ed25519 signing to Azure Key Vault. The Premium tier and
 * Managed HSM are FIPS 140-2 Level 3 validated. Standard tier is FIPS
 * 140-2 Level 1 — sufficient for many use cases but NOT for SR 26-2
 * / SAMA / CBUAE high-assurance scenarios.
 *
 * Production usage:
 *
 *   import { KeyClient, CryptographyClient } from "@azure/keyvault-keys";
 *   import { DefaultAzureCredential } from "@azure/identity";
 *   import { AzureKeyVaultSigningProvider } from "@projectledger/receipts-sdk/hsm/azure-key-vault";
 *
 *   const cred = new DefaultAzureCredential();
 *   const provider = await AzureKeyVaultSigningProvider.fromKeyId({
 *     vaultUrl: "https://my-vault.vault.azure.net",
 *     keyName: "receipts-signer",
 *     credential: cred,
 *     kid: "akv-prod-2026Q3",
 *     hsmBacked: true,    // set true when Managed HSM or Premium tier
 *   });
 *
 * Peer dep: @azure/keyvault-keys + @azure/identity.
 */

import type { SigningProvider } from "../signing-provider.js";
import { FipsSigningProvider } from "../fips.js";

export interface AzureKeyVaultOptions {
  vaultUrl: string;
  keyName: string;
  /** Optional specific key version. Defaults to latest. */
  keyVersion?: string;
  /** @azure/identity TokenCredential. */
  credential: unknown;
  kid: string;
  /**
   * Set true when the key resides in a Managed HSM or Premium-tier
   * vault (FIPS 140-2 Level 3). Required to wrap as FIPS.
   */
  hsmBacked?: boolean;
}

interface KeyClientLike {
  getKey: (
    name: string,
    options?: { version?: string }
  ) => Promise<{ key?: { kid?: string; x?: Uint8Array }; id?: string }>;
}

interface CryptographyClientLike {
  sign: (algorithm: string, digest: Uint8Array) => Promise<{ result: Uint8Array }>;
  signData: (algorithm: string, data: Uint8Array) => Promise<{ result: Uint8Array }>;
}

async function loadAzureKv(): Promise<{
  KeyClient: new (vaultUrl: string, credential: unknown) => KeyClientLike;
  CryptographyClient: new (key: string, credential: unknown) => CryptographyClientLike;
}> {
  try {
    const dyn = new Function(
      "spec",
      "return import(spec)"
    ) as (spec: string) => Promise<unknown>;
    const mod = (await dyn("@azure/keyvault-keys")) as {
      KeyClient: new (vaultUrl: string, credential: unknown) => KeyClientLike;
      CryptographyClient: new (key: string, credential: unknown) => CryptographyClientLike;
    };
    return { KeyClient: mod.KeyClient, CryptographyClient: mod.CryptographyClient };
  } catch {
    throw new Error(
      "Azure Key Vault provider requires @azure/keyvault-keys and @azure/identity. " +
        "Install with: npm install @azure/keyvault-keys @azure/identity"
    );
  }
}

export class AzureKeyVaultSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  private _cachedPublicKey?: string;

  private constructor(
    private readonly keyClient: KeyClientLike,
    private readonly cryptoClient: CryptographyClientLike,
    private readonly keyName: string,
    private readonly keyVersion: string | undefined,
    public readonly kid: string,
    public readonly hsmBacked: boolean
  ) {}

  static async fromKeyId(opts: AzureKeyVaultOptions): Promise<AzureKeyVaultSigningProvider> {
    const { KeyClient, CryptographyClient } = await loadAzureKv();
    const keyClient = new KeyClient(opts.vaultUrl, opts.credential);
    const key = await keyClient.getKey(opts.keyName, { version: opts.keyVersion });
    if (!key.id) {
      throw new Error(`Azure KV returned no id for key ${opts.keyName}`);
    }
    const cryptoClient = new CryptographyClient(key.id, opts.credential);
    const inst = new AzureKeyVaultSigningProvider(
      keyClient,
      cryptoClient,
      opts.keyName,
      opts.keyVersion,
      opts.kid,
      Boolean(opts.hsmBacked)
    );
    await inst.publicKey();
    return inst;
  }

  asFipsProvider(): FipsSigningProvider {
    if (!this.hsmBacked) {
      throw new Error(
        "AzureKeyVaultSigningProvider was not configured with hsmBacked=true. " +
          "Use a Managed HSM or Premium-tier vault for FIPS-validated deployment."
      );
    }
    return new FipsSigningProvider(this, {
      provider: "Azure Key Vault Managed HSM / Premium tier",
      cmvp_certificate: "FIPS 140-2 Level 3 — per Microsoft public attestation",
      attestation: true,
    });
  }

  async publicKey(): Promise<string> {
    if (this._cachedPublicKey) return this._cachedPublicKey;
    const key = await this.keyClient.getKey(this.keyName, { version: this.keyVersion });
    const raw = key.key?.x;
    if (!raw || raw.length !== 32) {
      throw new Error(
        `Azure KV returned unexpected Ed25519 public key (length ${raw?.length ?? "?"})`
      );
    }
    this._cachedPublicKey = Buffer.from(raw).toString("base64");
    return this._cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<string> {
    // EdDSA in Azure Key Vault is identified by the "EdDSA" algorithm
    // name on signData (which canonically uses the message, not a
    // pre-hashed digest, per Ed25519's spec).
    const resp = await this.cryptoClient.signData("EdDSA", payload);
    if (!resp.result || resp.result.length !== 64) {
      throw new Error(
        `Azure KV returned non-Ed25519 signature (${resp.result?.length ?? "?"} bytes)`
      );
    }
    return Buffer.from(resp.result).toString("base64");
  }
}
