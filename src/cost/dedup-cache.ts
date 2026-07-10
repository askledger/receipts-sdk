// Content-addressed dedup cache. Hash the canonical prompt (after PII
// redaction) and serve a previously-paid-for response when the same
// prompt repeats inside the TTL window. Every hit stamps the receipt
// with cache_hit:true so audit can see who was served what and when.
//
// Hashing uses sha256 over canonical JSON of {prompt, model, tools}.
// We don't include tenant_id in the hash so cross-tenant cache sharing
// is technically possible, but the lookup is scoped per-tenant, so a
// hit only occurs when the SAME tenant served the SAME prompt.

import { createHash } from "node:crypto";
import { canonicalize } from "../canonicalize.js";

export interface PromptKey {
  prompt: string;
  model: string;
  tools?: string[];
  temperature?: number;
}

export interface CacheEntry<T> {
  hash: string;
  value: T;
  stored_at: number;
  hits: number;
}

export interface Cache<T> {
  get(tenantId: string, k: PromptKey): Promise<CacheEntry<T> | null>;
  put(tenantId: string, k: PromptKey, value: T): Promise<CacheEntry<T>>;
  stats(): Promise<{ size: number; hit_rate: number }>;
}

export function hashKey(k: PromptKey): string {
  const c = canonicalize({ p: k.prompt, m: k.model, t: k.tools ?? [], temp: k.temperature ?? null });
  return createHash("sha256").update(c).digest("hex");
}

export class InMemoryDedup<T> implements Cache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private gets = 0;
  private hits = 0;
  constructor(private readonly ttlMs = 60 * 60 * 1000) {}

  private key(tenantId: string, hash: string): string { return `${tenantId}:${hash}`; }

  async get(tenantId: string, k: PromptKey): Promise<CacheEntry<T> | null> {
    this.gets++;
    const hash = hashKey(k);
    const e = this.store.get(this.key(tenantId, hash));
    if (!e) return null;
    if (Date.now() - e.stored_at > this.ttlMs) { this.store.delete(this.key(tenantId, hash)); return null; }
    e.hits++;
    this.hits++;
    return e;
  }

  async put(tenantId: string, k: PromptKey, value: T): Promise<CacheEntry<T>> {
    const hash = hashKey(k);
    const e: CacheEntry<T> = { hash, value, stored_at: Date.now(), hits: 0 };
    this.store.set(this.key(tenantId, hash), e);
    return e;
  }

  async stats() {
    return { size: this.store.size, hit_rate: this.gets === 0 ? 0 : this.hits / this.gets };
  }
}
