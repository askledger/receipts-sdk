/**
 * SPIFFE workload identity helpers.
 *
 * Wraps the SPIRE Workload API for two operations:
 *   1. Fetch the current workload's SVID (X.509-SVID for mTLS or JWT-SVID for app-level)
 *   2. Validate an incoming peer SVID
 *
 * The SDK does not bundle the SPIRE binding. Callers pass an
 * implementation of WorkloadApiClient. This keeps the SDK small while
 * supporting any SPIFFE client (go-spiffe via WASM bridge, custom
 * gRPC, etc.).
 *
 * Reference: https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/
 */

export interface SpiffeId {
  /** e.g. "spiffe://example.com/payments/api" */
  uri: string;
  /** Trust domain — e.g. "example.com" */
  trustDomain: string;
  /** Path — e.g. "payments/api" */
  path: string;
}

export interface X509Svid {
  spiffeId: SpiffeId;
  certChainPem: string;
  privateKeyPem: string;
  /** Trust bundles for verifying peer SVIDs, keyed by trust domain. */
  bundlesByTrustDomain: Record<string, string>;
  /** Expiry as RFC 3339. */
  notAfter: string;
}

export interface JwtSvid {
  spiffeId: SpiffeId;
  token: string;
  /** Audience the token was minted for. */
  audience: string[];
  /** Expiry as RFC 3339. */
  expiresAt: string;
}

export interface WorkloadApiClient {
  fetchX509Svid(): Promise<X509Svid>;
  fetchJwtSvid(audience: string[]): Promise<JwtSvid>;
  /**
   * Validate a JWT-SVID issued by SPIRE. Returns the SPIFFE id on
   * success; throws on invalid/expired/wrong-audience.
   */
  validateJwtSvid(token: string, audience: string): Promise<SpiffeId>;
}

export function parseSpiffeId(uri: string): SpiffeId {
  const m = uri.match(/^spiffe:\/\/([^\/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid SPIFFE ID: ${uri}`);
  return { uri, trustDomain: m[1], path: m[2] };
}

/**
 * Convert a SPIFFE workload id into a stable `service_id` for the
 * receipts event context block. Receipts can then be queried by
 * SPIFFE identity at scale.
 */
export function spiffeIdToServiceId(id: SpiffeId): string {
  return id.uri;
}

/**
 * Authorize a peer SPIFFE id against an allowlist. Returns the matched
 * pattern or null. Patterns support `*` wildcards at path segment
 * boundaries: `spiffe://example.com/payments/*`.
 */
export function authorizePeer(
  peer: SpiffeId,
  allowedPatterns: string[]
): string | null {
  for (const pat of allowedPatterns) {
    const re = new RegExp(
      "^" +
        pat
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, "[^/]+") +
        "$"
    );
    if (re.test(peer.uri)) return pat;
  }
  return null;
}
