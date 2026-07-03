-- AskLedger — initial schema.
-- Convention: every table includes tenant_id, every read+write path sets
-- pl.current_tenant via SET LOCAL, and RLS policies enforce equality.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS pl;

-- Tenants -------------------------------------------------------------------

CREATE TABLE pl.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            CITEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','team','business','enterprise')),
  region          TEXT NOT NULL DEFAULT 'us-east-1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX tenants_active_idx ON pl.tenants (id) WHERE deleted_at IS NULL;

-- Users (post-SCIM provision) -----------------------------------------------

CREATE TABLE pl.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  external_id     TEXT,                       -- SCIM externalId
  username        CITEXT NOT NULL,
  email           CITEXT NOT NULL,
  display_name    TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  roles           TEXT[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);
CREATE INDEX users_tenant_idx ON pl.users (tenant_id);
CREATE INDEX users_external_idx ON pl.users (tenant_id, external_id) WHERE external_id IS NOT NULL;

-- Keys (signing) -------------------------------------------------------------

CREATE TABLE pl.keys (
  kid             TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  algorithm       TEXT NOT NULL CHECK (algorithm IN ('EdDSA','ES256')),
  public_key      BYTEA NOT NULL,
  hsm_uri         TEXT NOT NULL,                  -- kms://aws/arn:... or pkcs11://slot/label
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','verify-only','revoked','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT
);
CREATE INDEX keys_tenant_status_idx ON pl.keys (tenant_id, status);

-- Chain head per tenant ------------------------------------------------------

CREATE TABLE pl.chain_heads (
  tenant_id           UUID PRIMARY KEY REFERENCES pl.tenants(id),
  chain_height        BIGINT NOT NULL DEFAULT 0,
  receipt_hash        TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipts -------------------------------------------------------------------

CREATE TABLE pl.receipts (
  receipt_id          TEXT PRIMARY KEY,            -- UUIDv7 hex
  tenant_id           UUID NOT NULL REFERENCES pl.tenants(id),
  chain_height        BIGINT NOT NULL,
  receipt_hash        TEXT NOT NULL,
  previous_hash       TEXT NOT NULL,
  signature           TEXT NOT NULL,               -- base64
  kid                 TEXT NOT NULL REFERENCES pl.keys(kid),
  body                JSONB NOT NULL,              -- the Receipt object
  issued_at           TIMESTAMPTZ NOT NULL,
  inserted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chain_height)
);
CREATE INDEX receipts_tenant_issued_idx ON pl.receipts (tenant_id, issued_at DESC);
CREATE INDEX receipts_tenant_hash_idx ON pl.receipts (tenant_id, receipt_hash);
CREATE INDEX receipts_body_event_type_idx ON pl.receipts ((body -> 'event' ->> 'event_type'));

-- Audit log (signed receipts of privileged actions) -------------------------

CREATE TABLE pl.audit_events (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  actor_sub       TEXT NOT NULL,
  actor_email     TEXT NOT NULL,
  action          TEXT NOT NULL,
  target          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  receipt_id      TEXT REFERENCES pl.receipts(receipt_id),   -- nullable until signer drains outbox
  at              TIMESTAMPTZ NOT NULL
);
CREATE INDEX audit_tenant_at_idx ON pl.audit_events (tenant_id, at DESC);

-- Idempotency keys -----------------------------------------------------------

CREATE TABLE pl.idempotency_keys (
  tenant_id       UUID NOT NULL REFERENCES pl.tenants(id),
  key             TEXT NOT NULL,
  body_hash       TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

-- Plan / entitlements --------------------------------------------------------

CREATE TABLE pl.entitlements (
  tenant_id       UUID PRIMARY KEY REFERENCES pl.tenants(id),
  plan            TEXT NOT NULL,
  features        JSONB NOT NULL DEFAULT '{}',
  seat_limit      INT,
  receipt_limit   BIGINT,
  add_ons         TEXT[] NOT NULL DEFAULT '{}',
  current_period_end TIMESTAMPTZ,
  stripe_customer TEXT,
  stripe_subscription TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-level security --------------------------------------------------------
-- Every row-level-protected table requires SET LOCAL pl.current_tenant = '<uuid>'
-- to be issued in the same transaction. The pl_admin role bypasses RLS for
-- migrations + platform ops only.

ALTER TABLE pl.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.chain_heads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.audit_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl.entitlements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users   ON pl.users         USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_keys    ON pl.keys          USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_heads   ON pl.chain_heads   USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_recs    ON pl.receipts      USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_audit   ON pl.audit_events  USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_idem    ON pl.idempotency_keys USING (tenant_id::text = current_setting('pl.current_tenant', true));
CREATE POLICY tenant_isolation_ent     ON pl.entitlements  USING (tenant_id::text = current_setting('pl.current_tenant', true));

COMMIT;
