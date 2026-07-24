/**
 * Example 10, Next.js (App Router) route handler
 *
 * Emit a signed, verifiable receipt for an AI decision made inside a Next.js
 * API route. The receipt logic is framework-agnostic, so the same shape works
 * unchanged in the Pages API (`pages/api/*`) or any other Node server.
 *
 * Place at:  app/api/ai/route.ts
 *
 * Illustrative: this file does not require `next` as a dependency; it shows the
 * integration shape. Swap the stubs for your model call and your ledger store.
 */

import { signReceipt, generateKeyPair, type RawEvent } from "../src/index.js";

// Load the signing key once at module init. In production this is backed by
// your KMS/HSM (see src/hsm), never a fresh in-memory key per request.
const keypair = generateKeyPair();

export async function POST(req: Request): Promise<Response> {
  const { prompt } = await req.json();

  // 1) Your AI call, any vendor, any model.
  const answer = await callYourModel(prompt);

  // 2) Describe the decision and sign a receipt for it. Only hashes and
  //    metadata are recorded; the raw prompt/response never enter the receipt.
  const event: RawEvent = {
    schema_version: "1.0",
    tenant_id: "acme",
    event_type: "gateway.request",
    source_system: "nextjs-app",
    event_id: crypto.randomUUID(),
    captured_at: new Date().toISOString(),
    subject: { ai_vendor: "openai", ai_model: "gpt-5" },
    payload: { input_classification: "internal", output_classification: "internal" },
  };
  const signed = signReceipt({ event, keypair });

  // 3) Append the receipt to your own append-only ledger, then respond. The
  //    id lets you (or an auditor) retrieve and verify this exact decision later.
  await appendToLedger(signed);

  return Response.json({
    answer,
    receipt_id: signed.receipt.receipt_id,
  });
}

// --- replace these stubs with your real implementations ---
async function callYourModel(_prompt: string): Promise<string> {
  return "…model output…";
}
async function appendToLedger(_receipt: unknown): Promise<void> {
  // e.g. INSERT into Postgres, or POST to your hosted AskLedger ledger.
}
