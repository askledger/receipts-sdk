# AskLedger · Operations Runbook

> Authoritative on-call reference for SRE / Platform engineers running the
> AskLedger hosted SaaS. Every alert listed here MUST have a runbook
> entry. If you get paged for something not in here, file a PR.

**Audience:** SRE, on-call platform engineer.
**Prerequisites:** prod kubeconfig, PagerDuty access, status-page admin,
deploy-bot in `#ops-prod`, `kubectl` + `psql` + `aws` (or `az`/`gcp`).

---

## 1 · Service map

| Service | Purpose | SLO | Owner |
|---|---|---|---|
| `console-web` | Next.js admin UI | 99.9% / p95 < 800 ms | Platform |
| `api-gateway` | Tenant-scoped REST API | 99.95% / p95 < 200 ms | Platform |
| `signer` | Receipt signing service (HSM/KMS-fronted) | 99.99% / p95 < 50 ms | Crypto |
| `chain-store` | Postgres + append-only chain tables | 99.95% / p99 write < 100 ms | Data |
| `tlog` | RFC 9162 transparency log (Trillian-backed) | 99.9% / p95 < 300 ms | Crypto |
| `evidence-svc` | Evidence pack generator (async) | 99.5% / packs in < 5 min | Platform |
| `extension-relay` | Browser-extension ingest endpoint | 99.95% / p95 < 100 ms | Platform |

---

## 2 · Quick reference

```
Status page  ........  status.github.com/askledger/receipts-sdk  (Atlassian Statuspage)
Pager        ........  PagerDuty service "PL Prod"
Runbook      ........  docs/operations/RUNBOOK.md (this file)
Incident war room  ..  #incident-prod (auto-created by PagerDuty)
Customer comms     ..  #customer-comms (Mariam owns external messaging)
Deploy bot         ..  /deploy <service> <env> <sha>   in #ops-prod
Lock deploys       ..  /freeze prod reason="..."        in #ops-prod
```

---

## 3 · Common alerts

### 3.1 `signer.signing_latency_p95_high`
Triggers when `p95(pl_signer_sign_duration_ms) > 100` for 5 min.

**Likely causes (ranked):**
1. KMS throttling — check CloudWatch `KMS.ThrottlingException`.
2. HSM session pool exhausted — check `pl_signer_hsm_pool_in_use`.
3. Cold partition under load after deploy — wait 2 min.

**Immediate action:**
```
kubectl -n pl-prod get pods -l app=signer
kubectl -n pl-prod logs -l app=signer --tail=200 | grep -E "throttl|hsm|pool"
```
If KMS throttling: file an AWS limit increase (instant for KMS RPS).
If HSM pool: scale `signer` replicas +50% via `/deploy signer prod scale=+50%`.

**Escalation:** if p95 > 250 ms for 10 min, page Crypto on-call.

### 3.2 `chain.write_failure_rate_high`
Triggers when `rate(pl_chain_write_errors[5m]) > 0.5%`.

**Likely causes:**
1. Postgres failover in progress (rare; tolerated by retry).
2. Unique constraint violation on `(tenant_id, prev_hash)` — chain race.
3. Disk full on primary.

**Immediate action:**
```
psql $PROD_DSN -c "SELECT * FROM pl_chain_writes_recent_errors LIMIT 50;"
psql $PROD_DSN -c "SELECT pg_size_pretty(pg_database_size('pl_chain'));"
```
If chain race: confirm SDK is using `chain.next()` not manual `prev_hash`.
If disk: trigger `pg_basebackup` to a fresh volume; alert Data lead.

### 3.3 `tlog.sth_publish_delayed`
Triggers when `time() - pl_tlog_last_sth_timestamp > 300` (no STH for 5 min).

**Likely causes:**
1. Trillian leader unavailable (cluster electing).
2. Signing key for STH is locked (rotation in flight).

**Immediate action:**
```
kubectl -n pl-prod exec -it deploy/trillian-log-server -- trillian_log_admin --rpc_server=localhost:8090 tree get $TLOG_ID
```
Confirm tree is healthy. If not, page Crypto on-call.

**Customer impact:** receipts continue to sign and chain. Inclusion proofs
become available with delay. Status page severity: minor.

### 3.4 `extension.identity_binding_failures_high`
Triggers when `rate(pl_extension_identity_failures[5m]) > 1%`.

**Likely causes:**
1. Tenant's OIDC provider unreachable (their problem, but visible to us).
2. Token endpoint TLS cert expired upstream.
3. Bug in `identity.js` after extension update.

**Immediate action:**
1. Identify affected tenants:
   ```
   kubectl -n pl-prod logs -l app=extension-relay --tail=500 | \
     grep "identity_binding_failed" | jq -r .tenant_id | sort -u
   ```
2. If single tenant: notify them via `#customer-comms`.
3. If across tenants: roll back the extension update via
   `/deploy extension prod rollback`.

### 3.5 `tenant.cross_tenant_query_detected`
**Severity: P0. Page CTO + Security on-call immediately.**

This fires when a query attempt was rejected by the tenant isolation
middleware because the requested `tenant_id` did not match the session's
bound tenant.

**Immediate action:**
1. Do NOT roll back automatically.
2. Capture the request log:
   ```
   kubectl -n pl-prod logs -l app=api-gateway --since=15m | \
     grep "cross_tenant_block" | tee /tmp/cross-tenant.log
   ```
3. Identify the user, session, source IP, and target tenant.
4. If repeatable from a single user: suspend that user via
   `/admin user-suspend <user_id>`.
5. File incident: `Sec-P0 / Cross-tenant query attempt`.
6. Capture forensic snapshot of relevant logs before retention window.

**Customer comms:** None unless a successful breach is confirmed.

---

## 4 · Deployments

### 4.1 Normal deploy
```
/deploy console prod sha=abc123
/deploy api-gateway prod sha=abc123
```
Each deploy is canary 5% → 25% → 100% with 5-min soak between steps. If any
SLO alert fires during canary, the deploy auto-rolls-back.

### 4.2 Emergency rollback
```
/deploy <service> prod rollback
```
Restores the previous image tag within ~60 s. Always announce in
`#ops-prod` before and after.

### 4.3 Database migrations
Migrations run via `pl-migrate run --env=prod`. Rules:
1. Forward-compatible only. Old pods must keep working against new schema.
2. Never `DROP COLUMN`; first `ALTER COLUMN ... NULL`, ship, then drop next release.
3. Long-running migrations (> 30 s) require a maintenance window or
   `pg_repack`-style online tooling.

---

## 5 · Key rotation

### 5.1 Tenant signing key rotation (annual + on-demand)
1. `pl-keys rotate --tenant <id> --reason "annual"`. This creates a new key,
   marks the old key as `signing=false` but `verify=true`.
2. Wait 14 days. Confirm zero signs against the old key.
3. `pl-keys mark-verify-only --key <kid>`.
4. After the receipt retention horizon for the tenant (typically 7 years),
   `pl-keys archive --key <kid>`. NEVER delete — verify must stay possible.

### 5.2 Compromise rotation (incident)
1. Page Crypto on-call. P0.
2. `pl-keys revoke --key <kid> --reason "suspected_compromise"`. This
   immediately blocks signing.
3. Provision new key per 5.1 step 1.
4. Receipts signed under the compromised key are flagged in the audit log
   but remain verifiable — customers may need to re-attest at the
   transparency log.
5. Customer notification within 24 h per contract.

---

## 6 · Backup + restore

### 6.1 Chain store
- Full backup: nightly at 03:00 UTC via `pg_basebackup` → S3 cross-region.
- WAL archive: continuous, retained 35 days.
- RPO: 5 minutes. RTO: 30 minutes.

### 6.2 Transparency log
- Tree state backed by Trillian's RDBMS backend (Postgres). Same backup
  policy as the chain store.
- STH archive: every STH is pushed to immutable S3 with `Object Lock`,
  retained 10 years. This is the regulatory artifact.

### 6.3 HSM-backed keys
- AWS KMS: cross-region key replicas in `us-east-1` + `eu-west-1`.
- Azure Key Vault: geo-redundant by default.
- GCP KMS: multi-region keyrings.
- Customer-held PKCS#11 keys: customer's responsibility to back up.

### 6.4 Restore drill
A full restore-from-cold drill runs quarterly. The drill cuts a fresh
namespace, restores yesterday's nightly + WAL, replays the last 10k chain
writes from log, and verifies the resulting chain against the tlog STH.
If the drill fails, the quarter does not close.

---

## 7 · Incident response

### 7.1 Severities
- **P0** — customer-impacting outage OR security breach. Page CEO + CTO.
  Status page red. Comms cadence: every 30 min.
- **P1** — degradation affecting > 5% of customers. Page on-call.
  Status page yellow. Comms cadence: every 60 min.
- **P2** — single-tenant impact or non-customer-facing. No status page.
  Comms cadence: every 4 h.

### 7.2 Roles in war room
- **Incident Commander (IC)** — owns the call. Does NOT debug.
- **Tech Lead** — owns the technical investigation.
- **Comms Lead** — owns customer messaging + status page.
- **Scribe** — captures timeline + decisions.

### 7.3 Post-incident
Blameless postmortem within 5 business days. Posted to
`docs/operations/postmortems/YYYY-MM-DD-<slug>.md`. Must include:
- Timeline (UTC, minute granularity).
- Customer impact (count, duration, severity).
- Root cause.
- Detection — did our monitoring catch it, or did a customer?
- Action items with owner + due date.

---

## 8 · Customer-facing comms

All external comms route through Mariam (Customer Comms) or the on-call IC
if Mariam is unreachable.

Templates: `docs/operations/comms-templates/`.

Never claim "no data was affected" before forensics confirms it.
Never name a tenant in a multi-tenant incident announcement.

---

## 9 · Compliance + audit hooks

- All deploys are receipt-signed and appended to the platform-level audit log.
  See `pl-audit show --service api-gateway --since 24h`.
- All key operations are signed and appended to the same log.
- All cross-tenant query rejections are signed and appended.
- Audit log is itself in a chain, sealed nightly to the customer-facing
  transparency log under `tenant=__platform__`.

When a regulator asks "show us what happened on day X," the answer is
`pl-evidence pack --since YYYY-MM-DD --until YYYY-MM-DD --service all`,
which produces a signed bundle in < 5 min.
