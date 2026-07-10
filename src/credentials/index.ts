// Document-credentials shell. This module exists to prove the
// substrate is AI-agnostic and to keep a 2027+ document-credentials
// expansion as a non-rebuild. It is intentionally minimal:
//   - One vertical implemented (employment salary slip).
//   - One issuer-side helper that produces a chainable RawEvent.
//   - One verifier-side helper that re-derives the document hash.
//
// Not exported from `src/index.ts`. Not surfaced in the console.
// Not in the public README. This is internal optionality only.

import { createHash } from "node:crypto";
import { canonicalize } from "../canonicalize.js";
import type { RawEvent } from "../types.js";

export type CredentialKind =
  | "credential.employment.salary_slip"
  | "credential.employment.offer_letter"
  | "credential.employment.verification"
  | "credential.employment.relieving"
  | "credential.finance.bank_statement"
  | "credential.finance.account_balance"
  | "credential.finance.income_tax_return"
  | "credential.education.degree"
  | "credential.education.transcript"
  | "credential.kyc.identity_attestation"
  | "credential.regulatory.attestation";

export type IssuerRole = "employer" | "bank" | "university" | "regulator";

export interface DataSubject {
  data_subject_id: string;          // hashed national id / stable handle
  data_subject_name_hash: string;
  jurisdiction: string;             // ISO 3166-1 alpha-2
}

export interface CredentialPayload {
  document_hash: string;
  document_type: string;            // MIME or schema id
  effective_from: string;           // RFC 3339
  effective_to?: string | null;
  statement: Record<string, string | number | boolean>;
  schema_id: string;                // pkg:askledger/credential-schema/...
}

export interface SalarySlip {
  employer_id: string;
  employee_id: string;              // tenant-internal id; hashed for receipts
  employee_name: string;
  period_start: string;
  period_end: string;
  gross_pay: number;
  net_pay: number;
  currency: string;                 // ISO 4217
  taxes: number;
  deductions: number;
  jurisdiction: string;
}

export function hashDocument(canonicalDocument: string): string {
  return createHash("sha256").update(canonicalDocument, "utf-8").digest("hex");
}

export function hashName(name: string): string {
  return createHash("sha256").update(name.normalize("NFKC").toLowerCase().trim(), "utf-8").digest("hex");
}

export function buildSalarySlipEvent(opts: {
  tenant_id: string;
  issuer_id: string;
  issuer_role: IssuerRole;
  slip: SalarySlip;
}): RawEvent {
  const canonicalDoc = canonicalize(opts.slip);
  const document_hash = hashDocument(canonicalDoc);

  return {
    schema_version: "1.0",
    tenant_id: opts.tenant_id,
    event_type: "credential.employment.salary_slip",
    source_system: "pl-credentials",
    event_id: `cred-${document_hash.slice(0, 16)}`,
    captured_at: new Date().toISOString(),
    context: {
      service_id: opts.issuer_id,
      correlation_id: opts.issuer_role,
    },
    subject: {
      ai_vendor: "n/a",
      ai_model: "n/a",
    },
    payload: {
      input_classification: "pii",
      metadata: {
        credential: {
          document_hash,
          document_type: "application/vnd.pl.salary-slip+json",
          effective_from: opts.slip.period_start,
          effective_to: opts.slip.period_end,
          statement: {
            gross_pay: opts.slip.gross_pay,
            net_pay: opts.slip.net_pay,
            currency: opts.slip.currency,
            taxes: opts.slip.taxes,
            deductions: opts.slip.deductions,
            jurisdiction: opts.slip.jurisdiction,
          },
          schema_id: "pkg:askledger/credential-schema/salary-slip@1",
          data_subject_id: createHash("sha256").update(opts.slip.employee_id).digest("hex"),
          data_subject_name_hash: hashName(opts.slip.employee_name),
        },
      },
    },
  };
}

/**
 * Returns true iff the supplied canonical document bytes produce the
 * same document_hash recorded on the event. This is how a verifier in
 * Singapore confirms a salary slip from a Mumbai employer, no third
 * party.
 */
export function verifyDocumentBinding(event: RawEvent, canonicalDocument: string): boolean {
  const credMeta = (event.payload?.metadata as { credential?: { document_hash?: string } } | undefined)?.credential;
  if (!credMeta?.document_hash) return false;
  return hashDocument(canonicalDocument) === credMeta.document_hash;
}
