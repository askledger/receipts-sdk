import { describe, it, expect } from "vitest";
import { CircuitBreaker, CircuitOpenError, backoff } from "../console/src/lib/circuit-breaker.js";
import { rateLimiter, InMemoryStore } from "../console/src/lib/rate-limit.js";
import { InMemoryIdempotencyStore, hashBody } from "../console/src/lib/idempotency.js";
import { InMemoryOutbox } from "../console/src/lib/audit-outbox.js";

describe("CircuitBreaker", () => {
  it("stays closed under healthy traffic", async () => {
    const cb = new CircuitBreaker("svc", { minRequests: 5 });
    for (let i = 0; i < 10; i++) await cb.run(async () => "ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens when failure ratio crosses threshold", async () => {
    const cb = new CircuitBreaker("svc", { minRequests: 4, failureThreshold: 0.5 });
    for (let i = 0; i < 5; i++) {
      try { await cb.run(async () => { throw new Error("nope"); }); } catch { /* expected */ }
    }
    expect(cb.getState()).toBe("open");
  });

  it("fast-fails while open", async () => {
    const cb = new CircuitBreaker("svc", { minRequests: 2, failureThreshold: 0.5 });
    for (let i = 0; i < 3; i++) {
      try { await cb.run(async () => { throw new Error(); }); } catch { /* expected */ }
    }
    await expect(cb.run(async () => "ok")).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("moves open -> half-open after openMs, closes on success", async () => {
    let now = 1000;
    const cb = new CircuitBreaker("svc", {
      minRequests: 2, failureThreshold: 0.5, windowMs: 60_000, openMs: 500, now: () => now,
    });
    for (let i = 0; i < 3; i++) {
      try { await cb.run(async () => { throw new Error(); }); } catch { /* expected */ }
    }
    expect(cb.getState()).toBe("open");
    now += 600;
    const out = await cb.run(async () => "recovered");
    expect(out).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("backoff produces values in [0, cap]", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const v = backoff(attempt, 100, 5_000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5_000);
    }
  });
});

describe("rate limiter · sliding window", () => {
  it("allows up to the limit, then denies until the window passes", async () => {
    let now = 1_000_000;
    const rl = rateLimiter({ limit: 3, windowSec: 60, store: new InMemoryStore(), now: () => now });
    for (let i = 0; i < 3; i++) {
      const r = await rl.allow("k");
      expect(r.allowed).toBe(true);
    }
    const denied = await rl.allow("k");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(60);
    now += 60_001;
    const after = await rl.allow("k");
    expect(after.allowed).toBe(true);
  });

  it("isolates buckets per key", async () => {
    const rl = rateLimiter({ limit: 1, windowSec: 60 });
    expect((await rl.allow("a")).allowed).toBe(true);
    expect((await rl.allow("b")).allowed).toBe(true);
    expect((await rl.allow("a")).allowed).toBe(false);
  });
});

describe("Idempotency-Key store", () => {
  it("fresh first request, replay on second with same body", async () => {
    const store = new InMemoryIdempotencyStore();
    const hash = hashBody("payload-1");
    const first = await store.begin("k1", hash);
    expect(first.kind).toBe("fresh");
    await store.finish("k1", { status: 201, body: { id: 1 } });
    const replay = await store.begin("k1", hash);
    expect(replay.kind).toBe("replay");
    if (replay.kind === "replay") {
      expect(replay.cached.status).toBe(201);
    }
  });

  it("same key with DIFFERENT body is a conflict (rfc 9457 style)", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.begin("k2", hashBody("a"));
    await store.finish("k2", { status: 200, body: {} });
    const conflict = await store.begin("k2", hashBody("b"));
    expect(conflict.kind).toBe("conflict");
  });
});

describe("Audit outbox", () => {
  it("retains events until drained", async () => {
    const ob = new InMemoryOutbox();
    await ob.enqueue({ tenant_id: "t1", actor_sub: "u1", actor_email: "u@x", action: "key.rotated", metadata: {} });
    await ob.enqueue({ tenant_id: "t1", actor_sub: "u1", actor_email: "u@x", action: "plan.changed", metadata: {} });
    expect(ob.pendingCount()).toBe(2);
    const sent = await ob.drain(async () => undefined);
    expect(sent).toBe(2);
    expect(ob.pendingCount()).toBe(0);
  });

  it("stops at first failure and retains head — at-least-once delivery", async () => {
    const ob = new InMemoryOutbox();
    await ob.enqueue({ tenant_id: "t", actor_sub: "u", actor_email: "u@x", action: "key.rotated", metadata: {} });
    await ob.enqueue({ tenant_id: "t", actor_sub: "u", actor_email: "u@x", action: "plan.changed", metadata: {} });
    let calls = 0;
    const sent = await ob.drain(async () => { calls++; if (calls === 1) return; throw new Error("downstream"); });
    expect(sent).toBe(1);
    expect(ob.pendingCount()).toBe(1);
    const sent2 = await ob.drain(async () => undefined);
    expect(sent2).toBe(1);
    expect(ob.pendingCount()).toBe(0);
  });
});
