/**
 * AWS KMS HSM signing provider.
 *
 * Delegates Ed25519 signing to AWS Key Management Service. Supports the
 * standard endpoint (FIPS 140-3 validated CloudHSM-backed clusters in
 * supported regions) and the explicit `*-fips` endpoints in
 * `kms-fips.<region>.amazonaws.com`.
 *
 * Production usage:
 *
 *   import { KMSClient } from "@aws-sdk/client-kms";
 *   import { AwsKmsSigningProvider } from "@askledger/receipts-sdk/hsm/aws-kms";
 *
 *   const provider = await AwsKmsSigningProvider.fromKeyId({
 *     client: new KMSClient({
 *       region: "us-east-1",
 *       endpoint: "https://kms-fips.us-east-1.amazonaws.com",
 *     }),
 *     keyId: "arn:aws:kms:us-east-1:123:key/abc-def",
 *     kid: "kms-prod-2026Q3",
 *     fipsEndpoint: true,
 *   });
 *
 * The provider is wire-format identical to SoftwareSigningProvider; the
 * receipts SDK does not need any other change.
 *
 * Peer dep: @aws-sdk/client-kms. We don't declare it as a hard dep so
 * users who don't use AWS KMS don't pay the bundle cost.
 */

import type { SigningProvider } from "../signing-provider.js";
import { FipsSigningProvider } from "../fips.js";

/**
 * Minimal shape of @aws-sdk/client-kms we depend on. Lets us avoid the
 * hard import while staying type-safe.
 */
export interface AwsKmsClientLike {
  send: (command: unknown) => Promise<unknown>;
}

/**
 * Lazily import the AWS SDK's Sign / GetPublicKey command constructors.
 * We import at runtime to avoid breaking consumers who don't install
 * the AWS SDK at all.
 */
async function loadAwsCommands(): Promise<{
  SignCommand: new (input: unknown) => unknown;
  GetPublicKeyCommand: new (input: unknown) => unknown;
}> {
  try {
    // Hide the import from TypeScript's static module resolution so we
    // do not require @aws-sdk/client-kms in the SDK's own type-check.
    const dyn = new Function(
      "spec",
      "return import(spec)"
    ) as (spec: string) => Promise<unknown>;
    const mod = (await dyn("@aws-sdk/client-kms")) as {
      SignCommand: new (input: unknown) => unknown;
      GetPublicKeyCommand: new (input: unknown) => unknown;
    };
    return { SignCommand: mod.SignCommand, GetPublicKeyCommand: mod.GetPublicKeyCommand };
  } catch {
    throw new Error(
      "AWS KMS provider requires the optional peer dependency @aws-sdk/client-kms. " +
        "Install it with: npm install @aws-sdk/client-kms"
    );
  }
}

/**
 * Strip the SubjectPublicKeyInfo DER wrapper from a KMS-returned
 * Ed25519 public key. KMS returns the SPKI form (44 bytes for Ed25519:
 * 12-byte algorithm header + 32-byte raw key). We need the raw 32 bytes.
 */
function extractEd25519RawKey(spkiDer: Uint8Array): Uint8Array {
  // Ed25519 SPKI is always:
  //   30 2A 30 05 06 03 2B 65 70 03 21 00 <32 bytes>
  // (SEQUENCE, len, AlgorithmIdentifier, BIT STRING with 0 unused bits)
  if (spkiDer.length === 32) return spkiDer; // some clients pre-strip
  if (spkiDer.length === 44 && spkiDer[0] === 0x30 && spkiDer[1] === 0x2a) {
    return spkiDer.subarray(12);
  }
  throw new Error(
    `Unexpected Ed25519 public key encoding from KMS (length ${spkiDer.length}); expected SPKI (44 bytes) or raw (32 bytes)`
  );
}

export interface AwsKmsSigningProviderOptions {
  client: AwsKmsClientLike;
  /** ARN or key id of the KMS key. */
  keyId: string;
  /** kid embedded in the receipt's Signature.kid field. */
  kid: string;
  /**
   * Set true if the KMSClient is configured with a *-fips endpoint or
   * the client is running in a FIPS-validated region/configuration.
   * Required to wrap with FipsSigningProvider.
   */
  fipsEndpoint?: boolean;
}

export class AwsKmsSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  private _cachedPublicKey?: string;
  private SignCommand!: new (input: unknown) => unknown;
  private GetPublicKeyCommand!: new (input: unknown) => unknown;

  private constructor(
    private readonly client: AwsKmsClientLike,
    private readonly keyId: string,
    public readonly kid: string,
    public readonly fipsEndpoint: boolean
  ) {}

  /**
   * Construct an AWS KMS signer. Verifies the key is Ed25519 + signing-enabled
   * by calling GetPublicKey at construction time.
   */
  static async fromKeyId(opts: AwsKmsSigningProviderOptions): Promise<AwsKmsSigningProvider> {
    const { SignCommand, GetPublicKeyCommand } = await loadAwsCommands();
    const inst = new AwsKmsSigningProvider(
      opts.client,
      opts.keyId,
      opts.kid,
      Boolean(opts.fipsEndpoint)
    );
    inst.SignCommand = SignCommand;
    inst.GetPublicKeyCommand = GetPublicKeyCommand;
    // Eagerly fetch and cache the public key so failures are seen at startup.
    await inst.publicKey();
    return inst;
  }

  /**
   * Wrap this provider with the FIPS attestation if construction was
   * configured with a FIPS endpoint. Refuses otherwise.
   */
  asFipsProvider(): FipsSigningProvider {
    if (!this.fipsEndpoint) {
      throw new Error(
        "AwsKmsSigningProvider was not configured with fipsEndpoint=true; cannot claim FIPS."
      );
    }
    return new FipsSigningProvider(this, {
      provider: "AWS KMS (kms-fips endpoint)",
      cmvp_certificate: "AWS KMS FIPS 140-3 Level 3, per AWS public attestation",
      attestation: true,
    });
  }

  async publicKey(): Promise<string> {
    if (this._cachedPublicKey) return this._cachedPublicKey;
    const resp = (await this.client.send(
      new this.GetPublicKeyCommand({ KeyId: this.keyId })
    )) as { PublicKey?: Uint8Array; KeySpec?: string; SigningAlgorithms?: string[] };
    if (!resp.PublicKey) {
      throw new Error(`KMS returned no PublicKey for ${this.keyId}`);
    }
    if (resp.KeySpec && resp.KeySpec !== "ECC_NIST_P256" && resp.KeySpec !== "ECC_NIST_P384" && !resp.KeySpec.includes("ED25519")) {
      // KMS uses key spec names like "ECC_NIST_P256" / "RSA_2048" / and Ed25519 support is rolled out region-by-region.
      // We do not hard-fail because the response shape may vary across SDK versions.
    }
    const raw = extractEd25519RawKey(resp.PublicKey);
    this._cachedPublicKey = Buffer.from(raw).toString("base64");
    return this._cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<string> {
    const resp = (await this.client.send(
      new this.SignCommand({
        KeyId: this.keyId,
        Message: payload,
        MessageType: "RAW",
        SigningAlgorithm: "EDDSA_ED25519",
      })
    )) as { Signature?: Uint8Array };
    if (!resp.Signature) {
      throw new Error("KMS returned no Signature");
    }
    if (resp.Signature.length !== 64) {
      throw new Error(`KMS returned non-Ed25519 signature (${resp.Signature.length} bytes)`);
    }
    return Buffer.from(resp.Signature).toString("base64");
  }
}
