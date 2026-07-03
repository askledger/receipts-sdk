/**
 * Public Transparency Log — Sigstore Rekor pattern for AI receipts.
 *
 * Operator deploys this as transparency.github.com/askledger/receipts-sdk. Anyone can
 * submit signed receipts (gated by submitter token in production), get
 * back an inclusion proof, and query the signed STH chain to verify
 * the log has not been rewritten.
 *
 * The transparency log is what makes AskLedger non-repudiable
 * even by us. We don't have to be trusted — we publish.
 */

export {
  TransparencyLog,
} from "./log.js";
export type {
  LogEntry,
  SignedTreeHead,
  InclusionProof,
  ConsistencyProof,
} from "./types.js";
