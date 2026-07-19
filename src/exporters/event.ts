/**
 * Evidence export, normalization and SIEM wire formats.
 *
 * Enterprises already run a SIEM (Splunk, QRadar, Sentinel, Elastic). Their
 * analysts and auditors live there. This module turns a `SignedReceipt` into a
 * flat, SIEM-friendly event so evidence lands in the workflow a customer
 * already has, WITHOUT changing what a receipt is.
 *
 * The important property: the exported event carries `receipt_hash`, the
 * signing key id and (optionally) the full signed receipt, so a record sitting
 * in a mutable log platform can still be independently verified later. A SIEM
 * stores; the receipt is what makes the stored thing provable.
 *
 * Privacy stance: the raw event payload is business data, so it is EXCLUDED by
 * default. Callers opt in explicitly with `includePayload`.
 */

import { assuranceLevel } from "../assurance.js";
import type { SignedReceipt } from "../types.js";

/** A flat, SIEM-friendly projection of a signed receipt. */
export interface ExportEvent {
  receipt_id: string;
  tenant_id: string;
  issued_at: string;
  event_type: string;
  source_system: string;
  event_id: string;
  captured_at: string;
  chain_height: number;
  receipt_hash: string;
  previous_receipt_hash: string;
  /** True when at least one signature is present. */
  signed: boolean;
  signature_kid?: string;
  signature_alg?: string;
  ai_vendor?: string;
  ai_model?: string;
  /** Decision outcome, when the receipt carries one. */
  decision?: string;
  risk_score?: number;
  /** L0–L3 assurance grade, when `includeAssurance` is set. */
  assurance_level?: string;
  assurance_name?: string;
  /** Present only when `includePayload` is set. */
  payload?: Record<string, unknown>;
  /** Present only when `includeReceipt` is set, so the record stays verifiable. */
  receipt?: SignedReceipt;
}

export interface ToExportEventOptions {
  /** Embed the full signed receipt so the SIEM record remains verifiable. Default false. */
  includeReceipt?: boolean;
  /** Embed the raw event payload (business data). Default false. */
  includePayload?: boolean;
  /** Compute and attach the L0–L3 assurance grade. Default false. */
  includeAssurance?: boolean;
}

/** Project a signed receipt into a flat export event. Pure; input is not mutated. */
export function toExportEvent(
  signed: SignedReceipt,
  opts: ToExportEventOptions = {}
): ExportEvent {
  const r = signed.receipt;
  const sig = signed.signatures?.[0];
  const ev: ExportEvent = {
    receipt_id: r.receipt_id,
    tenant_id: r.tenant_id,
    issued_at: r.issued_at,
    event_type: r.event.event_type,
    source_system: r.event.source_system,
    event_id: r.event.event_id,
    captured_at: r.event.captured_at,
    chain_height: r.integrity.chain_height,
    receipt_hash: r.integrity.receipt_hash,
    previous_receipt_hash: r.integrity.previous_receipt_hash,
    signed: Boolean(signed.signatures && signed.signatures.length > 0),
  };
  if (sig) {
    ev.signature_kid = sig.kid;
    ev.signature_alg = sig.alg;
  }
  if (r.event.subject?.ai_vendor) ev.ai_vendor = r.event.subject.ai_vendor;
  if (r.event.subject?.ai_model) ev.ai_model = r.event.subject.ai_model;

  const outcome = r.decision_summary?.outcome ?? r.decision?.decision;
  if (outcome) ev.decision = outcome;
  if (typeof r.decision_summary?.risk_score === "number") {
    ev.risk_score = r.decision_summary.risk_score;
  }

  if (opts.includeAssurance) {
    const a = assuranceLevel(signed);
    ev.assurance_level = a.level;
    ev.assurance_name = a.name;
  }
  if (opts.includePayload && r.event.payload) {
    ev.payload = r.event.payload as Record<string, unknown>;
  }
  if (opts.includeReceipt) ev.receipt = signed;
  return ev;
}

/* --------------------------------------------------------------------------
 * Wire formats
 * ----------------------------------------------------------------------- */

/**
 * Collapse anything that could terminate a log record.
 *
 * A newline (or other control character) in an attacker-influenced field such
 * as `event_type` or `tenant_id` would otherwise let a forged CEF/syslog record
 * be injected into the customer's SIEM. For an evidence product, forging
 * records in the system of record is the exact threat we exist to prevent, so
 * every field is flattened to a single line before it reaches a wire format.
 */
function oneLine(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(v).replace(/[\r\n\u0000-\u001F\u007F]+/g, " ").trim();
}

/** Escape a value for a CEF extension field (ArcSight/QRadar ingestion). */
function cefEscape(v: unknown): string {
  return oneLine(v).replace(/\\/g, "\\\\").replace(/=/g, "\\=");
}

/** Escape the CEF header fields, where the separator is `|`. */
function cefHeaderEscape(v: string): string {
  return oneLine(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * ArcSight CEF (Common Event Format), widely ingested by QRadar, ArcSight and
 * Splunk. Severity is derived from the decision: a blocked or approval-gated
 * action is more interesting to a SOC than a routine allow.
 */
export function formatCEF(ev: ExportEvent, deviceVersion = "1.0"): string {
  const severity =
    ev.decision === "block" ? 8 : ev.decision === "require-approval" ? 6 : ev.decision === "flag" ? 5 : 3;
  const header = [
    "CEF:0",
    cefHeaderEscape("AskLedger"),
    cefHeaderEscape("Receipts"),
    cefHeaderEscape(deviceVersion),
    cefHeaderEscape(ev.event_type),
    cefHeaderEscape("AI decision receipt"),
    String(severity),
  ].join("|");

  const ext: Record<string, unknown> = {
    rt: Date.parse(ev.captured_at) || undefined,
    externalId: ev.receipt_id,
    deviceCustomString1: ev.tenant_id,
    deviceCustomString1Label: "tenantId",
    deviceCustomString2: ev.receipt_hash,
    deviceCustomString2Label: "receiptHash",
    deviceCustomString3: ev.ai_model,
    deviceCustomString3Label: "aiModel",
    deviceCustomNumber1: ev.chain_height,
    deviceCustomNumber1Label: "chainHeight",
    outcome: ev.decision,
    dvchost: ev.source_system,
    cs4: ev.assurance_level,
    cs4Label: "assuranceLevel",
  };
  const pairs = Object.entries(ext)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${cefEscape(v)}`);
  return `${header}|${pairs.join(" ")}`;
}

/**
 * RFC 5424 syslog. `structuredData` carries the receipt identity so a syslog
 * collector keeps the fields queryable rather than burying them in free text.
 */
export function formatSyslog5424(
  ev: ExportEvent,
  opts: { facility?: number; severity?: number; hostname?: string; appName?: string } = {}
): string {
  const facility = opts.facility ?? 10; // security/authorization
  const severity = opts.severity ?? (ev.decision === "block" ? 4 : 6); // warning : informational
  const pri = facility * 8 + severity;
  const host = (opts.hostname ?? "askledger").replace(/\s/g, "_");
  const app = (opts.appName ?? "receipts").replace(/\s/g, "_");
  // An unparseable issued_at must not throw: SyslogSink.format() is called
  // outside the try in sinks.ts, so a RangeError here would escape as an
  // exception instead of the reported SinkResult this module promises.
  const parsed = Date.parse(ev.issued_at);
  const ts = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();

  const sdEscape = (v: string): string => oneLine(v).replace(/([\]"\\])/g, "\\$1");
  const sdParams: Array<[string, string | undefined]> = [
    ["receiptId", ev.receipt_id],
    ["tenantId", ev.tenant_id],
    ["receiptHash", ev.receipt_hash],
    ["chainHeight", String(ev.chain_height)],
    ["eventType", ev.event_type],
    ["decision", ev.decision],
    ["assurance", ev.assurance_level],
  ];
  const sd = sdParams
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${sdEscape(String(v))}"`)
    .join(" ");

  // Every interpolated field is flattened: a newline anywhere here would let a
  // caller forge an extra syslog record in the customer's SIEM.
  const msgId = oneLine(ev.event_id).replace(/\s/g, "_") || "-";
  const msg = oneLine(
    `AI receipt ${ev.event_type} tenant=${ev.tenant_id} decision=${ev.decision ?? "n/a"}`
  );
  return `<${pri}>1 ${ts} ${host} ${app} - ${msgId} [askledger@0 ${sd}] ${msg}`;
}
