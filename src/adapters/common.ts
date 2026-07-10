/**
 * Common types and helpers shared by all auto-capture adapters.
 *
 * Every adapter accepts an `AdapterContext` and is responsible for
 * building a RawEvent it hands to signReceipt. The adapter MUST NOT
 * raise from sign failures, receipts MUST NOT take down the AI call
 * they instrument.
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import { signReceipt } from "../receipt.js";
import type { KeyPair, RawEvent, SignedReceipt } from "../types.js";

export interface AdapterContext {
  /** Tenant ID to bind every receipt to. */
  tenantId: string;
  /** Signing keypair. In production, prefer a SigningProvider. */
  keypair: KeyPair;
  /**
   * Optional callback fired after each receipt is signed. Use this to
   * ship receipts to your durable store (Postgres, S3, the cloud).
   * Errors here are caught and logged; they do not propagate.
   */
  onReceipt?: (receipt: SignedReceipt) => void | Promise<void>;
  /**
   * Source system identifier for the receipts produced by this adapter.
   * Defaults to the adapter's name.
   */
  sourceSystem?: string;
  /**
   * Default environment label. Picks up NODE_ENV when omitted.
   */
  environment?: "production" | "staging" | "development";
  /**
   * Optional user_id supplier (per-call). For multi-user services.
   */
  userIdResolver?: () => string | undefined;
  /**
   * If true, do not embed the input/output text into the receipt, only
   * embed their hashes. Default: true (privacy by default).
   */
  hashOnly?: boolean;
}

export function envLabel(ctx: AdapterContext): "production" | "staging" | "development" {
  if (ctx.environment) return ctx.environment;
  const e = (process.env.NODE_ENV ?? "").toLowerCase();
  if (e === "production" || e === "prod") return "production";
  if (e === "staging" || e === "stage") return "staging";
  return "development";
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return Buffer.from(sha256Fn(bytes)).toString("hex");
}

export function newEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Adapter-side helper: build and sign a receipt, swallow errors so the
 * caller's AI invocation is never affected.
 */
export async function captureAndSign(
  ctx: AdapterContext,
  event: RawEvent
): Promise<SignedReceipt | null> {
  try {
    const r = signReceipt({ event, keypair: ctx.keypair });
    if (ctx.onReceipt) {
      try {
        await ctx.onReceipt(r);
      } catch (e) {
        // Don't let onReceipt errors propagate
        // eslint-disable-next-line no-console
        console.error("[receipts] onReceipt failed:", e);
      }
    }
    return r;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[receipts] signReceipt failed:", e);
    return null;
  }
}
