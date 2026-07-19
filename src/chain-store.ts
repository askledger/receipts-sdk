/**
 * ChainStateStore abstraction.
 *
 * The SDK lets you plug a different storage backend for chain state
 * without changing call-site code. The default is the file-backed
 * store in src/chain.ts (good for dev and SMB). For SaaS multi-tenant
 * deployments use PostgresChainStateStore with PostgreSQL row-level
 * security per tenant.
 *
 * Any production backend MUST guarantee:
 *   1. Atomic compare-and-set on (tenant_id, chain_height).
 *      If two concurrent signers try to extend the same chain, exactly
 *      one must succeed; the other must observe the new state and retry.
 *   2. Strict tenant isolation. A query for tenant A's state MUST never
 *      return tenant B's state, even under SQL injection attempts.
 *   3. Durable writes. The chain advance MUST be committed before the
 *      signed receipt is returned to the caller.
 */

import { type ChainState, GENESIS_HASH } from "./types.js";
import { loadChainState, saveChainState, advanceChain } from "./chain.js";

export interface ChainStateStore {
  /**
   * Get the current chain state for a tenant. Returns a genesis state
   * (chain_height: 0, previous_receipt_hash: GENESIS_HASH) if none exists.
   */
  load(tenantId: string): Promise<ChainState>;

  /**
   * Atomically advance the chain. Returns the new state.
   *
   * Implementations MUST detect concurrent writers and either:
   *   - retry internally, or
   *   - throw a ConcurrentChainWriteError that the caller can handle.
   */
  advance(
    previousState: ChainState,
    newReceiptHash: string,
    newReceiptId: string
  ): Promise<ChainState>;
}

export class ConcurrentChainWriteError extends Error {
  constructor(public readonly tenantId: string, public readonly observedHeight: number) {
    super(
      `Concurrent chain write on tenant=${tenantId}: another process advanced past height ${observedHeight}`
    );
    this.name = "ConcurrentChainWriteError";
  }
}

/**
 * Default file-backed store. Wraps the legacy sync API in promises so
 * call-site code is uniform regardless of backend.
 */
export class FileChainStateStore implements ChainStateStore {
  async load(tenantId: string): Promise<ChainState> {
    return loadChainState(tenantId);
  }

  async advance(
    previousState: ChainState,
    newReceiptHash: string,
    newReceiptId: string
  ): Promise<ChainState> {
    // Compare-and-set: re-read the persisted head and refuse to advance if it
    // moved since `previousState` was loaded. Best-effort without an OS lock,
    // but it catches read-modify-write interleaving and most cross-process
    // races. Use PostgresChainStateStore for strict multi-writer guarantees.
    const current = loadChainState(previousState.tenant_id);
    if (current.chain_height !== previousState.chain_height) {
      throw new ConcurrentChainWriteError(previousState.tenant_id, current.chain_height);
    }
    const next = advanceChain(previousState, newReceiptHash, newReceiptId);
    saveChainState(next);
    return next;
  }
}

/**
 * In-memory store. Useful for tests, ephemeral compute (serverless
 * functions when paired with an external KV store), and the browser
 * playground.
 *
 * NOT durable. Process restart wipes state.
 */
export class MemoryChainStateStore implements ChainStateStore {
  private readonly state = new Map<string, ChainState>();

  async load(tenantId: string): Promise<ChainState> {
    const s = this.state.get(tenantId);
    if (s) return { ...s };
    return {
      tenant_id: tenantId,
      chain_height: 0,
      previous_receipt_hash: GENESIS_HASH,
      updated_at: new Date().toISOString(),
    };
  }

  async advance(
    previousState: ChainState,
    newReceiptHash: string,
    newReceiptId: string
  ): Promise<ChainState> {
    const current = this.state.get(previousState.tenant_id);
    if (current && current.chain_height !== previousState.chain_height) {
      throw new ConcurrentChainWriteError(
        previousState.tenant_id,
        current.chain_height
      );
    }
    const next: ChainState = {
      tenant_id: previousState.tenant_id,
      chain_height: previousState.chain_height + 1,
      previous_receipt_hash: newReceiptHash,
      last_receipt_id: newReceiptId,
      updated_at: new Date().toISOString(),
    };
    this.state.set(previousState.tenant_id, next);
    return { ...next };
  }
}

/**
 * Postgres-backed store. Requires the following table:
 *
 *   CREATE TABLE ledger_chain_state (
 *     tenant_id              TEXT PRIMARY KEY,
 *     chain_height           BIGINT NOT NULL,
 *     previous_receipt_hash  TEXT NOT NULL,
 *     last_receipt_id        TEXT,
 *     updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *
 *   -- Row-level security (production):
 *   ALTER TABLE ledger_chain_state ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY ledger_chain_state_tenant_isolation
 *     ON ledger_chain_state
 *     USING (tenant_id = current_setting('ledger.tenant_id'));
 *
 * Every query MUST run with the session variable `ledger.tenant_id` set, or
 * the policy above matches nothing. This store sets it per transaction via
 * set_config(..., true), but ONLY when the pool exposes `connect()`: the
 * variable and the query it guards have to share one connection, and
 * `pool.query` may hand each statement a different one. Pass a real pg Pool.
 *
 * Note that ENABLE ROW LEVEL SECURITY does not apply to the table's OWNER.
 * Deploy with ALTER TABLE ... FORCE ROW LEVEL SECURITY (as
 * scripts/postgres-init.sql does) or connect as a non-owner role, otherwise
 * the policies are inert and isolation rests entirely on the WHERE clauses.
 *
 * Concurrency model:
 *   - Single-statement UPSERT with CAS on chain_height.
 *   - If the UPSERT's WHERE clause (chain_height = previous + 0) fails,
 *     we throw ConcurrentChainWriteError. The caller may retry.
 *
 * Connection pool:
 *   - Pass a `pg` Pool instance into the constructor. We do not import
 *     pg directly to keep it an optional dependency.
 */
export interface PgQueryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/** A checked-out connection. `release()` returns it to the pool. */
export interface PgClient extends PgQueryable {
  release: () => void;
}

export interface PgPool extends PgQueryable {
  // Minimal subset of node-postgres Pool we use. Any client that
  // matches this shape can be passed in.
  /**
   * Check out a single connection. REQUIRED for row-level security: the
   * tenant context is a session variable, so it and the query it guards must
   * run on the SAME connection. Calling `pool.query` alone can hand each
   * statement a different connection, which is why the tenant context cannot
   * be set without this. Optional only for backward compatibility.
   */
  connect?: () => Promise<PgClient>;
}

export class PostgresChainStateStore implements ChainStateStore {
  constructor(
    private readonly pool: PgPool,
    private readonly tableName: string = "ledger_chain_state"
  ) {}

  /**
   * Run `fn` with `ledger.tenant_id` set, so the RLS policies in
   * scripts/postgres-init.sql actually match. This module's own documentation
   * claimed "the reference implementation here issues SET LOCAL for you" while
   * no code ever did, so every RLS policy evaluated `tenant_id = NULL`. That
   * fails closed rather than open, but it meant isolation rested entirely on
   * the WHERE clauses, and if the app connects as the table owner (the common
   * case) RLS is bypassed altogether unless the table is FORCEd.
   *
   * set_config(..., true) is transaction-local, so the value is discarded at
   * COMMIT and cannot leak to the next borrower of a pooled connection.
   */
  private async withTenant<T>(
    tenantId: string,
    fn: (q: PgQueryable) => Promise<T>
  ): Promise<T> {
    if (!this.pool.connect) return fn(this.pool);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('ledger.tenant_id', $1, true)", [tenantId]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      // Surface the original failure, not a rollback error on top of it.
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async load(tenantId: string): Promise<ChainState> {
    const sql = `SELECT tenant_id, chain_height, previous_receipt_hash,
                        last_receipt_id, updated_at
                 FROM ${this.tableName}
                 WHERE tenant_id = $1`;
    const r = await this.withTenant(tenantId, (q) => q.query(sql, [tenantId]));
    if (r.rowCount === 0) {
      return {
        tenant_id: tenantId,
        chain_height: 0,
        previous_receipt_hash: GENESIS_HASH,
        updated_at: new Date().toISOString(),
      };
    }
    const row = r.rows[0];
    return {
      tenant_id: String(row.tenant_id),
      chain_height: Number(row.chain_height),
      previous_receipt_hash: String(row.previous_receipt_hash),
      last_receipt_id:
        row.last_receipt_id != null ? String(row.last_receipt_id) : undefined,
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    };
  }

  async advance(
    previousState: ChainState,
    newReceiptHash: string,
    newReceiptId: string
  ): Promise<ChainState> {
    const newHeight = previousState.chain_height + 1;
    // INSERT for genesis, UPDATE for advances. The CAS predicate is the
    // expected chain_height; if another writer advanced first, rowCount=0.
    const r = await this.withTenant(previousState.tenant_id, async (q) => {
    if (previousState.chain_height === 0) {
      // Initial insert: ON CONFLICT means somebody else genesis'd first.
      return q.query(
        `INSERT INTO ${this.tableName}
           (tenant_id, chain_height, previous_receipt_hash, last_receipt_id, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING chain_height`,
        [previousState.tenant_id, newHeight, newReceiptHash, newReceiptId]
      );
    } else {
      return q.query(
        `UPDATE ${this.tableName}
            SET chain_height = $2,
                previous_receipt_hash = $3,
                last_receipt_id = $4,
                updated_at = now()
          WHERE tenant_id = $1
            AND chain_height = $5
          RETURNING chain_height`,
        [
          previousState.tenant_id,
          newHeight,
          newReceiptHash,
          newReceiptId,
          previousState.chain_height,
        ]
      );
    }
    });
    if ((r.rowCount ?? 0) === 0) {
      // CAS lost. Re-read to expose the observed height.
      const observed = await this.load(previousState.tenant_id);
      throw new ConcurrentChainWriteError(
        previousState.tenant_id,
        observed.chain_height
      );
    }
    return {
      tenant_id: previousState.tenant_id,
      chain_height: newHeight,
      previous_receipt_hash: newReceiptHash,
      last_receipt_id: newReceiptId,
      updated_at: new Date().toISOString(),
    };
  }
}
