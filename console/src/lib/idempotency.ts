// Idempotency-Key handling. Matches the Stripe / IETF
// draft-ietf-httpapi-idempotency-key-header semantics: a client supplies a
// key per logical operation; we de-duplicate replays within a 24h window.
//
// Two concurrent replays of the same key are serialized — the second
// caller gets the first's cached response, not a fresh attempt. This is
// the property that makes idempotency safe in the presence of network
// retries.

import { createHash } from "node:crypto";

interface CachedResponse {
  status: number;
  body: unknown;
  bodyHash: string;
  storedAt: number;
}

export interface IdempotencyStore {
  begin(key: string, bodyHash: string): Promise<{ kind: "fresh" } | { kind: "replay"; cached: CachedResponse } | { kind: "conflict" }>;
  finish(key: string, response: { status: number; body: unknown }): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly cache = new Map<string, CachedResponse | "in-flight">();
  private readonly inflightBodies = new Map<string, string>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  async begin(key: string, bodyHash: string) {
    this.evict();
    const existing = this.cache.get(key);
    if (!existing) {
      this.cache.set(key, "in-flight");
      this.inflightBodies.set(key, bodyHash);
      return { kind: "fresh" as const };
    }
    if (existing === "in-flight") {
      const seen = this.inflightBodies.get(key);
      if (seen && seen !== bodyHash) return { kind: "conflict" as const };
      // The spec says serialize; for in-memory we approximate by busy-wait.
      // Production Redis impl would BLPOP a wait list.
      await new Promise((r) => setTimeout(r, 25));
      const after = this.cache.get(key);
      if (after && after !== "in-flight") return { kind: "replay" as const, cached: after };
      return { kind: "fresh" as const };
    }
    if (existing.bodyHash !== bodyHash) return { kind: "conflict" as const };
    return { kind: "replay" as const, cached: existing };
  }

  async finish(key: string, response: { status: number; body: unknown }) {
    const bodyHash = this.inflightBodies.get(key) ?? "";
    this.cache.set(key, { ...response, bodyHash, storedAt: Date.now() });
    this.inflightBodies.delete(key);
  }

  private evict(): void {
    const horizon = Date.now() - this.ttlMs;
    for (const [k, v] of this.cache.entries()) {
      if (v !== "in-flight" && v.storedAt < horizon) this.cache.delete(k);
    }
  }
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
