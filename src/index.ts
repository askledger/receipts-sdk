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
export {
  validateEvent,
  validateKeyPair,
  ReceiptsValidationError,
} from "./validate.js";

// Production hardening modules (v0.2 surface)
export {
  type SigningProvider,
  SoftwareSigningProvider,
  HSMSigningProvider,
  type HSMConfig,
  signWithProvider,
} from "./signing-provider.js";
export {
  TSAClient,
  StubTSAClient,
  buildTimeStampReq,
  type TSAClientOptions,
} from "./tsa.js";
export {
  buildBatch,
  verifyInclusion,
  type MerkleBatch,
  type InclusionProof,
} from "./merkle.js";
export {
  type ChainStateStore,
  FileChainStateStore,
  MemoryChainStateStore,
  PostgresChainStateStore,
  ConcurrentChainWriteError,
  type PgPool,
} from "./chain-store.js";
export {
  KeyRegistry,
  type KeyRecord,
  type KeyStatus,
} from "./key-management.js";

// Auto-capture adapters (v0.2 surface)
export {
  wrapOpenAI,
  type OpenAIAdapterOptions,
} from "./adapters/openai.js";
export { wrapAnthropic } from "./adapters/anthropic.js";
export {
  withReceipts,
  type FetchAdapterOptions,
} from "./adapters/fetch.js";
export { ReceiptsCallbackHandler } from "./adapters/langchain.js";
export {
  type AdapterContext,
  captureAndSign,
} from "./adapters/common.js";

// FIPS posture + HSM providers (v0.3 surface)
export {
  FipsSigningProvider,
  isNodeOpensslFipsActive,
  requireFipsMode,
  type FipsPosture,
} from "./fips.js";
export {
  AwsKmsSigningProvider,
  type AwsKmsSigningProviderOptions,
  type AwsKmsClientLike,
  AzureKeyVaultSigningProvider,
  type AzureKeyVaultOptions,
  GcpKmsSigningProvider,
  type GcpKmsSigningProviderOptions,
  type GcpKmsClientLike,
  Pkcs11SigningProvider,
  type Pkcs11SigningProviderOptions,
  type Pkcs11ClientLike,
} from "./hsm/index.js";

// Zero Trust Architecture (v0.3 surface)
export {
  parseSpiffeId,
  spiffeIdToServiceId,
  authorizePeer,
  type SpiffeId,
  type X509Svid,
  type JwtSvid,
  type WorkloadApiClient,
  OpaDecisionClient,
  type OpaDecisionRequest,
  type OpaDecisionResponse,
  type OpaClientOptions,
  type OpaPdpLike,
} from "./zta/index.js";

// Workflows (v0.3 surface)
export {
  StateMachine,
  type Transition,
  type StateChangeRecord,
  WorkflowError,
  runPipeline,
  type PipelineState,
  type PipelineOptions,
  type PipelineResult,
  ApprovalWorkflow,
  type ApprovalState,
  type ApprovalRequest,
  type ApprovalDecision,
} from "./workflows/index.js";

// Evidence packs (v0.3 surface)
export {
  buildEvidencePack,
  verifyPackIntegrity,
  verifyAllReceiptsInPack,
  type EvidencePack,
  type EvidencePackMeta,
} from "./evidence/index.js";

// Content safety (Plane 4 · Pillar 6 — Shadow AI Discovery & Block)
export {
  scanPii,
  detectShadowAi,
  detectDeviation,
  evaluateContentSafety,
  scanPromptInjection,
  type PiiScanResult,
  type PiiFinding,
  type PiiCategory,
  type ShadowAiPolicy,
  type ShadowAiCheckInput,
  type ShadowAiResult,
  type ShadowAiReason,
  type DeviationCheckInput,
  type DeviationResult,
  type DeviationFinding,
  type DeviationCategory,
  type SafetyCheckInput,
  type SafetyVerdict,
  type SafetyVerdictResult,
  type SafetyPolicy,
  type InjectionCategory,
  type InjectionFinding,
  type InjectionResult,
} from "./safety/index.js";

// Policy templates (pre-built regulator mappings)
export {
  CBUAE_RESPONSIBLE_AI,
  EU_AI_ACT,
  SAMA_AI_GUIDANCE,
  ISO_42001,
  NIST_AI_RMF,
  HIPAA_SECURITY_RULE,
  FEDRAMP_NIST_AI,
  ISO_27001_AI,
  GDPR_AI,
  TEMPLATES,
  citeReceipt,
  citeAgainstAll,
  templateId,
  summarizeCoverage,
  formatCitation,
  type Regulator,
  type ControlPillar,
  type ControlArticle,
  type PolicyTemplate,
  type Citation,
} from "./policy-templates/index.js";

// Use-case + model registries
export {
  UseCaseRegistry,
  ModelRegistry,
  type UseCase,
  type UseCaseRiskTier,
  type UseCaseLifecycle,
  type ModelRegistration,
  type ValidationStatus,
} from "./registries/index.js";

// Public Transparency Log (Sigstore Rekor pattern for AI receipts)
export {
  TransparencyLog,
  type LogEntry,
  type SignedTreeHead,
  type InclusionProof as TLogInclusionProof,
  type ConsistencyProof,
} from "./transparency-log/index.js";

// Receipt Score (SSL-Labs-A+ for AI trust)
export {
  computeScore,
  computeBreakdown,
  renderBadgeSvg,
  type ScoreInput,
  type ScoreBreakdown,
  type ReceiptScore,
  type Grade,
} from "./receipt-score/index.js";

// Industry framework adapters (Bandar Naghi · QAG · QAIS · AI Agency)
export {
  QAG_FRAMEWORK,
  QAIS_FRAMEWORK,
  AI_AGENCY_FRAMEWORK,
  BANDAR_FRAMEWORKS,
  EXECUTIVE_PHILOSOPHY,
  ALL_INDUSTRY_FRAMEWORKS,
  applyAuthorContribution,
  frameworkAlignment,
  type IndustryFramework,
  type FrameworkComponent,
  type FrameworkAuthor,
  type AuthorVerificationState,
  type AuthorContribution,
} from "./frameworks/index.js";
