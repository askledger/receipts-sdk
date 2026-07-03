// Thin client over a deployed Trillian log instance. Uses the HTTP gateway
// (envoy-grpc-json) so the client doesn't need a gRPC stack. Aligns with
// RFC 9162: every receipt_hash is added as a leaf; the log issues an
// inclusion proof and publishes a signed tree head (STH) on a cadence.

import { sha256String } from "../crypto.js";

export interface STH {
  tree_size: number;
  root_hash: string;
  timestamp_ms: number;
  signature: string;
  log_id: string;
}

export interface InclusionProof {
  leaf_index: number;
  audit_path: string[];
  tree_size: number;
  root_hash: string;
}

export interface TrillianClient {
  add(leaf: { receipt_hash: string; tenant_id: string }): Promise<{ leaf_index: number }>;
  inclusion(leafHash: string): Promise<InclusionProof>;
  sth(): Promise<STH>;
}

export interface TrillianOptions {
  baseUrl: string;
  logId: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
}

export function trillianClient(opts: TrillianOptions): TrillianClient {
  const f = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.bearerToken) headers.authorization = `Bearer ${opts.bearerToken}`;

  const url = (p: string) => `${opts.baseUrl.replace(/\/$/, "")}/v1beta1/logs/${opts.logId}${p}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await f(url(path), { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`trillian ${method} ${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async add(leaf) {
      // Trillian wants base64(leaf_value). Our leaf value is the canonical
      // pair (tenant_id || receipt_hash) so two tenants writing the same
      // receipt_hash don't collide in the log.
      const value = `${leaf.tenant_id}:${leaf.receipt_hash}`;
      const leafBytes = Buffer.from(value, "utf-8").toString("base64");
      const leafHash = sha256String(value);
      const r = await call<{ leaf_index: string }>("POST", ":addLeaf", { leaf: { leaf_value: leafBytes, leaf_identity_hash: leafHash } });
      return { leaf_index: Number(r.leaf_index) };
    },
    inclusion(leafHash) {
      return call<InclusionProof>("GET", `:inclusion/${encodeURIComponent(leafHash)}`);
    },
    sth() {
      return call<STH>("GET", ":sth");
    },
  };
}
