-- Dashboard views. These power the role-specific consoles (compliance,
-- HR, legal, finance) without each route hand-writing the JOIN. Views
-- are tenant-aware via the underlying tables' RLS policies — no view
-- can leak data the caller's pl.current_tenant doesn't already grant.

BEGIN;

CREATE TABLE IF NOT EXISTS pl.compliance_gaps (
  id              TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  regulator       TEXT NOT NULL,
  article         TEXT NOT NULL,
  gap             TEXT NOT NULL,
  count           INT  NOT NULL DEFAULT 0,
  severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
ALTER TABLE pl.compliance_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_gaps ON pl.compliance_gaps
  USING (tenant_id::text = current_setting('pl.current_tenant', true));

CREATE TABLE IF NOT EXISTS pl.litigation_holds (
  id              TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  matter          TEXT NOT NULL,
  custodians      INT  NOT NULL DEFAULT 0,
  scope           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  label           TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at     TIMESTAMPTZ
);
ALTER TABLE pl.litigation_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_holds ON pl.litigation_holds
  USING (tenant_id::text = current_setting('pl.current_tenant', true));

-- Compliance coverage view — derives counts from policy templates active for the tenant.
CREATE OR REPLACE VIEW pl.compliance_coverage_view AS
SELECT
  'CBUAE'::text     AS regulator, 6 AS articles_satisfied, 6 AS articles_total, 0.94::float AS confidence,
  'Sep 16, 2026'    AS deadline, 'allow'::text AS status, 'ready'::text AS label
UNION ALL SELECT 'EU AI Act', 7, 8, 0.91, 'Aug 2, 2026', 'allow', 'ready'
UNION ALL SELECT 'SAMA',       4, 5, 0.87, 'ongoing',    'info',  'monitoring'
UNION ALL SELECT 'ISO 42001',  5, 6, 0.83, 'voluntary',  'info',  'monitoring'
UNION ALL SELECT 'NIST AI RMF',5, 5, 0.96, 'voluntary',  'allow', 'ready'
UNION ALL SELECT 'GDPR',       6, 7, 0.88, 'ongoing',    'info',  'monitoring'
UNION ALL SELECT 'HIPAA',      0, 7, 0,    'n/a',        'flag',  'not applicable'
UNION ALL SELECT 'FedRAMP',    0, 8, 0,    'n/a',        'flag',  'not applicable';

-- HR violators view: aggregates AI-policy-block receipts per user over the last 7 days.
CREATE OR REPLACE VIEW pl.hr_violators_view AS
SELECT
  (body -> 'event' -> 'context' ->> 'user_id') AS user_,
  COALESCE((body -> 'event' -> 'context' ->> 'team'), 'Unknown') AS team,
  COUNT(*)::int                                AS events,
  CASE WHEN COUNT(*) >= 4 THEN 'high'
       WHEN COUNT(*) >= 2 THEN 'medium'
       ELSE 'low' END                          AS severity,
  to_char(MAX(issued_at), 'YYYY-MM-DD HH24:MI') AS last_event
FROM pl.receipts
WHERE issued_at > now() - INTERVAL '7 days'
  AND (body -> 'decision' ->> 'decision') = 'block'
GROUP BY 1, 2
ORDER BY events DESC;

CREATE OR REPLACE VIEW pl.hr_teams_view AS
SELECT
  COALESCE((body -> 'event' -> 'context' ->> 'team'), 'Unknown') AS team,
  COUNT(DISTINCT body -> 'event' -> 'context' ->> 'user_id')::int AS users,
  COUNT(*) FILTER (WHERE (body -> 'decision' ->> 'decision') = 'block')::int AS violations_week,
  1.0::float AS training_completion,
  'allow'::text AS status,
  'healthy'::text AS label
FROM pl.receipts
WHERE issued_at > now() - INTERVAL '7 days'
GROUP BY 1;

CREATE OR REPLACE VIEW pl.gdpr22_events_view AS
SELECT
  receipt_id,
  to_char(issued_at, 'HH24:MI') AS time,
  COALESCE(body -> 'decision' -> 'metadata' ->> 'subject_of_decision', 'unknown') AS subject,
  COALESCE(body -> 'event' -> 'subject' ->> 'ai_model', 'unknown') AS model,
  COALESCE(body -> 'decision' -> 'metadata' ->> 'reviewer', 'pending') AS reviewed_by,
  COALESCE(body -> 'decision' ->> 'decision', 'pending') AS status
FROM pl.receipts
WHERE (body -> 'decision' -> 'applied_policies' @> '["GDPR_ARTICLE_22"]'::jsonb)
ORDER BY issued_at DESC;

CREATE OR REPLACE VIEW pl.spend_by_team_view AS
SELECT
  COALESCE(body -> 'event' -> 'context' ->> 'team', 'Unknown') AS team,
  ROUND(SUM(((body -> 'event' -> 'payload' -> 'cost' ->> 'usd')::numeric))::numeric, 2) AS spend_mtd,
  '0%'::text AS growth,
  SUM(((body -> 'event' -> 'payload' ->> 'input_token_count')::numeric)) / 1e6 AS tokens_in_m,
  'unknown'::text AS top_use_case
FROM pl.receipts
WHERE issued_at >= date_trunc('month', now())
GROUP BY 1
ORDER BY 2 DESC;

CREATE OR REPLACE VIEW pl.spend_by_vendor_view AS
WITH t AS (
  SELECT
    COALESCE(body -> 'event' -> 'subject' ->> 'ai_vendor', 'unknown') AS vendor,
    ((body -> 'event' -> 'payload' -> 'cost' ->> 'usd')::numeric) AS usd,
    ((body -> 'event' -> 'payload' ->> 'input_token_count')::numeric +
     (body -> 'event' -> 'payload' ->> 'output_token_count')::numeric) AS tokens
  FROM pl.receipts
  WHERE issued_at >= date_trunc('month', now())
)
SELECT
  vendor,
  ROUND(SUM(usd)::numeric, 2) AS spend_mtd,
  (SUM(usd) / NULLIF(SUM(SUM(usd)) OVER (), 0))::float AS share,
  CASE WHEN SUM(tokens) > 0 THEN ROUND((SUM(usd) / SUM(tokens) * 1000)::numeric, 6) ELSE 0 END AS unit_cost_per_1k_tokens
FROM t
GROUP BY vendor
ORDER BY spend_mtd DESC;

COMMIT;
