// Sliding-window log rate limiter. In single-pod dev it lives in memory;
// in production swap `store` for a Redis-backed implementation with the
// same interface. The algorithm is the same: precise quota tracking
// without the bursty edge of fixed-window or the memory cost of a
// per-request token bucket.

export interface RateLimitStore {
  hit(key: string, windowSec: number, now: number): Promise<number>;
  reset(key: string): Promise<void>;
}

export class InMemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, number[]>();

  async hit(key: string, windowSec: number, now: number): Promise<number> {
    const horizon = now - windowSec * 1000;
    const arr = this.buckets.get(key) ?? [];
    // O(n) prune is fine because n is bounded by the limit itself.
    let i = 0;
    while (i < arr.length && arr[i] <= horizon) i++;
    const live = i === 0 ? arr : arr.slice(i);
    live.push(now);
    this.buckets.set(key, live);
    return live.length;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

export interface RateLimit {
  /** allow(key) -> { allowed, remaining, retryAfterSec } */
  allow(key: string): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }>;
}

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
  store?: RateLimitStore;
  now?: () => number;
}

export function rateLimiter(opts: RateLimitOptions): RateLimit {
  const store = opts.store ?? new InMemoryStore();
  const now = opts.now ?? Date.now;
  return {
    async allow(key: string) {
      const count = await store.hit(key, opts.windowSec, now());
      const remaining = Math.max(0, opts.limit - count);
      const allowed = count <= opts.limit;
      const retryAfterSec = allowed ? 0 : opts.windowSec;
      return { allowed, remaining, retryAfterSec };
    },
  };
}

// Defaults — match the SLO claim in HARDENING_CHECKLIST.md §D.3.
export const defaultLimits = {
  read: rateLimiter({ limit: 1000, windowSec: 60 }),
  write: rateLimiter({ limit: 100, windowSec: 60 }),
  sensitive: rateLimiter({ limit: 10, windowSec: 60 }),
};
