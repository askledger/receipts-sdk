# Roadmap to 100% end-to-end enterprise grade

Single source of truth. Every gap from `HONEST_AUDIT.md` has a milestone
here with an owner, a deliverable, and a date.

## Convention

- **Owner** = one named person. No shared ownership.
- **Done** = the artifact exists in production and is observed working
  for at least 7 consecutive days, OR the external party has issued the
  attestation in writing.
- A milestone with no owner is not a milestone — it's a wish.

---

## Milestone 1 · Backend data plane (gap C → A)

| Item | Owner | Done when |
|---|---|---|
| Postgres deployed in staging (single-AZ) | SRE | psql connects from console pod |
| Migrations `0001_init.sql` applied + RLS policies active | SRE | RLS test passes from non-admin role |
| `console/src/lib/db.ts` + `repos.ts` wired to all 8 dashboard routes | Backend eng | `PL_USE_FIXTURES=false` and pages render real data |
| Integration test: cross-tenant query rejected by RLS, not by app code | Backend eng | Test in CI |
| Receipts table seeded from a real `signReceipt` call | Backend eng | A receipt round-trips browser → ingest → Postgres → dashboard |

**Target:** 2026-07-15. **Budget:** 3 engineer-weeks.

---

## Milestone 2 · SCIM + billing persistence (gap C → A)

| Item | Owner | Done when |
|---|---|---|
| SCIM `POST /v2/Users` writes `pl.users` row through `repos.scimUsers.create` | Backend eng | Okta SCIM test passes against staging |
| SCIM `PATCH /v2/Users/:id` (deactivation) implemented | Backend eng | Okta deprovisioning round-trip works |
| Billing webhook handler updates `pl.entitlements` via `repos.entitlements.upsert` | Backend eng | Stripe test event flips plan from `free` to `team` and dashboard reflects it |
| Audit outbox drains to a signed-receipt writer | Backend eng | Provisioning a user creates an audit receipt in the chain |

**Target:** 2026-07-30. **Budget:** 2 engineer-weeks.

---

## Milestone 3 · Transparency log running (gap D → A)

| Item | Owner | Done when |
|---|---|---|
| Trillian log + MySQL deployed via `docker-compose.prod.yml` or Helm | SRE | gRPC health endpoint green |
| `trillianClient` (in `src/transparency-log/trillian-client.ts`) configured against deployed log | Crypto | First leaf added |
| STH publisher cron emits signed tree heads every 5 min | SRE | `pl_tlog_last_sth_timestamp_seconds` updates |
| Public STH-archive bucket with S3 Object Lock retention 10y | SRE | Cosign-signed STH lands in bucket |
| Public-facing verifier page consumes inclusion proofs | Frontend | Anyone can paste a receipt + see its proof |

**Target:** 2026-08-30. **Budget:** 2 engineer-weeks + ~$500/mo infra.

---

## Milestone 4 · HSM nightly integration (gap C+ → A)

| Item | Owner | Done when |
|---|---|---|
| AWS KMS test key provisioned, role + OIDC trust set | SRE | `hsm-nightly.yml::aws-kms` job green |
| Azure Key Vault test key + workload-identity binding | SRE | `hsm-nightly.yml::azure-kv` green |
| GCP KMS test key + WIF provider | SRE | `hsm-nightly.yml::gcp-kms` green |
| SoftHSM PKCS#11 job runs in default CI matrix (no secrets needed) | SRE | `hsm-nightly.yml::softhsm` green |

**Target:** 2026-08-15. **Budget:** 1 engineer-week + ~$50/mo cloud KMS.

---

## Milestone 5 · Console deployed (gap F → A)

| Item | Owner | Done when |
|---|---|---|
| `staging.github.com/askledger/receipts-sdk` live with TLS cert | SRE | `curl https://staging.github.com/askledger/receipts-sdk/api/health` returns 200 |
| Helm chart installed (`deploy/helm/`) with PDB + HPA + NetworkPolicy | SRE | `kubectl get deploy` shows 3 replicas, all ready |
| ServiceMonitor scraping `/api/metrics` | SRE | Prometheus shows `pl_console_uptime_seconds` |
| PrometheusRule firing into PagerDuty for a synthetic incident | SRE | A controlled 5xx triggers the on-call rotation |

**Target:** 2026-08-15. **Budget:** 2 SRE-weeks + ~$1-3k/mo cloud spend.

---

## Milestone 6 · First signed release (gap F → A)

| Item | Owner | Done when |
|---|---|---|
| `v0.6.0` tagged on `main` | Release captain | `release.yml` workflow runs end-to-end |
| Cosign-signed image published to `ghcr.io/askledger/console:0.6.0` | Release captain | `cosign verify` passes |
| SBOM attested via `cosign attest` | Release captain | Attestation visible in Rekor |
| SLSA L3 provenance attached | Release captain | Verifiable with `slsa-verifier` |
| npm package `@askledger/receipts-sdk@0.6.0` published with `--provenance` | Release captain | `npm install` works for external users |
| GitHub release notes generated from CHANGELOG | Release captain | Release page live |

**Target:** 2026-07-31. **Budget:** 1 engineer-day.

---

## Milestone 7 · Prometheus / Grafana scraping prod (gap F → A)

| Item | Owner | Done when |
|---|---|---|
| OTel Collector deployed in `monitoring` namespace | SRE | Collector pods healthy |
| Prometheus operator installed via kube-prometheus-stack | SRE | Prometheus shows our ServiceMonitor target |
| Grafana provisioned with `monitoring/grafana-dashboard.json` | SRE | Dashboard loads with live data |
| Alertmanager → PagerDuty integration | SRE | Test page reaches on-call phone |
| Status page (Atlassian Statuspage or similar) connected to synthetic probes | SRE | `status.github.com/askledger/receipts-sdk` shows component health |

**Target:** 2026-09-15. **Budget:** 2 SRE-weeks + ~$1k/mo or Grafana Cloud free tier.

---

## Milestone 8 · Browser extension in Chrome Web Store (gap F → A)

| Item | Owner | Done when |
|---|---|---|
| Developer account registered + 2FA + backup publisher | CTO | Developer dashboard shows two publishers |
| Signing key provisioned in HSM, KID recorded | Crypto + SRE | First signed build produced by CI |
| Privacy policy, single-purpose statement, permissions justification published | Legal + CTO | Pages live at `github.com/askledger/receipts-sdk/privacy` |
| Listing assets (icon, screenshots, promo tile) checked in | Design | `browser-extension/store-listing/` populated |
| Managed-policy schema published | Backend eng | JSON Schema served from extension URL |
| Submitted for review | CTO | Submission ID + review status visible |
| Listing approved + extension installable | CTO | A non-Project-Ledger Chrome profile installs it |

**Target:** 2026-09-30. **Budget:** 1 engineer-week + $5 fee.

---

## Milestone 9 · Third-party pen-test (gap F → A)

See `PEN_TEST_SOW.md`.

| Item | Owner | Done when |
|---|---|---|
| Vendor selection complete | CTO + CFO | Engagement letter signed |
| Kickoff held | Security lead | Rules of engagement signed |
| Testing complete | External firm | Final report delivered |
| Remediation of any High/Critical | Backend eng + Crypto | Re-test report shows clean |
| Customer-shareable attestation letter received | External firm | PDF on file |

**Target:** Engage by 2026-09-30; report in hand by 2026-12-15. **Budget:** $40-80k.

---

## Milestone 10 · SOC 2 Type II (gap F → A)

See `SOC2_TYPE_II_PREP.md`.

| Item | Owner | Done when |
|---|---|---|
| Auditor + GRC tool selected | CTO + CFO | Contracts signed |
| Gap analysis complete with owners on every gap | Security lead | All gaps in tracker, none unassigned |
| All controls live | Owners | GRC tool shows green for 30 consecutive days |
| Audit window opens | Auditor | Observation window start date communicated |
| Audit window closes (≥ 6 months) | Auditor | Closing date confirmed |
| Type II report issued | Auditor | PDF on file, customer-shareable |

**Target:** Engage 2026-10-31; report 2027-Q3 (12 months later). **Budget:** $45-110k.

---

## Milestone 11 · First production customer (gap F → A)

See `DESIGN_PARTNER_PLAYBOOK.md`.

| Item | Owner | Done when |
|---|---|---|
| 3 design-partner agreements signed | CEO | DocuSign envelopes complete |
| First partner deployed in their cloud | Customer Ops | They sign their first 1,000 receipts in 7 days |
| Joint case study published | Marketing | Public URL with their logo + quote |
| Letter of reference received | CEO | PDF on file, shareable |

**Target:** First signed partner by 2026-10-31; first deployed by 2026-12-15. **Budget:** Mostly engineering attention, no cash.

---

## Cross-cutting cadences

- **Quarterly disaster-recovery drill** — already running (2026-Q2 logged). Owner: SRE on-call rotation.
- **Quarterly adversarial review** — already running (2026-Q2 logged). Owner: Security lead.
- **Quarterly access review** — needs to start 2026-Q3. Owner: Security lead.
- **Quarterly tabletop incident exercise** — needs to start 2026-Q3. Owner: SRE on-call rotation.

## Money

| Bucket | One-time | Recurring |
|---|---|---|
| Pen-test | $40-80k | — |
| SOC 2 audit | $15-50k | — |
| GRC tool | $30-60k/yr | $30-60k/yr |
| Cloud infra | — | $3-5k/mo |
| HSM test usage | — | $50/mo |
| Chrome Web Store dev | $5 | — |
| **Total Y1** | **$85-190k** | **~$45-65k/yr** |

## Headcount

To execute Milestones 1-11 on the timelines above, the team needs:

- 1 backend engineer (Postgres + repos + persistence).
- 1 SRE (deploy + monitoring + drills).
- 1 crypto lead (Trillian + HSM nightly + extension signing).
- 1 frontend engineer at half-time (console pages + Web Store assets + verifier).
- 1 security lead (pen-test, SOC 2, access reviews, tabletops).
- 0.5 CEO / CTO time on partner outreach + auditor selection.

Total ≈ 4.5 FTE for two quarters. Doable for a Series-Seed team with focus.

## Definition of "100% end-to-end enterprise grade"

We are 100% on the day every one of these is true:

1. A paying customer deploys our extension via managed policy.
2. Their receipts are signed against their HSM (via PKCS#11), chained, written to Postgres with RLS active, and added to a public transparency log.
3. Their CISO has our pen-test report and our SOC 2 Type II report.
4. Their SRE team sees our metrics in their Grafana via our exported dashboards.
5. We have not paged the on-call by accident.

We are not at 100% today. The path above gets us there, named and scoped, in two-and-a-half quarters.
