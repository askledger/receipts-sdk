/**
 * Auto-capture adapters for popular AI runtimes.
 *
 * Each adapter is a thin wrapper that emits a signed receipt for every
 * AI invocation without requiring changes to your application code.
 */

export * from "./common.js";
export { wrapOpenAI, type OpenAIAdapterOptions } from "./openai.js";
export { wrapAnthropic } from "./anthropic.js";
export { withReceipts, type FetchAdapterOptions } from "./fetch.js";
export { ReceiptsCallbackHandler } from "./langchain.js";
export { attachAgentReceipts, type AgentsEmitter } from "./openai-agents.js";
export { plLlamaIndexHandler } from "./llamaindex.js";
export { plMastraListener } from "./mastra.js";
export { plReceiptsMiddleware } from "./vercel-ai.js";
