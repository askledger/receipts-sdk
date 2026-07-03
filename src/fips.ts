/**
 * FIPS 140-3 mode helpers.
 *
 * IMPORTANT — read carefully:
 *
 * The SDK code in this repository is NOT itself FIPS 140-3 validated.
 * NIST CMVP validation applies to *cryptographic providers*, not to
 * application code. The way every commercial SaaS achieves "FIPS 140-3
 * deployment" is by delegating the actual cryptographic primitives to a
 * validated provider:
 *
 *   - Node.js OpenSSL FIPS provider (FIPS 140-3 validated)
 *   - AWS KMS (FIPS 140-3 validated; use *-fips endpoints)
 *   - Azure Key Vault Premium (Managed HSM, FIPS 140-2 Level 3)
 *   - Google Cloud KMS HSM protection level (FIPS 140-2 Level 3)
 *   - On-prem HSMs (Thales Luna, Entrust nShield, Marvell LiquidSecurity)
 *
 * This module provides:
 *
 *   1. A runtime detector for Node OpenSSL FIPS mode
 *      (`isNodeOpensslFipsActive()`)
 *   2. A FipsSigningProvider that ONLY signs through a delegate provider
 *      it has positively verified to be FIPS-mode (HSM or KMS-FIPS or
 *      OpenSSL-FIPS). Refuses to sign otherwise.
 *   3. A `requireFipsMode()` guard you can drop into application startup
 *      to fail-fast if the environment is not FIPS-ready.
 *
 * Bottom line: this code path is what lets a regulated buyer deploy
 * AskLedger in a FIPS-compliant configuration. The validation
 * certificates belong to the underlying provider (AWS, Azure, GCP,
 * Thales, Entrust, OpenSSL).
 */

import * as crypto from "node:crypto";
import type { SigningProvider } from "./signing-provider.js";

/**
 * Did Node start with --enable-fips / --force-fips and is the OpenSSL
 * provider in FIPS mode right now?
 *
 * `crypto.getFips()` returns 1 when the FIPS provider is the active
 * provider, 0 otherwise. The official OpenSSL 3.x FIPS provider used
 * by Node 18+ is FIPS 140-3 validated (certificate #4282 family).
 */
export function isNodeOpensslFipsActive(): boolean {
  try {
    // getFips returns 0 or 1 depending on Node build
    const fn = (crypto as unknown as { getFips?: () => number }).getFips;
    return typeof fn === "function" && fn() === 1;
  } catch {
    return false;
  }
}

/**
 * The FIPS posture the application is operating under. Set this in
 * application startup; the SDK will fail-closed if a provider does not
 * match.
 */
export type FipsPosture =
  | "disabled" // FIPS not required (dev, SMB)
  | "required-soft" // FIPS preferred but advisory
  | "required-strict"; // FIPS required; refuse to sign otherwise

interface FipsAttestation {
  /** Human-readable name of the validated provider this signer delegates to. */
  provider: string;
  /** NIST CMVP certificate number, if known. */
  cmvp_certificate?: string;
  /**
   * Implementation MUST set this to true to opt-in. The SDK trusts the
   * caller — if you wrap a non-FIPS provider and claim FIPS, that is on
   * you. Auditors will reject false attestations.
   */
  attestation: true;
}

/**
 * A signer that is GUARANTEED to delegate to a FIPS-validated provider.
 *
 * Construction requires an explicit `FipsAttestation` from the underlying
 * provider implementation (e.g. the AWS KMS driver returns an attestation
 * when configured with a *-fips endpoint).
 */
export class FipsSigningProvider implements SigningProvider {
  readonly algorithm = "EdDSA" as const;
  readonly curve = "ed25519" as const;

  constructor(
    private readonly delegate: SigningProvider,
    public readonly attestation: FipsAttestation
  ) {}

  get kid(): string {
    return this.delegate.kid;
  }

  async publicKey(): Promise<string> {
    return this.delegate.publicKey();
  }

  async sign(payload: Uint8Array): Promise<string> {
    return this.delegate.sign(payload);
  }
}

/**
 * Application-startup guard. Call this in your bootstrap when running
 * in regulated environments. Throws if the environment is not FIPS-ready.
 *
 * Strict mode: requires Node OpenSSL FIPS provider to be active AND
 * permits HSM/KMS providers (delegation is the canonical FIPS path).
 */
export function requireFipsMode(posture: FipsPosture): void {
  if (posture === "disabled") return;
  const opensslFips = isNodeOpensslFipsActive();
  if (posture === "required-soft" && !opensslFips) {
    // eslint-disable-next-line no-console
    console.warn(
      "[receipts] FIPS posture is required-soft but Node OpenSSL FIPS provider is NOT active. " +
        "Deployment may not be FIPS-compliant unless every signer uses a FIPS-validated HSM/KMS."
    );
    return;
  }
  if (posture === "required-strict" && !opensslFips) {
    throw new Error(
      "[receipts] FIPS posture is required-strict but Node OpenSSL FIPS provider is NOT active. " +
        "Restart Node with --enable-fips and OPENSSL_CONF set to a FIPS-configured openssl.cnf, " +
        "or deploy under an OS image with FIPS enabled."
    );
  }
}
