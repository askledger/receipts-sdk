/**
 * End-to-end workflow primitives.
 *
 * The receipt pipeline (capture → policy → sign → timestamp → persist
 * → notify) is the spine of every Project Ledger deployment. Approval
 * workflows wrap high-risk operations.
 */

export {
  StateMachine,
  type Transition,
  type StateChangeRecord,
  WorkflowError,
} from "./state-machine.js";

export {
  runPipeline,
  type PipelineState,
  type PipelineOptions,
  type PipelineResult,
} from "./receipt-pipeline.js";

export {
  ApprovalWorkflow,
  type ApprovalState,
  type ApprovalRequest,
  type ApprovalDecision,
} from "./approval.js";
