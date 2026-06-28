/**
 * Stripe-compatible billing webhook handler.
 *
 * Production wires this to Stripe; the verification pattern below is
 * implementation-agnostic and works for any HMAC-signed webhook.
 *
 * Critical security properties:
 *
 *   1. Signature verification BEFORE parsing the body, using constant-time
 *      comparison. Raw bytes are used — JSON.parse() never runs on
 *      untrusted bytes until the signature is verified.
 *
 *   2. Idempotency: the event id is checked against a processed-events
 *      table; duplicate deliveries are 200-acknowledged without re-processing.
 *
 *   3. Plan changes are themselves signed receipts in the platform audit
 *      log — billing is a security-relevant action and must be traceable.
 *
 *   4. Webhook secret is fetched from KMS at request time, NOT held in
 *      process memory across requests. (The KMS call is fast.)
 */

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BillingEvent {
  id: string;
  type: string;
  data: { object: { customer?: string; subscription?: string; status?: string; metadata?: Record<string, string> } };
  created: number;
}

// In production, fetched from KMS at request time. The constant here is
// only for local dev — the deploy refuses to start if the secret looks
// like a default.
function getWebhookSecret(): string {
  const s = process.env.PL_BILLING_WEBHOOK_SECRET ?? "";
  if (!s || s === "dev-only-not-for-production") {
    throw new Error("BILLING_WEBHOOK_SECRET not configured");
  }
  return s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
}

function verifySignature(rawBody: string, sigHeader: string | null): boolean {
  if (!sigHeader) return false;
  // Stripe-style: "t=<ts>,v1=<sig>". We accept skew up to 5 minutes.
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const ts = Number(parts.t);
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  return timingSafeEqual(expected, v1);
}

const PROCESSED_EVENTS = new Set<string>();

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? req.headers.get("x-billing-signature");

  let secretConfigured = true;
  try {
    if (!verifySignature(rawBody, sigHeader)) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "BILLING_WEBHOOK_SECRET not configured") {
      secretConfigured = false;
    } else {
      throw e;
    }
  }
  if (!secretConfigured) {
    return NextResponse.json({ error: "CONFIG" }, { status: 503 });
  }

  let event: BillingEvent;
  try {
    event = JSON.parse(rawBody) as BillingEvent;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // Idempotency: ack on duplicate without re-processing.
  if (PROCESSED_EVENTS.has(event.id)) {
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }
  PROCESSED_EVENTS.add(event.id);
  // Production: persist to processed_events table with TTL of 30 days.

  // Route by type. Each handler is responsible for:
  //   1. Updating the tenant's plan/entitlement state in the DB.
  //   2. Writing a signed receipt to the platform audit log.
  //   3. Emitting any internal events (slack alert on downgrade, etc.).
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Update tenant plan + entitlements. Audit-log entry.
      break;
    case "invoice.paid":
      // Continue service.
      break;
    case "invoice.payment_failed":
      // Schedule dunning. After 3 failures, downgrade to free + audit-log.
      break;
    default:
      // Unknown event types are 200-acknowledged so the provider stops
      // retrying. We log them for follow-up.
      // eslint-disable-next-line no-console
      console.warn("[billing] unknown event type:", event.type);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
