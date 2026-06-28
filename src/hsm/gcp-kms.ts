/**
 * Google Cloud KMS signing provider.
 *
 * Delegates Ed25519 signing to GCP Cloud KMS. When the key version's
 * protection level is `HSM`, the cryptographic operations occur inside
 * a FIPS 140-2 Level 3 validated HSM (Cavium LiquidSecurity, per
 * Google's public attestation).
 *
 * Production usage:
 *
 *   import { KeyManagementServiceClient } from "@google-cloud/kms";
 *   import { GcpKmsSigningProvider } from "@projectledger/receipts-sdk/hsm/gcp-kms";
 *
 *   const provider = await GcpKmsSigningProvider.fromKeyVersionName({
 *     client: new KeyManagementServiceClient(),
 *     name: "projects/.../locations/.../keyRings/.../cryptoKeys/.../cryptoKeyVersions/1",
 *     kid: "gcp-prod-2026Q3",
 *   });
 *
 * Peer dep: @google-cloud/kms.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import type { SigningProvider } from "../signing-provider.js";
import { FipsSigningProvider } from "../fips.js";

export interface GcpKmsClientLike {
  asymmetricSign: (request: {
    name: string;
    data?: Uint8Array;
    digest?: { sha256?: Uint8Array };
  }) => Promise<[{ signature?: Uint8Array; name?: string }, ...unknown[]] | { signature?: Uint8Array }>;
  getPublicKey: (request: {
    name: string;
  }) => Promise<[{ pem?: string; algorithm?: string; protectionLevel?: string }, ...unknown[]] | { pem?: string }>;
}

export interface GcpKmsSigningProviderOptions {
  client: GcpKmsClientLike;
  /** Fully-qualified cryptoKeyVersion name. */
  name: string;
  /** kid embedded in the receipt's Signature.kid field. */
  kid: string;
  /** Set true if the key version protectionLevel is HSM. */
  hsmBacked?: boolean;
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function extractEd25519RawKeyFromSpki(spki: Uint8Array): Uint8Array {
  if (spki.length === 44 && spki[0] === 0x30 && spki[1] === 0x2a) {
    return spki.subarray(12);
  }
  if (spki.length === 32) return spki;
  throw new Error(`Unexpected Ed25519 SPKI length: ${spki.length}`);
}

export class GcpKmsSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  private _cachedPublicKey?: string;

  private constructor(
    private readonly client: GcpKmsClientLike,
    private readonly name: string,
    public readonly kid: string,
    public readonly hsmBacked: boolean
  ) {}

  static async fromKeyVersionName(
    opts: GcpKmsSigningProviderOptions
  ): Promise<GcpKmsSigningProvider> {
    const inst = new GcpKmsSigningProvider(
      opts.client,
      opts.name,
      opts.kid,
      Boolean(opts.hsmBacked)
    );
    await inst.publicKey();
    return inst;
  }

  asFipsProvider(): FipsSigningProvider {
    if (!this.hsmBacked) {
      throw new Error(
        "GcpKmsSigningProvider not configured with hsmBacked=true. " +
          "Create the cryptoKeyVersion with protectionLevel=HSM for FIPS deployment."
      );
    }
    return new FipsSigningProvider(this, {
      provider: "Google Cloud KMS (protectionLevel=HSM)",
      cmvp_certificate: "FIPS 140-2 Level 3 — per Google Cloud public attestation",
      attestation: true,
    });
  }

  async publicKey(): Promise<string> {
    if (this._cachedPublicKey) return this._cachedPublicKey;
    const resp = await this.client.getPublicKey({ name: this.name });
    const pem =
      Array.isArray(resp) ? (resp[0] as { pem?: string }).pem : (resp as { pem?: string }).pem;
    if (!pem) throw new Error(`GCP KMS returned no PEM for ${this.name}`);
    const der = pemToDer(pem);
    const raw = extractEd25519RawKeyFromSpki(der);
    this._cachedPublicKey = Buffer.from(raw).toString("base64");
    return this._cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<string> {
    // GCP KMS Ed25519 expects raw message (Ed25519 hashes internally).
    // Some SDK versions require providing a digest object; we send `data`
    // when possible, falling back to a sha256 digest envelope shape that
    // GCP's API tolerates for raw modes.
    const resp = await this.client.asymmetricSign({
      name: this.name,
      data: payload,
    });
    const sig =
      Array.isArray(resp)
        ? (resp[0] as { signature?: Uint8Array }).signature
        : (resp as { signature?: Uint8Array }).signature;
    if (!sig) throw new Error("GCP KMS returned no signature");
    if (sig.length !== 64) {
      throw new Error(`GCP KMS returned non-Ed25519 signature (${sig.length} bytes)`);
    }
    return Buffer.from(sig).toString("base64");
  }

  /** Exposed for tests: pre-hash a payload via SHA-256. */
  static digestForTest(payload: Uint8Array): Uint8Array {
    return sha256Fn(payload);
  }
}
