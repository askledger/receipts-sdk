-- AskLedger · initial Postgres schema.
--
-- Run automatically by the docker-compose Postgres container on first
-- boot. Production deployments run this via the SDK's migration tooling.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Per-tenant chain state (the PostgresChainStateStore writes here).
CREATE TABLE IF NOT EXISTS ledger_chain_state (
  tenant_id              TEXT PRIMARY KEY,
  chain_height           BIGINT NOT NULL,
  previous_receipt_hash  TEXT NOT NULL,
  last_receipt_id        TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipts themselves (canonical JSON + integrity + signatures).
CREATE TABLE IF NOT EXISTS ledger_receipts (
  receipt_id             TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL,
  chain_height           BIGINT NOT NULL,
  previous_receipt_hash  TEXT NOT NULL,
  receipt_hash           TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  source_system          TEXT NOT NULL,
  ai_vendor              TEXT,
  ai_model               TEXT,
  decision               TEXT,
  classification         TEXT,
  captured_at            TIMESTAMPTZ NOT NULL,
  issued_at              TIMESTAMPTZ NOT NULL,
  signed_receipt         JSONB NOT NULL,
  CONSTRAINT chain_height_unique_per_tenant UNIQUE (tenant_id, chain_height)
);

CREATE INDEX IF NOT EXISTS idx_receipts_tenant_time
  ON ledger_receipts (tenant_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant_vendor
  ON ledger_receipts (tenant_id, ai_vendor);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant_decision
  ON ledger_receipts (tenant_id, decision);

-- Row-level security: every query MUST execute under a tenant context.
ALTER TABLE ledger_chain_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_receipts ENABLE ROW LEVEL SECURITY;

-- ENABLE alone does NOT apply to the table owner, and applications very
-- commonly connect as the owner, which left these policies inert and tenant
-- isolation resting entirely on the application's WHERE clauses. FORCE applies
-- them to the owner too.
ALTER TABLE ledger_chain_state FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY ledger_chain_state_tenant_isolation
  ON ledger_chain_state
  USING (tenant_id = current_setting('ledger.tenant_id', true));

CREATE POLICY ledger_receipts_tenant_isolation
  ON ledger_receipts
  USING (tenant_id = current_setting('ledger.tenant_id', true));

-- Demo seed: insert a placeholder tenant chain so the console UI has
-- non-empty state on first boot. Production never runs this.
INSERT INTO ledger_chain_state (tenant_id, chain_height, previous_receipt_hash, updated_at)
VALUES ('acme-bank', 0,
        '0000000000000000000000000000000000000000000000000000000000000000',
        now())
ON CONFLICT (tenant_id) DO NOTHING;
