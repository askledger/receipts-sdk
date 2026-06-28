/**
 * Model Registry — ValidMind pattern.
 *
 * Every AI model that runs in production is registered with version,
 * validation status, owner, and provenance. Receipts can carry a
 * `model_id` to link back to a registered model entry.
 *
 * Validation states follow SR 11-7 / SR 26-2 norms used by US Fed-
 * supervised banks; they map cleanly to ISO 42001 §A.6.2.6.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";

export type ValidationStatus =
  | "development"       // not approved for any use
  | "validation"        // under validation; not for production
  | "approved"          // approved for production within scope
  | "approved_with_conditions" // approved but with caveats
  | "retired"           // no longer in use; receipts retained for audit
  | "revoked";          // forbidden — known issue, do not run

export interface ModelRegistration {
  /** Stable id within tenant. */
  id: string;
  tenant_id: string;
  /** Display name. */
  name: string;
  /** Vendor name. */
  vendor: string;
  /** Vendor-specific model identifier (e.g. claude-sonnet-4-6-20251201). */
  vendor_model_id: string;
  /** Specific version pinned for production. */
  version: string;
  /** What the model is approved to do. */
  capability: string;
  validation_status: ValidationStatus;
  /** Approved use-case ids this model serves. */
  approved_use_case_ids: string[];
  /** Model owner — usually an MRM (Model Risk Management) lead. */
  model_owner: string;
  /** Reference to the Sigstore Model Signing attestation, if any. */
  oms_attestation_url?: string;
  /** Optional risk score, 0..1, computed by the MRM team. */
  risk_score?: number;
  /** Free-form notes / validation report links. */
  notes?: string;
  /** Pointer to the prior version's hash for audit history. */
  previous_version_hash?: string;
  created_at: string;
  updated_at: string;
}

export class ModelRegistry {
  private readonly entries = new Map<string, ModelRegistration>();

  static entryHash(entry: ModelRegistration): string {
    return Buffer.from(
      sha256Fn(new TextEncoder().encode(JSON.stringify(entry)))
    ).toString("hex");
  }

  register(
    entry: Omit<ModelRegistration, "created_at" | "updated_at"> &
      Partial<Pick<ModelRegistration, "created_at" | "updated_at">>
  ): string {
    const now = new Date().toISOString();
    const prior = this.entries.get(entry.id);
    const full: ModelRegistration = {
      ...entry,
      created_at: prior?.created_at ?? entry.created_at ?? now,
      updated_at: now,
      previous_version_hash: prior ? ModelRegistry.entryHash(prior) : undefined,
    } as ModelRegistration;
    this.entries.set(entry.id, full);
    return ModelRegistry.entryHash(full);
  }

  get(id: string): ModelRegistration | undefined {
    return this.entries.get(id);
  }

  list(): ModelRegistration[] {
    return [...this.entries.values()];
  }

  /** Check whether a model is approved for production right now. */
  isApprovedForProduction(id: string): boolean {
    const m = this.entries.get(id);
    if (!m) return false;
    return m.validation_status === "approved" || m.validation_status === "approved_with_conditions";
  }

  /** Validate that this model can be used for the given use case. */
  validateAssignment(
    modelId: string,
    useCaseId: string
  ): { ok: boolean; reasons: string[] } {
    const m = this.entries.get(modelId);
    if (!m) return { ok: false, reasons: ["unknown_model"] };
    if (m.validation_status === "revoked") return { ok: false, reasons: ["model_revoked"] };
    if (m.validation_status === "retired") return { ok: false, reasons: ["model_retired"] };
    if (m.validation_status === "development" || m.validation_status === "validation") {
      return { ok: false, reasons: [`model_not_production_ready:${m.validation_status}`] };
    }
    if (!m.approved_use_case_ids.includes(useCaseId)) {
      return { ok: false, reasons: ["model_not_approved_for_use_case"] };
    }
    return { ok: true, reasons: [] };
  }
}
