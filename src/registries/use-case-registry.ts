/**
 * AI Use-Case Registry, Credo AI pattern.
 *
 * Every AI use case in production is registered with an owner, a risk
 * tier, the regulatory frameworks in scope, and the approved model
 * versions. Receipts can carry `use_case_id` to link back to a use case.
 *
 * Registry entries are themselves tamper-evident: each entry has a
 * content hash that the SDK validates on every lookup. Changes to a
 * use case produce a new version with a new hash and a parent pointer
 * to the prior version, so the registry has its own append-only history.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import { canonicalizeBytes } from "../canonicalize.js";
import type { Regulator } from "../policy-templates/types.js";

export type UseCaseRiskTier =
  | "minimal"      // EU AI Act: minimal-risk
  | "limited"      // EU AI Act: limited-risk
  | "high"         // EU AI Act: high-risk
  | "unacceptable"; // EU AI Act: prohibited (registry will reject)

export type UseCaseLifecycle =
  | "design"
  | "validation"
  | "production"
  | "deprecated"
  | "retired";

export interface UseCase {
  /** Stable identifier. Use UUIDv7 in production. */
  id: string;
  /** Short human-readable name. */
  name: string;
  /** Description of the business purpose. */
  description: string;
  /** Named accountable executive, usually an email or directory id. */
  business_owner: string;
  /** Technical owner, usually an engineering lead. */
  technical_owner: string;
  /** Tenant scope. */
  tenant_id: string;
  /** Risk tier. */
  risk_tier: UseCaseRiskTier;
  /** Lifecycle stage. */
  lifecycle: UseCaseLifecycle;
  /** Regulatory frameworks in scope. */
  regulators: Regulator[];
  /** Approved model registry ids, only these models may serve this use case. */
  approved_model_ids: string[];
  /** Data classifications the use case is approved to process. */
  approved_data_classifications: ("public" | "internal" | "pii_redacted" | "pii" | "pci" | "mnpi")[];
  /** Approved source systems (corporate gateway, IDE plugin, etc.). */
  approved_source_systems: string[];
  /** Optional pointer to the previous registry version for audit history. */
  previous_version_hash?: string;
  /** Creation time. */
  created_at: string;
  /** Last update time. */
  updated_at: string;
}

export class UseCaseRegistry {
  private readonly entries = new Map<string, UseCase>();

  /**
   * Hash a use case entry for tamper detection. The hash itself is not
   * stored on the entry, registries are append-only, so the hash is
   * regenerated on read.
   */
  static entryHash(entry: UseCase): string {
    // RFC 8785, not JSON.stringify. Key order is not a property of the data, so
    // a plain stringify made this hash depend on how the object happened to be
    // built. `previous_version_hash` chains audit history on this value, so an
    // entry that round-tripped through anything that reorders keys (jsonb, a
    // JSON API, a re-parsed export) silently broke its own history chain, and
    // the break was indistinguishable from tampering.
    return Buffer.from(sha256Fn(canonicalizeBytes(entry))).toString("hex");
  }

  /** Register or update a use case. Returns the new entry hash. */
  upsert(entry: Omit<UseCase, "created_at" | "updated_at"> & Partial<Pick<UseCase, "created_at" | "updated_at">>): string {
    if (entry.risk_tier === "unacceptable") {
      throw new Error(`Use case ${entry.id} has risk_tier=unacceptable; refused by registry policy`);
    }
    const now = new Date().toISOString();
    const prior = this.entries.get(entry.id);
    const full: UseCase = {
      ...entry,
      created_at: prior?.created_at ?? entry.created_at ?? now,
      updated_at: now,
      previous_version_hash: prior ? UseCaseRegistry.entryHash(prior) : undefined,
    } as UseCase;
    this.entries.set(entry.id, full);
    return UseCaseRegistry.entryHash(full);
  }

  /** Get a use case by id. */
  get(id: string): UseCase | undefined {
    return this.entries.get(id);
  }

  /** List all use cases. */
  list(): UseCase[] {
    return [...this.entries.values()];
  }

  /**
   * Validate that a receipt's event is consistent with the registered
   * use case. Returns structured findings, the caller decides what to
   * do with them.
   */
  validateUsage(
    useCaseId: string,
    input: {
      ai_vendor?: string;
      ai_model?: string;
      model_id?: string;
      source_system?: string;
      data_classification?: string;
    }
  ): { ok: boolean; reasons: string[] } {
    const uc = this.entries.get(useCaseId);
    if (!uc) return { ok: false, reasons: [`unknown_use_case:${useCaseId}`] };
    if (uc.lifecycle === "retired" || uc.lifecycle === "deprecated") {
      return { ok: false, reasons: [`use_case_lifecycle:${uc.lifecycle}`] };
    }
    const reasons: string[] = [];
    if (input.model_id && !uc.approved_model_ids.includes(input.model_id)) {
      reasons.push("model_not_approved_for_use_case");
    }
    if (
      input.source_system &&
      uc.approved_source_systems.length > 0 &&
      !uc.approved_source_systems.includes(input.source_system)
    ) {
      reasons.push("source_not_approved_for_use_case");
    }
    if (
      input.data_classification &&
      !uc.approved_data_classifications.includes(
        input.data_classification as UseCase["approved_data_classifications"][number]
      )
    ) {
      reasons.push("data_classification_above_approved_tier");
    }
    return { ok: reasons.length === 0, reasons };
  }
}
