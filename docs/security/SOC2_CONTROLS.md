# SOC 2 Type II Control Framework — Project Ledger

**Version:** 1.0
**Framework:** AICPA Trust Services Criteria (TSC) 2017, as amended
**Trust Service Categories in scope:** Security, Availability, Confidentiality
**Optional categories:** Processing Integrity, Privacy (added on customer request)
**Intended audience:** SOC 2 audit firms (Schellman, Prescient, A-LIGN, Sensiba), regulator security teams, customer InfoSec teams reviewing the platform.

This document is the audit-ready map of every Trust Services Criterion to its implementing controls and evidence sources inside Project Ledger. A SOC 2 Type II audit firm uses this as the starting point of their evidence collection.

---

## 1. Common Criteria (CC) — Security

### CC1 — Control Environment

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC1.1 | Demonstrate commitment to integrity and ethical values | Code of Conduct, Whistleblower policy, Acceptable Use policy | `CODE_OF_CONDUCT.md`, signed acknowledgments in HR system |
| CC1.2 | Board oversight | Board charter, quarterly security review on board agenda | Board minutes |
| CC1.3 | Management structure | Org chart, role descriptions including CISO function | HR system |
| CC1.4 | Demonstrates commitment to attract, develop, retain competent individuals | Hiring rubric, security training program | Talent docs |
| CC1.5 | Holds individuals accountable | Annual performance reviews include security objectives | Performance review records |

### CC2 — Communication and Information

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC2.1 | Obtains/generates relevant quality information | Centralized log aggregation; security metrics dashboard | SIEM exports |
| CC2.2 | Internally communicates information | Quarterly all-hands; security newsletter | Calendar + emails |
| CC2.3 | Externally communicates information | Public security page, transparency reports, status page | https://github.com/askledger/receipts-sdk/security, https://status.github.com/askledger/receipts-sdk |

### CC3 — Risk Assessment

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC3.1 | Specifies objectives | Annual security objectives signed by CEO | Objectives doc |
| CC3.2 | Identifies risks | Quarterly risk assessment; threat model maintained in [THREAT_MODEL.md](THREAT_MODEL.md) | Risk register |
| CC3.3 | Considers fraud potential | SoD enforced via OPA policies; quarterly fraud risk review | OPA policy + review minutes |
| CC3.4 | Identifies and assesses changes | Change management process; risk re-assessed on major release | Jira / Linear |

### CC4 — Monitoring Activities

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC4.1 | Selects, develops, and performs ongoing/separate evaluations | Continuous vulnerability scanning, monthly penetration tests, annual third-party assessment | Scanner reports, pentest reports |
| CC4.2 | Communicates deficiencies | Incident management process via PagerDuty; post-incident reviews public to customers | Incident dashboard |

### CC5 — Control Activities

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC5.1 | Selects/develops control activities | Control matrix in this document; reviewed quarterly | This doc + review log |
| CC5.2 | Selects/develops technology controls | Technical controls listed in CC6 (Logical Access) and CC7 (System Operations) | Code repo, infra-as-code |
| CC5.3 | Deploys through policies/procedures | Written policies in `/docs/security/policies/` | Policy repo |

### CC6 — Logical and Physical Access Controls

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC6.1 | Logical access | OIDC SSO required; MFA enforced; SPIFFE workload identity for services | IdP logs, SPIRE telemetry |
| CC6.2 | Provisioning and de-provisioning | JML (Joiner/Mover/Leaver) workflow integrated with HRIS; access reviews quarterly | HRIS audit log |
| CC6.3 | Authorization | RBAC implemented in `KeyRegistry` + platform OPA policies; least-privilege baseline | Code + policy bundles |
| CC6.4 | Restricts physical access | Cloud-only — no physical infrastructure owned. Cloud vendor (AWS/Azure/GCP) physical controls inherited via shared responsibility | AWS / Azure / GCP SOC 2 reports |
| CC6.5 | Disposes of information | Crypto-erasure for KMS keys; receipt tombstoning preserves evidence integrity | KMS deletion log |
| CC6.6 | Implements logical/physical security measures (network) | mTLS between services; SPIFFE SVIDs; network policies; WAF | Network policy YAML |
| CC6.7 | Restricts movement of information | DLP on engineering laptops; egress controls in production VPC; customer-managed-key option for at-rest data | DLP logs |
| CC6.8 | Prevents/detects unauthorized software | Allow-listed binaries; supply-chain checks via SBOM; Sigstore-verified releases | SBOM, allow-list |

### CC7 — System Operations

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC7.1 | Detects/monitors changes | Configuration drift detection (Terraform plan diffs); GitOps for k8s | Terraform Cloud, Argo CD |
| CC7.2 | Monitors system components | Datadog + Grafana; alerting on SLO breach; on-call rotation | Datadog dashboards |
| CC7.3 | Evaluates security events | SIEM (Wazuh/Datadog Security) with playbooks; security incidents tracked | SIEM events |
| CC7.4 | Responds to security incidents | Documented IR plan with named roles; tabletop exercise quarterly | IR plan, tabletop records |
| CC7.5 | Identifies/develops/implements/tests/maintains BCP/DRP | Runbooks per failure mode; quarterly DR test; RTO 4h, RPO 15m | DR test reports |

### CC8 — Change Management

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC8.1 | Authorizes/designs/develops/implements/tests/approves/deploys changes | PR review with ≥2 approvers including 1 security if security-relevant; CI gates (build, test, lint, SAST, SCA); CD via Argo with rollback | GitHub PR history, CI logs |

### CC9 — Risk Mitigation

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| CC9.1 | Identifies/assesses/mitigates significant business risks | Annual risk assessment; insurance (cyber + E&O); business continuity | Risk register, insurance certs |
| CC9.2 | Vendor and business partner management | Vendor security review process; SOC 2 reports collected from critical vendors (AWS, Azure, GCP, Vercel, GitHub) | Vendor risk register |

---

## 2. Availability (A)

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| A1.1 | Maintains, monitors, evaluates current processing capacity | Capacity planning quarterly; autoscaling configured | Datadog capacity dashboards |
| A1.2 | Authorizes/designs/develops/implements/operates/approves/maintains/monitors environmental protections, software, data backup processes, and recovery infrastructure | Multi-AZ deployment; cross-region S3 replication; Postgres PITR backups every 15 min | Backup reports, restore tests |
| A1.3 | Tests recovery plan | Quarterly DR drill: full restore to a clean region | DR test reports |

**Receipt-specific availability commitment:** the SDK is fully offline-capable. A platform outage does not stop receipt signing; receipts queue locally and reconcile on recovery. RPO for the platform is 15 minutes; receipts produced during the gap are durable in customer-side storage.

---

## 3. Confidentiality (C)

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| C1.1 | Identifies/maintains confidential information | Data classification policy; customer data labelled per `Classification` enum in SDK | Data inventory |
| C1.2 | Disposes of confidential information | Crypto-erasure for keys; secure delete for raw payloads; tombstones for compliance-mandated receipt retention | Key deletion log |

**Receipt-specific:** customer raw input/output text is hashed by default in adapters (`hashOnly: true`). Customers opt-in to store raw via field-level encryption with customer-managed keys.

---

## 4. Processing Integrity (PI) — added on customer request

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| PI1.1 | Obtains/generates accurate/complete/relevant information to support objectives | Receipt chain integrity test on every read; periodic full-chain verification job | Verification job logs |
| PI1.2 | System inputs are complete/accurate | Adapter-side validation; structured errors via `ReceiptsValidationError` | SDK telemetry |
| PI1.3 | Processes are complete/accurate | RFC 8785 + Ed25519 deterministic; identical inputs → identical receipts; cross-language conformance vectors | `test/conformance/` |
| PI1.4 | Outputs are complete/accurate/distributed appropriately | Verification API returns structured result; tampered receipts always detected | Adversarial test corpus |
| PI1.5 | System processes/stores data in such a way that it is recoverable | Hash chain + Merkle commitment + RFC 3161 timestamps + transparency log = 4-layer integrity | Merkle/TSA/log artifacts |

---

## 5. Privacy (P) — added on customer request (GDPR / CCPA scope)

| TSC Ref | Control | Implementation | Evidence source |
|---|---|---|---|
| P1.1 | Notice and communication | Privacy notice; transparency about hashing + retention | https://github.com/askledger/receipts-sdk/privacy |
| P2.1 | Choice and consent | Customer controls classification labels and retention windows | Tenant settings UI |
| P3.1 | Collection | Default minimal: only event metadata + hashes; raw text opt-in only | Default adapter config |
| P4.1 | Use, retention, and disposal | Per-tenant retention; cryptographic tombstone on delete to preserve audit integrity | Retention policy + delete API |
| P5.1 | Access | Data subject access requests via tenant admin console | DSAR endpoint |
| P6.1 | Disclosure to third parties | Sub-processor list public; DPA available | DPA, sub-processor list |
| P7.1 | Quality | Hashes are deterministic and verifiable | SDK + verifier |
| P8.1 | Monitoring and enforcement | Privacy incident process integrated with security IR | IR plan |

---

## 6. Control evidence — automated collection

| Control | Automated source | Frequency |
|---|---|---|
| CC6.1 (Logical access) | IdP audit log → SIEM | Real-time |
| CC6.3 (Authorization) | OPA decision log → SIEM | Real-time |
| CC7.2 (Monitoring) | Datadog metrics | Continuous |
| CC8.1 (Change management) | GitHub Actions audit | Per change |
| CC4.1 (Ongoing eval) | Dependabot, Snyk, Trivy | Daily |
| A1.2 (Backup) | AWS Backup Vault | Hourly |
| A1.3 (Recovery test) | Quarterly chaos engineering drill | Quarterly |
| CC8.1 (Build provenance) | npm provenance + Sigstore Cosign | Per release |

---

## 7. Control narratives

Each control above has a longer prose narrative in `docs/security/policies/CC*.md`. Auditors should request these per-criterion.

---

## 8. Type II evidence period

A SOC 2 Type II requires evidence of operating effectiveness over a continuous period (typically 6 or 12 months). Once an audit is commissioned, the audit period starts on day 0 of evidence collection. This control framework is the design-of-controls input; type II adds operational evidence.

---

## 9. Roadmap

| Milestone | Target |
|---|---|
| Type I report (point-in-time design-of-controls) | 90 days after first paid customer |
| Type II report (12-month evidence period) | 15 months after first paid customer |
| ISO/IEC 27001 certification | 18 months |
| ISO/IEC 42001 (AI management system) certification | 18 months — strategically important given the product domain |
| HIPAA / HITRUST | Customer-driven |
| FedRAMP Moderate | Customer-driven (US public sector) |

---

## 10. Document maintenance

Updated on every release that adds a control-relevant capability (new authentication mode, new storage backend, new data class). The framework is owned by the CISO function; the audit firm is the consumer.
