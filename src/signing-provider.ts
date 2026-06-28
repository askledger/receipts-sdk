/**
 * SigningProvider abstraction.
 *
 * The SDK does not assume any particular key custody model. Production
 * deployments plug in:
 *   - SoftwareSigningProvider (default, keys in-memory)
 *   - PKCS#11 / HSM provider (FIPS 140-3 Level 3 — e.g. CloudHSM, Thales)
 *   - AWS KMS provider (Asymmetric Sign API)
 *   - GCP KMS provider (asymmetricSign)
 *   - Azure Key Vault provider (sign)
 *   - SPIFFE SVID provider for workload identity
 *
 * The interface intentionally exposes only `sign` and metadata — never
 * the raw private key. An HSM-backed provider can implement this
 * interface without ever returning key bytes to memory.
 *
 * Backwards compatibility: the legacy `sign(payload, keypair)` function
 * in src/crypto.ts is preserved so existing code keeps working. New code
 * SHOULD use a SigningProvider.
 */

import * as ed from "@noble/ed25519";
import { randomBytes } from "node:crypto";
import type { KeyPair, Signature } from "./types.js";

/**
 * Minimal capability a signing backend must provide. The SDK's
 * sign + verify paths only ever call this interface.
 */
export interface SigningProvider {
  /**
   * Stable identifier for the key. Embedded into every receipt's
   * Signature.kid so verifiers can route to the right public key.
   */
  readonly kid: string;

  /** Always "EdDSA" for v0.1. Future-compatible field. */
  readonly algorithm: "EdDSA";

  /** Always "ed25519" for v0.1. Future-compatible field. */
  readonly curve: "ed25519";

  /** Base64-encoded 32-byte Ed25519 public key. */
  publicKey(): Promise<string>;

  /**
   * Sign the canonical bytes of a receipt body. Returns base64
   * standard encoding of the 64-byte Ed25519 signature.
   *
   * Implementations MUST NOT mutate `payload`.
   * Implementations SHOULD be constant-time.
   */
  sign(payload: Uint8Array): Promise<string>;
}

/**
 * Software backend — keys live in memory. Suitable for development,
 * local testing, browser playground, and SMB self-hosted deployments.
 *
 * NOT suitable for regulated BFSI production. Use an HSM-backed
 * provider in that environment.
 */
export class SoftwareSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  private constructor(
    public readonly kid: string,
    private readonly privateKey: Uint8Array,
    private readonly _publicKey: Uint8Array
  ) {}

  /**
   * Generate a fresh keypair backed by software. The private key
   * never leaves this process's memory.
   */
  static async generate(opts: { kid?: string } = {}): Promise<SoftwareSigningProvider> {
    const priv = ed.utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const kid = opts.kid ?? `sw-${Buffer.from(randomBytes(6)).toString("hex")}`;
    return new SoftwareSigningProvider(kid, priv, pub);
  }

  /**
   * Construct from existing keypair bytes (e.g. loaded from a vault).
   */
  static fromBytes(
    kid: string,
    privateKey: Uint8Array,
    publicKey: Uint8Array
  ): SoftwareSigningProvider {
    if (privateKey.length !== 32) {
      throw new Error(`Ed25519 private key must be 32 bytes, got ${privateKey.length}`);
    }
    if (publicKey.length !== 32) {
      throw new Error(`Ed25519 public key must be 32 bytes, got ${publicKey.length}`);
    }
    return new SoftwareSigningProvider(kid, privateKey, publicKey);
  }

  /**
   * Construct from a legacy KeyPair (base64) record.
   */
  static fromKeyPair(kp: KeyPair): SoftwareSigningProvider {
    return SoftwareSigningProvider.fromBytes(
      kp.kid,
      Buffer.from(kp.private_key, "base64"),
      Buffer.from(kp.public_key, "base64")
    );
  }

  async publicKey(): Promise<string> {
    return Buffer.from(this._publicKey).toString("base64");
  }

  async sign(payload: Uint8Array): Promise<string> {
    const sig = await ed.signAsync(payload, this.privateKey);
    return Buffer.from(sig).toString("base64");
  }

  /**
   * Export the keypair as the legacy KeyPair shape. Useful for
   * test setup; should NOT be used in production.
   */
  exportKeyPair(): KeyPair {
    return {
      kid: this.kid,
      public_key: Buffer.from(this._publicKey).toString("base64"),
      private_key: Buffer.from(this.privateKey).toString("base64"),
      algorithm: this.algorithm,
      curve: this.curve,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * HSM provider stub.
 *
 * This is the integration shape your PKCS#11 / CloudHSM / Thales adapter
 * implements. The reference SDK ships the stub; vendor-specific
 * integrations live in separate packages (e.g. @projectledger/hsm-aws,
 * @projectledger/hsm-thales) which depend on this interface.
 *
 * The stub exists so consumers can write code against the interface
 * today, and swap in a real HSM tomorrow with zero call-site changes.
 */
export interface HSMConfig {
  kid: string;
  /** Implementation-specific connection handle (PKCS#11 slot, KMS key ARN, etc.). */
  handle: unknown;
  /** Async function the integration package provides. */
  signWithHsm: (payload: Uint8Array, handle: unknown) => Promise<Uint8Array>;
  /** Async function returning the 32-byte public key. */
  publicKeyFromHsm: (handle: unknown) => Promise<Uint8Array>;
}

export class HSMSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  constructor(private readonly cfg: HSMConfig) {}

  get kid(): string {
    return this.cfg.kid;
  }

  async publicKey(): Promise<string> {
    const pk = await this.cfg.publicKeyFromHsm(this.cfg.handle);
    if (pk.length !== 32) {
      throw new Error(`HSM returned non-Ed25519 public key (${pk.length} bytes)`);
    }
    return Buffer.from(pk).toString("base64");
  }

  async sign(payload: Uint8Array): Promise<string> {
    const sig = await this.cfg.signWithHsm(payload, this.cfg.handle);
    if (sig.length !== 64) {
      throw new Error(`HSM returned non-Ed25519 signature (${sig.length} bytes)`);
    }
    return Buffer.from(sig).toString("base64");
  }
}

/**
 * Compose a Signature object the way `signReceipt()` expects it.
 * Useful when implementing custom sign pipelines.
 */
export async function signWithProvider(
  payload: Uint8Array,
  provider: SigningProvider
): Promise<Signature> {
  const sig = await provider.sign(payload);
  return {
    alg: provider.algorithm,
    kid: provider.kid,
    sig,
  };
}
