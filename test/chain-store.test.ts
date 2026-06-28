/**
 * Tests for ChainStateStore implementations.
 *
 * The MemoryChainStateStore is fully exercised here. The Postgres store
 * is interface-tested with a fake PgPool to prove its query shape.
 */

import { describe, it, expect } from "vitest";
import {
  MemoryChainStateStore,
  PostgresChainStateStore,
  ConcurrentChainWriteError,
  GENESIS_HASH,
} from "../src/index.js";

describe("MemoryChainStateStore", () => {
  it("loads a genesis state for a new tenant", async () => {
    const s = new MemoryChainStateStore();
    const state = await s.load("acme");
    expect(state.chain_height).toBe(0);
    expect(state.previous_receipt_hash).toBe(GENESIS_HASH);
  });

  it("advances the chain monotonically", async () => {
    const s = new MemoryChainStateStore();
    let state = await s.load("acme");
    state = await s.advance(state, "h1", "r1");
    expect(state.chain_height).toBe(1);
    state = await s.advance(state, "h2", "r2");
    expect(state.chain_height).toBe(2);
    expect(state.previous_receipt_hash).toBe("h2");
  });

  it("isolates tenants", async () => {
    const s = new MemoryChainStateStore();
    const a = await s.load("a");
    await s.advance(a, "h-a", "r-a");
    const b = await s.load("b");
    expect(b.chain_height).toBe(0);
  });

  it("throws ConcurrentChainWriteError when advancing from stale state", async () => {
    const s = new MemoryChainStateStore();
    const state0 = await s.load("acme");
    const state1 = await s.advance(state0, "h1", "r1");
    // Try to advance using the stale state0 again
    void state1;
    await expect(s.advance(state0, "h2", "r2")).rejects.toThrow(
      ConcurrentChainWriteError
    );
  });
});

describe("PostgresChainStateStore interface", () => {
  function fakePool(initialRows: Record<string, Record<string, unknown>> = {}) {
    let rows = { ...initialRows };
    const calls: { sql: string; params: unknown[] }[] = [];
    return {
      calls,
      pool: {
        async query(sql: string, params: unknown[] = []) {
          calls.push({ sql, params });
          const normalized = sql.replace(/\s+/g, " ").trim();
          if (normalized.startsWith("SELECT")) {
            const row = rows[String(params[0])];
            if (row) return { rows: [row], rowCount: 1 };
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith("INSERT")) {
            const [tenant, height, prev, rid] = params as [string, number, string, string];
            if (rows[tenant]) return { rows: [], rowCount: 0 };
            rows[tenant] = {
              tenant_id: tenant,
              chain_height: height,
              previous_receipt_hash: prev,
              last_receipt_id: rid,
              updated_at: new Date(),
            };
            return { rows: [{ chain_height: height }], rowCount: 1 };
          }
          if (normalized.startsWith("UPDATE")) {
            const [tenant, height, prev, rid, expected] = params as [string, number, string, string, number];
            const row = rows[tenant];
            if (!row || row.chain_height !== expected) {
              return { rows: [], rowCount: 0 };
            }
            rows[tenant] = {
              ...row,
              chain_height: height,
              previous_receipt_hash: prev,
              last_receipt_id: rid,
              updated_at: new Date(),
            };
            return { rows: [{ chain_height: height }], rowCount: 1 };
          }
          throw new Error("unexpected SQL: " + sql);
        },
      },
    };
  }

  it("returns genesis state for unknown tenant", async () => {
    const { pool } = fakePool();
    const store = new PostgresChainStateStore(pool);
    const s = await store.load("nobody");
    expect(s.chain_height).toBe(0);
    expect(s.previous_receipt_hash).toBe(GENESIS_HASH);
  });

  it("uses INSERT for first advance (genesis), UPDATE for subsequent", async () => {
    const { pool, calls } = fakePool();
    const store = new PostgresChainStateStore(pool);
    const s0 = await store.load("acme");
    const s1 = await store.advance(s0, "h1", "r1");
    expect(s1.chain_height).toBe(1);
    const s2 = await store.advance(s1, "h2", "r2");
    expect(s2.chain_height).toBe(2);
    expect(calls.some((c) => /INSERT/i.test(c.sql))).toBe(true);
    expect(calls.some((c) => /UPDATE/i.test(c.sql))).toBe(true);
  });

  it("throws ConcurrentChainWriteError when CAS fails", async () => {
    const { pool } = fakePool();
    const store = new PostgresChainStateStore(pool);
    const s0 = await store.load("acme");
    await store.advance(s0, "h1", "r1");
    // s0 is now stale; re-using it must fail
    await expect(store.advance(s0, "h2", "r2")).rejects.toThrow(
      ConcurrentChainWriteError
    );
  });
});
