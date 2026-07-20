/**
 * PKCS#11 signing provider, vendor-neutral HSM access.
 *
 * Works with any PKCS#11 v2.40 / v3.0 module:
 *   - Thales Luna / DPoD
 *   - Entrust nShield
 *   - AWS CloudHSM (via cloudhsm-pkcs11)
 *   - Marvell LiquidSecurity
 *   - YubiHSM 2
 *   - SoftHSM (testing only)
 *
 * The SDK does not depend on a specific PKCS#11 binding (graphene-pk11,
 * pkcs11js, node-pkcs11). The caller supplies a small adapter that
 * implements `Pkcs11ClientLike`. This pattern is identical to AWS KMS:
 * the SDK stays light, deployers bring their preferred binding.
 *
 * Production usage:
 *
 *   import { Pkcs11SigningProvider } from "@askledger/receipts-sdk/hsm/pkcs11";
 *   import { GrapheneAdapter } from "./graphene-adapter";  // your code
 *
 *   const provider = await Pkcs11SigningProvider.fromKeyLabel({
 *     client: new GrapheneAdapter("/usr/safenet/lunaclient/lib/libCryptoki2_64.so"),
 *     slotIndex: 0,
 *     tokenPin: process.env.HSM_PIN!,
 *     keyLabel: "receipts-signer-prod",
 *     kid: "hsm-prod-2026Q3",
 *   });
 */

import type { SigningProvider } from "../signing-provider.js";
import { FipsSigningProvider } from "../fips.js";

/**
 * The vendor-neutral PKCS#11 surface the SDK calls. Adapters wrap
 * actual PKCS#11 bindings (graphene-pk11, pkcs11js, etc.) to satisfy
 * this interface.
 */
export interface Pkcs11ClientLike {
  /**
   * Open a session against a slot, login with the user PIN, return an
   * opaque session handle.
   */
  openAndLogin(slotIndex: number, tokenPin: string): Promise<unknown>;

  /**
   * Find the object handle for an Ed25519 keypair by CKA_LABEL.
   * Returns {private_handle, public_handle}.
   */
  findKeyByLabel(
    session: unknown,
    label: string
  ): Promise<{ privateHandle: unknown; publicHandle: unknown }>;

  /**
   * Read CKA_EC_POINT for the public handle and return raw 32-byte
   * Ed25519 public key.
   */
  readEd25519PublicKey(session: unknown, publicHandle: unknown): Promise<Uint8Array>;

  /**
   * C_SignInit / C_Sign with CKM_EDDSA.
   * Returns the raw 64-byte signature.
   */
  signEdDSA(
    session: unknown,
    privateHandle: unknown,
    message: Uint8Array
  ): Promise<Uint8Array>;

  /** Close the session. */
  close(session: unknown): Promise<void>;
}

export interface Pkcs11SigningProviderOptions {
  client: Pkcs11ClientLike;
  slotIndex: number;
  tokenPin: string;
  keyLabel: string;
  kid: string;
  /**
   * Set true if the HSM module is FIPS 140-2/3 validated. Required to
   * wrap as FIPS. The deployer is asserting the validation; the SDK
   * cannot verify the certificate itself.
   */
  fipsValidated?: boolean;
  /** Optional: friendly name for the FIPS attestation. */
  fipsProvider?: string;
  /** Optional: NIST CMVP certificate number. */
  cmvpCertificate?: string;
}

export class Pkcs11SigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  private _cachedPublicKey?: string;
  private _session?: unknown;
  private _privateHandle?: unknown;
  private _publicHandle?: unknown;

  private constructor(
    private readonly opts: Pkcs11SigningProviderOptions,
    public readonly kid: string
  ) {
    // `opts` holds `tokenPin`, the HSM user PIN, and `private` is erased at
    // runtime. Serializing this provider (structured logger, APM breadcrumb,
    // error context, debug endpoint) would emit the PIN in clear text, and the
    // documented construction path reads it from process.env.HSM_PIN. The PIN
    // is the secret the entire FIPS story rests on, so it must never be
    // reachable by accidental serialization.
    Object.defineProperty(this, "opts", { enumerable: false });
  }

  /** Never serialize the HSM PIN or session handles. */
  toJSON(): Record<string, unknown> {
    return {
      kid: this.kid,
      slotIndex: this.opts.slotIndex,
      keyLabel: this.opts.keyLabel,
      tokenPin: "[redacted]",
    };
  }

  /** Keep the PIN out of console.log / util.inspect output too. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Pkcs11SigningProvider { kid: ${JSON.stringify(this.kid)}, tokenPin: [redacted] }`;
  }

  static async fromKeyLabel(opts: Pkcs11SigningProviderOptions): Promise<Pkcs11SigningProvider> {
    const inst = new Pkcs11SigningProvider(opts, opts.kid);
    await inst.ensureSession();
    await inst.publicKey();
    return inst;
  }

  private async ensureSession(): Promise<void> {
    if (this._session) return;
    this._session = await this.opts.client.openAndLogin(
      this.opts.slotIndex,
      this.opts.tokenPin
    );
    const { privateHandle, publicHandle } = await this.opts.client.findKeyByLabel(
      this._session,
      this.opts.keyLabel
    );
    this._privateHandle = privateHandle;
    this._publicHandle = publicHandle;
  }

  asFipsProvider(): FipsSigningProvider {
    if (!this.opts.fipsValidated) {
      throw new Error(
        "Pkcs11SigningProvider was not configured with fipsValidated=true."
      );
    }
    return new FipsSigningProvider(this, {
      provider: this.opts.fipsProvider ?? "PKCS#11 HSM (vendor-asserted)",
      cmvp_certificate: this.opts.cmvpCertificate,
      attestation: true,
    });
  }

  async publicKey(): Promise<string> {
    if (this._cachedPublicKey) return this._cachedPublicKey;
    await this.ensureSession();
    const raw = await this.opts.client.readEd25519PublicKey(
      this._session,
      this._publicHandle
    );
    if (raw.length !== 32) {
      throw new Error(`PKCS#11 returned non-Ed25519 public key (${raw.length} bytes)`);
    }
    this._cachedPublicKey = Buffer.from(raw).toString("base64");
    return this._cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<string> {
    await this.ensureSession();
    const sig = await this.opts.client.signEdDSA(
      this._session,
      this._privateHandle,
      payload
    );
    if (sig.length !== 64) {
      throw new Error(`PKCS#11 returned non-Ed25519 signature (${sig.length} bytes)`);
    }
    return Buffer.from(sig).toString("base64");
  }

  async close(): Promise<void> {
    if (this._session) {
      await this.opts.client.close(this._session);
      this._session = undefined;
    }
  }
}
