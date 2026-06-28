// Public API of @projectledger/conformance. Importing this from another
// package lets you embed conformance checks in your test suite.

export interface CanonicalVector { id: string; input: unknown; expected_bytes_hex: string }
export interface SignedVector    { id: string; event: unknown; expected_receipt: unknown }
export interface ChainedVector   { id: string; events: unknown[]; expected_head_hashes: string[] }

export interface RunResult {
  level: "CL1" | "CL2" | "CL3";
  passed: number;
  failed: number;
  total: number;
  failures: Array<{ id: string; reason: string }>;
}

export interface Adapter {
  canonicalize?(input: unknown): Promise<Uint8Array>;
  sign?(event: unknown): Promise<unknown>;     // returns SignedReceipt
  signChain?(events: unknown[]): Promise<unknown[]>; // returns SignedReceipt[]
}

import { CANONICAL_VECTORS, SIGNED_VECTORS, CHAINED_VECTORS } from "./vectors.js";

export async function runCL1(adapter: Adapter): Promise<RunResult> {
  const r: RunResult = { level: "CL1", passed: 0, failed: 0, total: CANONICAL_VECTORS.length, failures: [] };
  if (!adapter.canonicalize) return { ...r, failed: r.total, failures: CANONICAL_VECTORS.map((v) => ({ id: v.id, reason: "adapter.canonicalize not provided" })) };
  for (const v of CANONICAL_VECTORS) {
    try {
      const bytes = await adapter.canonicalize(v.input);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      if (hex === v.expected_bytes_hex) r.passed++; else { r.failed++; r.failures.push({ id: v.id, reason: `bytes mismatch: got ${hex.slice(0,32)}..., expected ${v.expected_bytes_hex.slice(0,32)}...` }); }
    } catch (e) {
      r.failed++; r.failures.push({ id: v.id, reason: String((e as Error).message ?? e) });
    }
  }
  return r;
}

export async function runCL2(adapter: Adapter): Promise<RunResult> {
  const r: RunResult = { level: "CL2", passed: 0, failed: 0, total: SIGNED_VECTORS.length, failures: [] };
  if (!adapter.sign) return { ...r, failed: r.total, failures: SIGNED_VECTORS.map((v) => ({ id: v.id, reason: "adapter.sign not provided" })) };
  for (const v of SIGNED_VECTORS) {
    try {
      const got = await adapter.sign(v.event);
      if (JSON.stringify(got) === JSON.stringify(v.expected_receipt)) r.passed++;
      else { r.failed++; r.failures.push({ id: v.id, reason: "signed receipt mismatch" }); }
    } catch (e) {
      r.failed++; r.failures.push({ id: v.id, reason: String((e as Error).message ?? e) });
    }
  }
  return r;
}

export async function runCL3(adapter: Adapter): Promise<RunResult> {
  const r: RunResult = { level: "CL3", passed: 0, failed: 0, total: CHAINED_VECTORS.length, failures: [] };
  if (!adapter.signChain) return { ...r, failed: r.total, failures: CHAINED_VECTORS.map((v) => ({ id: v.id, reason: "adapter.signChain not provided" })) };
  for (const v of CHAINED_VECTORS) {
    try {
      const got = await adapter.signChain(v.events) as Array<{ receipt: { integrity: { receipt_hash: string } } }>;
      const heads = got.map((r) => r.receipt.integrity.receipt_hash);
      const match = heads.length === v.expected_head_hashes.length && heads.every((h, i) => h === v.expected_head_hashes[i]);
      if (match) r.passed++; else { r.failed++; r.failures.push({ id: v.id, reason: "chain head mismatch" }); }
    } catch (e) {
      r.failed++; r.failures.push({ id: v.id, reason: String((e as Error).message ?? e) });
    }
  }
  return r;
}

export async function runAll(adapter: Adapter): Promise<{ cl1: RunResult; cl2: RunResult; cl3: RunResult; badge: "CL3" | "CL2" | "CL1" | "NONE" }> {
  const cl1 = await runCL1(adapter);
  const cl2 = await runCL2(adapter);
  const cl3 = await runCL3(adapter);
  let badge: "CL3" | "CL2" | "CL1" | "NONE" = "NONE";
  if (cl1.failed === 0) badge = "CL1";
  if (cl1.failed === 0 && cl2.failed === 0) badge = "CL2";
  if (cl1.failed === 0 && cl2.failed === 0 && cl3.failed === 0) badge = "CL3";
  return { cl1, cl2, cl3, badge };
}
