// Postgres access with mandatory tenant binding. Every query goes through
// withTenantTx which sets pl.current_tenant inside a single transaction so
// row-level security policies enforce isolation.

import type { TenantContext } from "./tenant-context.js";

type Row = Record<string, unknown>;

export interface Sql {
  query<T = Row>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface Pool {
  connect(): Promise<{ sql: Sql; release: (err?: unknown) => void }>;
  end(): Promise<void>;
}

// The real pg pool is lazy-imported so this module is safe to include from
// edge runtimes. Production sets PL_DATABASE_URL.

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const url = process.env.PL_DATABASE_URL;
  if (!url) throw new Error("PL_DATABASE_URL not set");
  const pg = await import(/* @vite-ignore */ "pg" as string).catch(() => null);
  if (!pg) throw new Error("pg driver not installed");
  const { Pool } = pg as { Pool: new (opts: unknown) => { connect: () => Promise<{ query: Sql["query"]; release: () => void }> ; end: () => Promise<void> } };
  const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: true }, max: 10 });
  pool = {
    async connect() {
      const c = await p.connect();
      return {
        sql: { query: c.query.bind(c) },
        release: c.release.bind(c),
      };
    },
    end: () => p.end(),
  };
  return pool;
}

export async function withTenantTx<T>(ctx: TenantContext, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const p = await getPool();
  const c = await p.connect();
  try {
    await c.sql.query("BEGIN");
    await c.sql.query("SET LOCAL statement_timeout = '5s'");
    await c.sql.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    await c.sql.query("SELECT set_config('pl.current_tenant', $1, true)", [ctx.tenantId]);
    const out = await fn(c.sql);
    await c.sql.query("COMMIT");
    return out;
  } catch (err) {
    await c.sql.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}
