/**
 * Project Ledger — Receipts SDK
 *
 * Cryptographic AI Decision Receipts for enterprise AI.
 *
 * Quick start:
 *
 *   import { signReceipt, verifyReceipt, generateKeyPair } from "@projectledger/receipts-sdk";
 *
 *   const kp = generateKeyPair();
 *   const signed = signReceipt({
 *     event: {
 *       schema_version: "1.0",
 *       tenant_id: "tenant-001",
 *       event_type: "ide.completion",
 *       source_system: "vs-code-plugin",
 *       event_id: "evt-123",
 *       captured_at: new Date().toISOString(),
 *       subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
 *     },
 *     keypair: kp,
 *   });
 *
 *   const result = verifyReceipt(signed, {
 *     publicKeys: { [kp.kid]: kp.public_key },
 *   });
 *   console.log(result.valid); // true
 */

export * from "./types.js";
export { canonicalize, canonicalizeBytes } from "./canonicalize.js";
export { sha256, sha256String, generateKeyPair, sign, verify } from "./crypto.js";
export {
  loadChainState,
  saveChainState,
  advanceChain,
} from "./chain.js";
export {
  signReceipt,
  canonicalSigningPayload,
  canonicalHashingPayload,
  prettySignedReceipt,
  canonicalSignedReceipt,
} from "./receipt.js";
export { verifyReceipt, type VerifyResult, type VerifyOptions } from "./verify.js";
