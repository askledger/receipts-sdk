/**
 * AI use-case + model registries.
 *
 * Adopted patterns from Credo AI (use-case lifecycle) and ValidMind
 * (model validation status). Receipts can carry use_case_id + model_id
 * pointing at registered entries. Registry entries are content-
 * addressed so they are themselves tamper-evident.
 */

export {
  UseCaseRegistry,
  type UseCase,
  type UseCaseRiskTier,
  type UseCaseLifecycle,
} from "./use-case-registry.js";

export {
  ModelRegistry,
  type ModelRegistration,
  type ValidationStatus,
} from "./model-registry.js";
