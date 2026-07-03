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
 * The caller MUST set the session variable `ledger.tenant_id` before
 * any query. The reference implementation here issues SET LOCAL for you.
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
export interface PgPool {
  // Minimal subset of node-postgres Pool we use. Any client that
  // matches this shape can be passed in.
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export class PostgresChainStateStore implements ChainStateStore {
  constructor(
    private readonly pool: PgPool,
    private readonly tableName: string = "ledger_chain_state"
  ) {}

  async load(tenantId: string): Promise<ChainState> {
    const sql = `SELECT tenant_id, chain_height, previous_receipt_hash,
                        last_receipt_id, updated_at
                 FROM ${this.tableName}
                 WHERE tenant_id = $1`;
    const r = await this.pool.query(sql, [tenantId]);
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
    let r;
    if (previousState.chain_height === 0) {
      // Initial insert: ON CONFLICT means somebody else genesis'd first.
      r = await this.pool.query(
        `INSERT INTO ${this.tableName}
           (tenant_id, chain_height, previous_receipt_hash, last_receipt_id, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING chain_height`,
        [previousState.tenant_id, newHeight, newReceiptHash, newReceiptId]
      );
    } else {
      r = await this.pool.query(
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
