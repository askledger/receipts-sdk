# Zero Trust Architecture — Project Ledger

**Version:** 1.0
**Framework alignment:** NIST SP 800-207 (Zero Trust Architecture), CISA ZTMM v2.0, DoD Zero Trust Reference Architecture v2.0
**Applies to:** Project Ledger SaaS hosted tier AND customer self-deploy reference architecture

This document is the Zero Trust reference design for any deployment of Project Ledger — hosted, customer-self-managed, or hybrid. It is the architecture review document a CISO presents to their board when greenlighting Project Ledger for regulated workloads.

---

## 1. Zero Trust foundational principles

NIST SP 800-207 §2.1 — Project Ledger implements all seven tenets:

| Tenet | Implementation |
|---|---|
| All data sources and computing services are considered resources | Every Project Ledger service, every Postgres row, every S3 object, every TSA call is treated as an addressable resource with its own policy. |
| All communication is secured regardless of network location | mTLS everywhere via SPIFFE SVID-bound certificates; no plaintext intra-service traffic. |
| Access to individual enterprise resources is granted on a per-session basis | Short-lived SVIDs (≤1h) + per-request OPA decision; no long-lived intra-service credentials. |
| Access to resources is determined by dynamic policy | OPA policy bundles with risk score inputs (device posture, geo, time, anomaly score). |
| The enterprise monitors and measures the integrity and security posture of all owned and associated assets | Continuous SBOM verification + runtime attestation via SPIRE + Sigstore Cosign on container images. |
| All resource authentication and authorization are dynamic and strictly enforced before access is allowed | Authentication via OIDC; authorization via OPA per request; both re-evaluated continuously. |
| The enterprise collects as much information as possible about the current state of assets, network infrastructure and communications and uses it to improve its security posture | Telemetry to SIEM; every OPA decision is a logged event; anomaly detection feedback loop. |

---

## 2. Logical architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          IDENTITY PLANE                              │
│  ┌─────────┐    ┌─────────┐    ┌────────────────┐    ┌────────────┐ │
│  │  OIDC   │    │ SPIRE   │    │ Customer IdP   │    │  HSM/KMS   │ │
│  │ (humans)│    │(workloads)│   │(SAML/OIDC fed) │    │ (signing)  │ │
│  └────┬────┘    └────┬────┘    └────────┬───────┘    └──────┬─────┘ │
└───────┼──────────────┼──────────────────┼───────────────────┼───────┘
        │              │ SVID             │ JWT/SAML          │ HSM cert
        ▼              ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          POLICY PLANE                                │
│  ┌──────────────────┐    ┌─────────────────────────────────────────┐ │
│  │   OPA PDP        │◀──▶│  Risk Engine (device posture, anomaly,  │ │
│  │ (policy decision) │    │  geo, time, behavioral baseline)        │ │
│  └────────┬─────────┘    └─────────────────────────────────────────┘ │
└───────────┼──────────────────────────────────────────────────────────┘
            │ allow/deny + obligations
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       ENFORCEMENT PLANE                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Ingress  │  │ Service  │  │  Data    │  │ Console  │  │ Admin  │ │
│  │ Gateway  │  │  Mesh    │  │ Gateway  │  │   UI     │  │  APIs  │ │
│  │ (mTLS)   │  │ (Envoy)  │  │  (RLS)   │  │  (RBAC)  │  │ (JIT)  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       RESOURCE PLANE                                 │
│  Receipts │ Chain state │ Policy bundles │ Audit log │ Customer data │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       VISIBILITY PLANE                               │
│  SIEM │ OPA decision log │ Receipt meta-chain │ Network telemetry    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Identity model

### 3.1 Human identity (employees, customers)

- **OIDC** with mandatory MFA via WebAuthn (FIDO2) — phishing-resistant
- **Federated SSO** for customers via SAML 2.0 or OIDC against their IdP (Okta, Entra ID, Auth0)
- **JIT access** to sensitive operations (data export, key rotation, plan changes): just-in-time elevated role, expires in ≤30 minutes, requires re-MFA, ticket reference required
- **Break-glass account** offline-protected, audited every use, alerts every check-out

### 3.2 Workload identity (services)

- **SPIFFE / SPIRE** issues SVIDs to every workload at startup
- **SVID lifetime ≤1 hour**, auto-rotated
- **SVID binding** to workload selector (k8s service account + namespace + node attestation via TPM where available)
- **No long-lived API keys** between services. Period.

### 3.3 Cryptographic identity (signing keys)

- **HSM-bound private keys** — never extractable from the HSM
- **Key transition events** themselves emit receipts on a meta-chain signed by a different key, creating an unbroken chain of custody

---

## 4. Policy plane (OPA)

### 4.1 Policy decisions are receipts

Every meaningful authorization decision in the platform is itself logged as a Project Ledger receipt with a `decision` block, exactly as defined in the [Receipts Protocol Spec §4.3](../RECEIPTS_PROTOCOL.md#43-decision-block). This means:

- **Every access decision is cryptographically attested**
- **Every policy bundle is content-addressed by sha256** (the `policy_bundle_hash` in the decision block)
- **Auditors can replay** any historical decision against the policy bundle that was in force, with no ambiguity

### 4.2 Policy bundle distribution

- Bundles are produced by the OPA Bundle Builder pipeline (CI step)
- Bundles are signed via Sigstore Cosign — verified on load by every PDP/PEP
- Hot-reload on bundle change (no service restart)
- Old bundle hashes retained forever for historical receipt re-verification

### 4.3 Risk inputs

OPA decisions consider:
- Device posture (managed device required for elevated ops)
- Network location (privileged ops require corporate VPN or Zero Trust Network Access tunnel)
- Time of day relative to user's normal pattern
- Geo (impossible-travel detection blocks)
- Anomaly score from behavioral analytics
- Recent failed attempts

---

## 5. Enforcement plane

### 5.1 Network — Service Mesh

- **Istio or Linkerd** with mTLS-strict policy
- Every service-to-service call carries a SPIFFE SVID
- Envoy sidecar enforces both mTLS and the per-call OPA decision
- Network policies deny-by-default; explicit allowlist per service

### 5.2 Application — request-level authorization

Every API endpoint:
1. Validates JWT/mTLS at edge
2. Extracts principal + context
3. Calls OPA with `(principal, action, resource, context)`
4. OPA returns `{ allow: true, obligations: [...] }`
5. Executor enforces obligations (e.g. mask PII fields, log to high-sensitivity audit)
6. Logs decision as a receipt

### 5.3 Data — Postgres row-level security

```sql
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipts_tenant_isolation ON receipts
  USING (tenant_id = current_setting('ledger.tenant_id'));
```

The application sets `SET LOCAL ledger.tenant_id = $1` at the start of every connection — even if application code is compromised and constructs malicious SQL, RLS prevents cross-tenant leakage at the database engine layer.

### 5.4 Data — object storage

S3 bucket policies enforce tenant prefix isolation. Customer-managed keys via SSE-KMS for at-rest encryption; the platform never holds the unwrapped key.

### 5.5 Admin operations

All admin operations require:
- JIT elevated role (expires ≤30 min)
- Hardware MFA at elevation
- Ticket reference
- Real-time peer approval for production-impacting actions (`prod_break_glass` policy)
- Decision logged as a receipt
- Customer notification (where customer-impacting)

---

## 6. Microsegmentation

| Segment | What lives here | Egress allowed to |
|---|---|---|
| `ingest-public` | Public API receiving signed receipts | `ingest-private`, `policy` |
| `ingest-private` | Hot path for receipt validation | `storage-hot`, `policy` |
| `storage-hot` | Postgres + Redis hot tier | `storage-cold` (backup), `transparency-log` (Merkle batches) |
| `storage-cold` | S3 / Glacier archival | none |
| `policy` | OPA PDPs + risk engine | `identity` for principal lookups |
| `identity` | SPIRE server + OIDC | none |
| `tsa-egress` | RFC 3161 timestamping client | TSA endpoints only |
| `console` | Admin UI backend | `ingest-private` (read-only) |
| `support` | Support tooling (impersonation) | `ingest-private` with audit annotation, never `storage-cold` |

---

## 7. Continuous verification

| Layer | Re-verification frequency |
|---|---|
| OIDC session | re-MFA every 8h; session invalidation on risk-score change |
| Workload SVID | rotation every 1h |
| OPA decision | every request — never cached across requests |
| Bundle integrity | on each PDP poll (every 5s) |
| Container image | every pull verified against Sigstore signature |
| Receipt integrity | sampled background job re-verifies 100% of new receipts within 24h |

---

## 8. Visibility plane

| Source | Sink | Retention |
|---|---|---|
| OPA decision log | SIEM + receipt meta-chain | 7 years (regulatory) |
| Audit log | SIEM + receipt meta-chain | 7 years |
| Network flow logs | SIEM | 1 year |
| OS/container logs | SIEM | 90 days |
| Receipt chain itself | Postgres + S3 + Merkle batches in transparency log | Customer-controlled, default 10 years |

---

## 9. CISA Zero Trust Maturity Model alignment

| Pillar | Project Ledger maturity |
|---|---|
| Identity | **Advanced** (phishing-resistant MFA, federated SSO, JIT) |
| Devices | **Advanced** for managed corp devices; **Initial** for customer-side (customer responsibility) |
| Networks | **Advanced** (microsegmentation, mTLS, SVIDs) |
| Applications & Workloads | **Advanced** (OPA per request, signed bundles, workload identity) |
| Data | **Advanced** (RLS, CMK, receipt-level integrity) |
| Visibility & Analytics | **Advanced** (decision-as-receipt, full audit chain) |
| Automation & Orchestration | **Advanced** (GitOps, SPIRE, automated rotation) |
| Governance | **Advanced** ([SOC2_CONTROLS.md](SOC2_CONTROLS.md), [THREAT_MODEL.md](THREAT_MODEL.md)) |

---

## 10. Customer self-deploy reference architecture

For customers running Project Ledger in their own environment (on-prem or own cloud), this section is the prescriptive Zero Trust deployment guide.

| Component | Recommended |
|---|---|
| OIDC IdP | Customer's existing (Entra ID, Okta) |
| Workload identity | SPIRE on Kubernetes |
| Service mesh | Istio (preferred) or Linkerd |
| Policy engine | OPA on every node; Rego policies as code |
| HSM/KMS | Customer choice; the SDK plugs into AWS KMS, Azure Key Vault, GCP KMS, PKCS#11 |
| Database | Postgres with RLS enabled (mandatory) |
| Secrets | HashiCorp Vault or cloud-native KMS |
| Container images | Customer's registry; verify signatures from `askledger/*` against Sigstore Rekor |
| Telemetry | Customer's SIEM (Splunk, Sentinel, Chronicle) |

This is the design we will socialize with regulator security review teams (CBUAE, SAMA, ECB IT) when supporting Tier-1 BFSI deployments.
