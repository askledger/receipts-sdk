# SOC 2 Type II · Evidence map and preparation runbook

**Trust services criteria in scope:** Security, Availability, Confidentiality.
(Processing Integrity and Privacy can be added in year two.)
**Observation window:** 6 months minimum (12 months strongly preferred).
**Target completion:** Type II report in hand by 2027-Q3.
**Estimated cost:** USD 15-50k auditor + USD 30-60k continuous-monitoring tooling (Vanta, Drata, Secureframe).

---

## 1 · Pre-work (months 0-2)

| Task | Owner | Output |
|---|---|---|
| Select auditor (Big 4 vs CPA boutique) | CTO + CFO | Engagement letter |
| Select GRC tooling | Security lead | Vanta/Drata/Secureframe contract |
| Define system description (the "in-scope system") | CTO | Section 3 of forthcoming report |
| Inventory all third-party subprocessors | Security lead | Subprocessor list, DPAs in place |
| Background checks on all employees with prod access | HR | Signed attestations on file |

## 2 · Evidence sources we already have

| Criterion | Evidence we ship | Location |
|---|---|---|
| CC1 — Control environment | Code of Conduct, MAINTAINERS, CODEOWNERS | repo root |
| CC2 — Communication & info | SECURITY.md, runbook, status-page templates | `docs/operations/comms-templates/` |
| CC3 — Risk assessment | Threat model + adversarial review | `docs/security/THREAT_MODEL.md`, `docs/security/adversarial/` |
| CC4 — Monitoring | `monitoring/alerts.yml`, hardening verifier output | `monitoring/`, CI |
| CC5 — Control activities | Hardening checklist 66/66 PASS | `docs/security/HARDENING_CHECKLIST.md` |
| CC6 — Logical access | RBAC, tenant-context, SCIM, CODEOWNERS 2-reviewer rule | `console/src/lib/`, `.github/CODEOWNERS` |
| CC7 — System operations | Runbook, failover drill, incident response | `docs/operations/` |
| CC8 — Change management | CONTRIBUTING change-scope blocks, CI gates, release workflow | `CONTRIBUTING.md`, `.github/workflows/` |
| CC9 — Risk mitigation | Insurance partnership playbook | `docs/INSURANCE_PLAYBOOK.md` |
| A1 — Availability | SLOs, PrometheusRule, multi-region failover drill | `monitoring/`, runbook §6 |
| C1 — Confidentiality | Tenant isolation, RLS, encryption at rest + transit | migrations §RLS, hardening §C |

## 3 · Gaps to close before audit window opens

These are the items that must be in place when the auditor's observation
window starts; the report cannot attest to controls that were not running.

1. **GRC tool deployed.** Vanta/Drata/Secureframe integrated with AWS, GCP, GitHub, Okta, Linear. Continuous evidence collection live.
2. **Annual security training** delivered to every employee. Completion tracked.
3. **Background checks** on file for everyone with prod access.
4. **Vendor risk reviews** completed for every subprocessor (annual cadence).
5. **Quarterly access reviews** running, evidence in GRC.
6. **Quarterly disaster-recovery drill** running. The 2026-Q2 failover drill is one; we need three more before audit completes.
7. **Annual penetration test report** filed (see PEN_TEST_SOW.md).
8. **Vulnerability management SLA** documented + adhered to (Critical 30d, High 60d, Medium 90d).
9. **Incident response runbook** tested with a tabletop exercise (every quarter).

## 4 · Continuous-evidence checklist

For each control, the GRC tool must collect daily:

- [ ] All commits to `main` reviewed by at least one non-author (CODEOWNERS).
- [ ] CI pipeline ran and all gates passed before merge.
- [ ] Hardening verifier output (PASS).
- [ ] Vulnerability scans ran (Trivy, CodeQL, npm-audit).
- [ ] No production access by anyone not in the prod-access group.
- [ ] No prod credentials older than 90 days.
- [ ] Backup verification (restore-from-cold weekly canary).
- [ ] Alert routing functional (synthetic page every Monday).

## 5 · Sample interview questions the auditor will ask

Prepare a 3-paragraph answer to each with the supporting artifact ready.

1. How is access to production granted, reviewed, and revoked?
2. What is your process for assessing risk of a new third-party service?
3. Walk me through how a code change goes from PR to production.
4. How do you know that tenant data is isolated from other tenants?
5. What happens when a critical CVE is reported in a dependency?
6. How is sensitive data encrypted at rest, and who holds the keys?
7. Describe your incident response process from detection to postmortem.
8. How do you handle customer data on subprocessor termination?

## 6 · Year-two expansion

After the first Type II report, add:
- Processing Integrity (relevant if customers use us for record-keeping that affects financial reporting).
- Privacy (relevant once we process EU/UK/CA/CH PII at scale).
- ISO 27001 — most controls overlap with SOC 2; certify in parallel.

## 7 · Honest milestone schedule

| Month | Milestone |
|---|---|
| M0 | Engage auditor + GRC tool |
| M1 | Gap analysis complete, all gaps assigned owners + due dates |
| M2 | All controls live, GRC tool collecting evidence |
| M3 | First quarterly access review run; first DR drill of the audit window |
| M3-M9 | Continuous evidence; quarterly cadences continue |
| M9 | Auditor begins testing |
| M11 | Draft report; remediation of any findings |
| M12 | Type II report issued, signed, ready for customer distribution |

The honest read: a credible SOC 2 Type II report is 12 months away from
the day the GRC tool is deployed. There is no shortcut.
