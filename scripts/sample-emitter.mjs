#!/usr/bin/env node
// Sample emitter: signs and ships a receipt every 6 seconds so the
// docker-compose hello-world dashboard has live data. Demonstrates the
// vendor-kit ingest path end-to-end.

import { generateKeyPair, signReceipt } from "../dist/index.js";

const INGEST = process.env.PL_INGEST_URL ?? "";
const TOKEN  = process.env.PL_INGEST_TOKEN ?? "";
const TENANT = process.env.PL_TENANT ?? "demo-tenant";

const kp = generateKeyPair();
console.log(`[sample-emitter] kid=${kp.kid} tenant=${TENANT} → ${INGEST || "(stdout)"}`);

const VENDORS = [
  { v: "anthropic", m: "claude-sonnet-4-6" },
  { v: "anthropic", m: "claude-haiku-4-5" },
  { v: "openai", m: "gpt-5" },
  { v: "openai", m: "gpt-5-mini" },
  { v: "google", m: "gemini-2-5-pro" },
];

let i = 0;
const tick = async () => {
  const choice = VENDORS[Math.floor(Math.random() * VENDORS.length)];
  const inTokens = 200 + Math.floor(Math.random() * 4000);
  const outTokens = 50 + Math.floor(Math.random() * 1200);

  const signed = signReceipt({
    event: {
      schema_version: "1.0",
      tenant_id: TENANT,
      event_type: "ai.model_invocation",
      source_system: "pl-sample-emitter",
      event_id: `s-${Date.now()}-${i++}`,
      captured_at: new Date().toISOString(),
      context: { user_id: `u-${Math.floor(Math.random() * 50)}`, environment: "development" },
      subject: { ai_vendor: choice.v, ai_model: choice.m },
      payload: { input_token_count: inTokens, output_token_count: outTokens, input_classification: "internal" },
    },
    keypair: kp,
  });

  if (!INGEST) {
    console.log(`[receipt] height=${signed.receipt.integrity.chain_height} ${choice.v}:${choice.m}`);
    return;
  }
  try {
    const res = await fetch(INGEST, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(signed),
    });
    console.log(`[ingest] height=${signed.receipt.integrity.chain_height} status=${res.status}`);
  } catch (e) {
    console.warn(`[ingest] failed: ${e.message}`);
  }
};

await tick();
setInterval(tick, 6000);
