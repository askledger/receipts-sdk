// Repositories. Default path: real Postgres via `withTenantTx` so row-
// level security enforces tenant isolation. Fallback path: in-memory
// fixtures when PL_DATABASE_URL is unset, so the docker-compose
// hello-world and the local-dev console keep working without a DB.

import type { TenantContext } from "./tenant-context.js";
import { withTenantTx } from "./db.js";
import * as fx from "./fixtures.js";

const HAS_DB = Boolean(process.env.PL_DATABASE_URL);

async function dbOr<T>(ctx: TenantContext, query: (sql: import("./db.js").Sql) => Promise<T>, fallback: T): Promise<T> {
  if (!HAS_DB) return fallback;
  try {
    return await withTenantTx(ctx, query);
  } catch (e) {
    // Hard surface in dev; quiet log + fallback in prod so a DB blip
    // doesn't take the dashboard offline. The fallback IS the documented
    // graceful-degradation behaviour.
    if (process.env.NODE_ENV !== "production") throw e;
    console.error("[repos] db error, serving fallback:", (e as Error).message);
    return fallback;
  }
}

interface ReceiptRow {
  receipt_id: string;
  chain_height: number;
  receipt_hash: string;
  kid: string;
  issued_at: string;
  event_type: string;
  ai_vendor: string;
  ai_model: string;
}

export const repos = {
  compliance: {
    coverage: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.complianceCoverage[number]>(`
        SELECT regulator, articles_satisfied, articles_total, confidence, deadline, status, label
        FROM pl.compliance_coverage_view
        ORDER BY confidence DESC
      `);
      return rows;
    }, fx.complianceCoverage as unknown as typeof fx.complianceCoverage[number][]),

    gaps: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.complianceGaps[number]>(`
        SELECT id, regulator, article, gap, count, severity
        FROM pl.compliance_gaps
        WHERE resolved_at IS NULL
        ORDER BY severity DESC, count DESC
      `);
      return rows;
    }, fx.complianceGaps as unknown as typeof fx.complianceGaps[number][]),
  },

  hr: {
    violators: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.hrViolators[number]>(`
        SELECT user_, team, events, severity, last_event AS "lastEvent"
        FROM pl.hr_violators_view
        ORDER BY events DESC
        LIMIT 100
      `);
      return rows;
    }, fx.hrViolators as unknown as typeof fx.hrViolators[number][]),

    teams: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.hrTeams[number]>(`
        SELECT team, users, violations_week, training_completion, status, label
        FROM pl.hr_teams_view
        ORDER BY violations_week DESC
      `);
      return rows;
    }, fx.hrTeams as unknown as typeof fx.hrTeams[number][]),
  },

  legal: {
    holds: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.legalHolds[number]>(`
        SELECT id, matter, custodians, scope, status, label
        FROM pl.litigation_holds
        WHERE status = 'active'
        ORDER BY created_at DESC
      `);
      return rows;
    }, fx.legalHolds as unknown as typeof fx.legalHolds[number][]),

    gdpr22: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.legalGdpr22[number]>(`
        SELECT receipt_id AS rid, time, subject, model, reviewed_by, status
        FROM pl.gdpr22_events_view
        ORDER BY time DESC
        LIMIT 50
      `);
      return rows;
    }, fx.legalGdpr22 as unknown as typeof fx.legalGdpr22[number][]),
  },

  finance: {
    spendTeams: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.financeSpendTeams[number]>(`
        SELECT team, spend_mtd, growth, tokens_in_m AS "tokens_in_M", top_use_case
        FROM pl.spend_by_team_view
        ORDER BY spend_mtd DESC
      `);
      return rows;
    }, fx.financeSpendTeams as unknown as typeof fx.financeSpendTeams[number][]),

    spendVendors: (ctx: TenantContext) => dbOr(ctx, async (sql) => {
      const { rows } = await sql.query<typeof fx.financeSpendVendors[number]>(`
        SELECT vendor, spend_mtd, share, unit_cost_per_1k_tokens
        FROM pl.spend_by_vendor_view
        ORDER BY spend_mtd DESC
      `);
      return rows;
    }, fx.financeSpendVendors as unknown as typeof fx.financeSpendVendors[number][]),
  },

  receipts: {
    list: (ctx: TenantContext, limit: number, offset: number) => dbOr<ReceiptRow[]>(ctx, async (sql) => {
      const { rows } = await sql.query<ReceiptRow>(`
        SELECT receipt_id, chain_height, receipt_hash, kid, issued_at,
               body -> 'event' ->> 'event_type' AS event_type,
               body -> 'event' -> 'subject' ->> 'ai_vendor' AS ai_vendor,
               body -> 'event' -> 'subject' ->> 'ai_model' AS ai_model
        FROM pl.receipts
        ORDER BY chain_height DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      return rows;
    }, []),
  },

  scimUsers: {
    create: (ctx: TenantContext, input: { externalId?: string; username: string; email: string; displayName?: string; active?: boolean }) =>
      withTenantTx(ctx, async (sql) => {
        const { rows } = await sql.query<{ id: string; created_at: string }>(`
          INSERT INTO pl.users (tenant_id, external_id, username, email, display_name, active)
          VALUES (current_setting('pl.current_tenant')::uuid, $1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, username) DO UPDATE
            SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
                active = EXCLUDED.active, updated_at = now()
          RETURNING id, created_at
        `, [input.externalId ?? null, input.username, input.email, input.displayName ?? null, input.active ?? true]);
        return rows[0];
      }),
    deactivate: (ctx: TenantContext, id: string) => withTenantTx(ctx, async (sql) => {
      await sql.query("UPDATE pl.users SET active = false, updated_at = now() WHERE id = $1", [id]);
    }),
  },

  entitlements: {
    upsert: (ctx: TenantContext, e: { plan: string; features?: Record<string, unknown>; seat_limit?: number; current_period_end?: string; stripe_customer?: string; stripe_subscription?: string }) =>
      withTenantTx(ctx, async (sql) => {
        await sql.query(`
          INSERT INTO pl.entitlements (tenant_id, plan, features, seat_limit, current_period_end, stripe_customer, stripe_subscription)
          VALUES (current_setting('pl.current_tenant')::uuid, $1, $2, $3, $4, $5, $6)
          ON CONFLICT (tenant_id) DO UPDATE SET
            plan = EXCLUDED.plan,
            features = EXCLUDED.features,
            seat_limit = EXCLUDED.seat_limit,
            current_period_end = EXCLUDED.current_period_end,
            stripe_customer = EXCLUDED.stripe_customer,
            stripe_subscription = EXCLUDED.stripe_subscription,
            updated_at = now()
        `, [e.plan, e.features ?? {}, e.seat_limit ?? null, e.current_period_end ?? null, e.stripe_customer ?? null, e.stripe_subscription ?? null]);
      }),
  },
};
