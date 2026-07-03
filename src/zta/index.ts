/**
 * Zero Trust Architecture module.
 *
 * Reference implementation of the ZTA building blocks AskLedger
 * deployments use:
 *   - SPIFFE workload identity helpers
 *   - OPA policy decision client (every decision becomes a receipt)
 *
 * See docs/security/ZERO_TRUST_ARCHITECTURE.md for the full design.
 */

export {
  parseSpiffeId,
  spiffeIdToServiceId,
  authorizePeer,
  type SpiffeId,
  type X509Svid,
  type JwtSvid,
  type WorkloadApiClient,
} from "./spiffe.js";

export {
  OpaDecisionClient,
  type OpaDecisionRequest,
  type OpaDecisionResponse,
  type OpaClientOptions,
  type OpaPdpLike,
} from "./opa-client.js";
