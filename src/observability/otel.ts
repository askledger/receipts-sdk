// Optional OpenTelemetry adapter. No-op unless the host app calls
// registerOtelProvider() at boot, so the SDK adds zero runtime cost
// for users who don't want tracing.

/* eslint-disable @typescript-eslint/no-explicit-any */
// OTel API is intentionally typed as `any` at the boundary to avoid
// adding @opentelemetry/api as a hard dependency. Strict types apply
// inside the SDK.

type Counter = { add(n: number, attrs?: Record<string, unknown>): void };
type Histogram = { record(n: number, attrs?: Record<string, unknown>): void };

interface Meter {
  createCounter(name: string, opts?: unknown): Counter;
  createHistogram(name: string, opts?: unknown): Histogram;
}

interface Tracer {
  startSpan(name: string, opts: unknown): {
    end(): void;
    setAttribute(k: string, v: unknown): void;
  };
}

let tracer: Tracer | null = null;
let meter: Meter | null = null;

interface Metrics {
  signTotal: Counter;
  signErrors: Counter;
  signDurationMs: Histogram;
  verifyAttempts: Counter;
  verifyFailures: Counter;
  chainWriteAttempts: Counter;
  chainWriteErrors: Counter;
  crossTenantAttempts: Counter;
}

let m: Metrics | null = null;

export function registerOtelProvider(p: { tracer?: any; meter?: any }): void {
  tracer = (p.tracer as Tracer) ?? null;
  meter = (p.meter as Meter) ?? null;
  if (!meter) return;
  m = {
    signTotal: meter.createCounter("pl_signer_sign_total"),
    signErrors: meter.createCounter("pl_signer_sign_errors_total"),
    signDurationMs: meter.createHistogram("pl_signer_sign_duration_ms", { unit: "ms" }),
    verifyAttempts: meter.createCounter("pl_verify_attempts_total"),
    verifyFailures: meter.createCounter("pl_verify_failures_total"),
    chainWriteAttempts: meter.createCounter("pl_chain_write_attempts_total"),
    chainWriteErrors: meter.createCounter("pl_chain_write_errors_total"),
    crossTenantAttempts: meter.createCounter("pl_tenant_cross_tenant_attempts_total"),
  };
}

export const isOtelEnabled = (): boolean => tracer !== null || meter !== null;

export function recordSign(o: { durationMs: number; tenantId: string; kid: string; ok: boolean }): void {
  if (!m) return;
  const a = { tenant_id: o.tenantId, kid: o.kid };
  m.signTotal.add(1, a);
  m.signDurationMs.record(o.durationMs, a);
  if (!o.ok) m.signErrors.add(1, a);
}

export function recordVerify(o: { tenantId: string; ok: boolean }): void {
  if (!m) return;
  const a = { tenant_id: o.tenantId };
  m.verifyAttempts.add(1, a);
  if (!o.ok) m.verifyFailures.add(1, a);
}

export function recordChainWrite(o: { tenantId: string; ok: boolean }): void {
  if (!m) return;
  const a = { tenant_id: o.tenantId };
  m.chainWriteAttempts.add(1, a);
  if (!o.ok) m.chainWriteErrors.add(1, a);
}

export function recordCrossTenantAttempt(o: { sessionTenant: string; requestedTenant: string }): void {
  if (!m) return;
  m.crossTenantAttempts.add(1, {
    session_tenant: o.sessionTenant,
    requested_tenant: o.requestedTenant,
  });
}

export function startSpan(name: string, attrs: Record<string, string | number | boolean> = {}) {
  if (!tracer) return { end: noop, setAttr: noop };
  const span = tracer.startSpan(name, { attributes: attrs });
  return { end: () => span.end(), setAttr: (k: string, v: string | number | boolean) => span.setAttribute(k, v) };
}

function noop(): void { /* no-op */ }
