/**
 * Micro-benchmark suite for the Receipts SDK.
 *
 * Run with:
 *   npm run build && node scripts/bench.mjs
 *
 * Produces p50 / p95 / p99 latencies for:
 *   - RFC 8785 canonicalization
 *   - SHA-256 hashing of canonical bytes
 *   - Ed25519 signing
 *   - Ed25519 verification
 *   - End-to-end signReceipt
 *   - End-to-end verifyReceipt
 */

import {
  canonicalize,
  canonicalizeBytes,
  sha256,
  sign,
  verify,
  generateKeyPair,
  signReceipt,
  verifyReceipt,
} from "../dist/index.js";

const ITERATIONS = 5000;
const WARMUP = 200;

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function summarize(label, samples_us) {
  const p50 = percentile(samples_us, 0.5);
  const p95 = percentile(samples_us, 0.95);
  const p99 = percentile(samples_us, 0.99);
  const mean = samples_us.reduce((a, b) => a + b, 0) / samples_us.length;
  console.log(
    label.padEnd(28) +
      `mean=${mean.toFixed(1).padStart(7)}µs  ` +
      `p50=${p50.toFixed(1).padStart(7)}µs  ` +
      `p95=${p95.toFixed(1).padStart(7)}µs  ` +
      `p99=${p99.toFixed(1).padStart(7)}µs`
  );
}

function now_us() {
  const [s, ns] = process.hrtime();
  return s * 1e6 + ns / 1000;
}

function sampleEvent(tenant, i) {
  return {
    schema_version: "1.0",
    tenant_id: tenant,
    event_type: "gateway.request",
    source_system: "bench",
    event_id: `bench-${i}`,
    captured_at: "2026-05-13T10:00:00.000Z",
    context: { environment: "production" },
    subject: {
      ai_vendor: "anthropic",
      ai_model: "claude-sonnet-4-6",
      ai_capability: "text-generation",
    },
    payload: {
      input_classification: "internal",
      output_classification: "internal",
      input_token_count: 100,
    },
  };
}

function main() {
  console.log("Project Ledger Receipts SDK — benchmark");
  console.log(`Node ${process.version} · ${process.platform}/${process.arch}`);
  console.log(`Iterations per measurement: ${ITERATIONS} (after ${WARMUP} warmup)`);
  console.log();

  const TENANT = "bench-" + Math.random().toString(36).slice(2);
  const kp = generateKeyPair();
  const pubKeys = { [kp.kid]: kp.public_key };
  const ev = sampleEvent(TENANT, 0);

  const referenceSigned = signReceipt({ event: ev, keypair: kp });
  const canonicalEvent = canonicalizeBytes(ev);

  for (let i = 0; i < WARMUP; i++) canonicalize(ev);
  const canon_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    canonicalize(ev);
    canon_samples.push(now_us() - t0);
  }
  summarize("canonicalize (RFC 8785)", canon_samples);

  for (let i = 0; i < WARMUP; i++) sha256(canonicalEvent);
  const sha_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    sha256(canonicalEvent);
    sha_samples.push(now_us() - t0);
  }
  summarize("sha256 (canonical bytes)", sha_samples);

  for (let i = 0; i < WARMUP; i++) sign(canonicalEvent, kp);
  const sign_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    sign(canonicalEvent, kp);
    sign_samples.push(now_us() - t0);
  }
  summarize("ed25519 sign", sign_samples);

  const sig = sign(canonicalEvent, kp);
  for (let i = 0; i < WARMUP; i++) verify(canonicalEvent, sig, kp.public_key);
  const verify_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    verify(canonicalEvent, sig, kp.public_key);
    verify_samples.push(now_us() - t0);
  }
  summarize("ed25519 verify", verify_samples);

  for (let i = 0; i < WARMUP; i++) {
    signReceipt({ event: sampleEvent(TENANT, i), keypair: kp });
  }
  const sr_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    signReceipt({ event: sampleEvent(TENANT, i + WARMUP), keypair: kp });
    sr_samples.push(now_us() - t0);
  }
  summarize("signReceipt (end-to-end)", sr_samples);

  for (let i = 0; i < WARMUP; i++)
    verifyReceipt(referenceSigned, { publicKeys: pubKeys });
  const vr_samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = now_us();
    verifyReceipt(referenceSigned, { publicKeys: pubKeys });
    vr_samples.push(now_us() - t0);
  }
  summarize("verifyReceipt (end-to-end)", vr_samples);

  console.log();
  console.log("Notes:");
  console.log("  - signReceipt includes file I/O for chain state in the reference SDK.");
  console.log("  - Production deployments swap the file backend for Postgres + HSM.");
  console.log("  - All cryptographic operations are constant-time (Ed25519).");
}

main();
