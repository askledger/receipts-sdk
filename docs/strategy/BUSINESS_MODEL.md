# Business Model

**Status:** Internal · v1.0
**Owner:** Rashed Ali Khan
**Pattern:** Open-source core + Enterprise SaaS (HashiCorp / GitLab / Sentry / Sigstore-Chainguard pattern)

---

## The thesis in one sentence

The protocol and SDKs stay open-source forever. Revenue comes from the hosted operational layer that any organization wants but does not want to operate themselves.

---

## What is open (free forever)

- The Receipts Protocol specification
- The five language SDKs (TypeScript, Python, Go, Rust, Java)
- The 9 bundled regulator templates
- The four AI vendor adapters
- The safety detection layer (PII, prompt injection, shadow AI)
- The browser extension (private mode)
- The reference transparency log code
- The threat model, SOC 2 framework, ZTA architecture docs
- The Bandar Naghi framework adapter shell

This is the substrate. It is licensed Apache-2.0. **It cannot be taken away.** That is the developer trust we need.

## What is paid (enterprise tier)

| Capability | Why customers pay | Where the value lives |
|---|---|---|
| Hosted Transparency Log | Operating an STH-publishing log requires HSMs, monitoring, durability. Customers want the property without the operational burden | Infrastructure |
| Hosted Admin Console | Multi-tenant SaaS with SSO, RBAC, audit log retention, branded subdomain. No DevOps required to use it | SaaS reliability |
| Receipt Score public badge | The embed badge is paid because hosting requires uptime + bandwidth + freshness guarantees | Brand + trust |
| Premium regulator packs | Quarterly-updated mappings to CBUAE / SAMA / EU AI Act / FedRAMP / FDA AI/ML / state AI laws | Domain expertise |
| Compliance evidence packs | One-click regulator-ready bundles (zip + signed metadata + auditor instructions) | Time-to-audit |
| Enterprise integrations | SSO via SAML/OIDC, SCIM provisioning, audit log streaming to Splunk/Datadog/Sentinel | Integration plumbing |
| Premium support + SLAs | 99.99% uptime, 24/7 incident response, dedicated CSM, named architect | Support quality |
| White-label / branded deployments | Custom domain, customer logo, custom certs | Brand control |
| Cryptographic audit certification packages | Pre-arranged Trail of Bits / NCC Group audit pricing pass-through with bundled discount | Speed to audit |
| Insurance underwriting integration | Receipt Score feeds Munich Re / AXA / Lloyd's underwriting pipelines · pricing negotiated per insurer | Strategic |

---

## Pricing model (proposed)

| Tier | Free | Team | Business | Enterprise |
|---|---|---|---|---|
| Monthly price | $0 | $19/user | $49/user | Custom · starts at $50K/year |
| Users | up to 5 | unlimited | unlimited | unlimited |
| Receipts / month | 10,000 | 1 million | unlimited | unlimited |
| Regulator templates | 5 (BFSI + ISO + GDPR) | All 9 bundled | All + 1 premium pack | All + custom mappings |
| Identity & auth | local only | Google/Microsoft OIDC | + SAML | + SCIM + IdP-of-choice |
| RBAC | basic | basic | advanced + roles | custom + segregation-of-duty |
| Audit log retention | 30 days | 1 year | 7 years | Configurable, default 10y |
| Transparency log | shared public | shared public | shared public | Dedicated single-tenant log |
| HSM integration | local file | local file | AWS KMS / Azure KV / GCP KMS | + PKCS#11 + on-prem HSMs |
| Support | Community Discussions | Email · 24h response | Priority · 4h response | Dedicated CSM + 24/7 |
| Evidence pack export | Manual / SDK | 10/month | unlimited | unlimited + scheduled |
| Receipt Score badge | private | public on personal profile | Public org badge | Embeddable on customer-facing pages |
| White-label / branded | ❌ | ❌ | ❌ | ✅ |
| SOC 2 report | n/a | n/a | included | included |
| Cryptographic audit pass-through | n/a | n/a | available at cost | bundled |
| Uptime SLA | best effort | 99.9% | 99.95% | 99.99% |

**Logic:** Free tier gives any individual or 5-person team the full substrate. Team tier is the standard mid-market plan. Business adds compliance certifications and premium regulator packs. Enterprise adds dedicated infrastructure, custom integrations, and white-glove.

---

## Annual contract value (ACV) estimates

| Customer type | Tier | Typical ACV | Notes |
|---|---|---|---|
| Solo developer | Free | $0 | The pipeline · they recommend us internally |
| 10-person startup | Team | $2,000/year | Light usage, sometimes upgrade to Business |
| 50-person SaaS | Business | $25,000/year | Standard mid-market deal |
| 200-person regulated tenant | Business + 1 regulator pack | $60,000/year | The bulk of our paid base |
| 1,000-person enterprise | Enterprise base | $150,000-250,000/year | Includes SSO, SCIM, dedicated log |
| Tier-1 BFSI / Fortune 500 | Enterprise + multi-regulator | $300,000-750,000/year | Multi-region, dedicated CSM, audit pass-through |
| Cloud provider partner | Custom strategic | $1M-5M/year + revenue share | Bundled into their AI service offering |
| Insurance partner | Strategic | $500K-2M/year + per-policy fee | Receipt Score feeds underwriting |

---

## Revenue streams (multi-channel)

1. **Per-seat SaaS subscriptions** — the bread and butter
2. **Premium regulator packs** — annual subscriptions ($5K-50K/year per pack)
3. **Compliance evidence pack generation** — usage-based ($99-$999 per pack)
4. **Hosted transparency log services** — tiered by traffic
5. **Dedicated single-tenant logs** — enterprise contract
6. **Receipt Score embeddable badges** — public-facing trust signals ($299-$2999/month)
7. **Audit pass-through bundling** — speed-to-audit packages
8. **Insurance underwriting partnerships** — share of premium discounts
9. **Cloud provider revenue share** — when bundled into AWS / Azure / GCP AI services
10. **Training and certification** — Receipts Engineer cert ($2,000) · Compliance Architect cert ($5,000)
11. **Partner consulting referrals** — SI partners pay for certified status

---

## ARR trajectory (realistic, not aspirational)

| Year | ARR target | Customer count | What unlocks it |
|---|---|---|---|
| Y0 (now) | $0 | 0 | Substrate built; nothing paid |
| Y1 | $250K-750K | 5-15 paid | First 3 BFSI MENA design partners + 10-20 mid-market pilots |
| Y2 | $2M-4M | 30-60 paid | LF AI hosted-project status + first regulator citation |
| Y3 | $8M-20M | 100-200 paid | First cloud provider integration + first insurance partnership |
| Y4 | $25M-60M | 300-500 paid | Standard recognized in 3 jurisdictions |
| Y5 | $60M-150M | 700-1500 paid | Acquisition-relevant scale ($500M-2B exit territory) |

**Comparables:** Chainguard hit $40M ARR in 24 months from launch. Snyk hit $50M ARR in 36 months. These are post-OSS-core SaaS plays in security, which is the closest analog to our profile.

---

## Customer acquisition strategy

| Channel | Cost | Why it works |
|---|---|---|
| Open-source distribution | Free | GitHub stars · npm installs · Hacker News · community word-of-mouth |
| Regulator briefings | Time | One citation = market mandate |
| Insurer partnerships | Time | One Munich Re relationship = adoption-by-necessity |
| Cloud provider partnerships | Revenue share | AWS / Azure / GCP marketplace presence drives mass adoption |
| Conference talks | Travel | KubeCon, RSA, Money 20/20, GITEX, Saudi Fintech Festival |
| Compliance + audit firm referrals | Partnership | Big 4 + boutique compliance firms refer us to clients |
| Bandar Naghi co-authorship | Existing relationship | Distributes the framework + the substrate together |
| BFSI MENA cold outreach | Sales time | Forced by CBUAE Sep 16 2026 deadline |

---

## Unit economics (model assumptions)

| Metric | Target |
|---|---|
| CAC (Customer Acquisition Cost) | $5,000 for Team · $25,000 for Business · $100,000 for Enterprise |
| LTV (Lifetime Value, 5-year) | $50,000 Team · $200,000 Business · $750,000 Enterprise |
| LTV/CAC ratio | 10x Team · 8x Business · 7.5x Enterprise · all well above the 3x healthy minimum |
| Gross margin | 80% (typical SaaS infrastructure) |
| Net revenue retention | 120-130% target (driven by usage growth + tier upgrades) |
| Time to first paid customer | 6 months from product launch |
| Sales cycle (Enterprise) | 6-9 months |

---

## Defense against open-source-only or freemium-only competitors

**Question:** "If everything is open source, why would anyone pay?"

**Answer:** They pay for what they cannot easily build themselves:

1. **Operating the transparency log at scale** with FIPS-validated HSMs, multi-region durability, STH publication SLAs — they want the property, not the operational burden
2. **Maintaining 9+ regulator mappings as regulations change** — every jurisdiction has quarterly updates · we curate them as a service
3. **Compliance certifications** — SOC 2 Type II, ISO 27001, FedRAMP authorization · these take 12-18 months and $200K-500K to obtain
4. **Cryptographic audit access** — pre-arranged Trail of Bits / NCC Group / Cure53 audit slots at reduced pricing
5. **Insurance underwriting integration** — Munich Re / AXA pricing pipelines · individual customers cannot replicate
6. **SSO / SCIM / SAML / OIDC integrations** at the enterprise tier · 6-8 weeks of engineering effort to build each
7. **24/7 support with named architect** · not replicable by a 2-person company
8. **Per-jurisdiction regulator briefing relationships** · we maintain these on behalf of the customer

This is the same pattern as HashiCorp, GitLab, Sentry, Chainguard. **Open source is the wedge. Operations is the moat.**

---

## What the user pays for emotionally (not just functionally)

Functional pricing tables are not enough. Customers pay because:

| Functional reason | Emotional reason |
|---|---|
| Compliance | Sleep at night knowing the regulator inquiry will not embarrass us |
| Receipt Score badge | Public trust signal · we look serious |
| Premium support | Someone responsible to call when it breaks |
| Audit bundling | Pass the audit without 200 hours of scrambling |
| Dedicated log | Sovereignty over our own evidence |
| Cloud partner integration | Procurement-easy · already in our budget line |

These are the levers that drive willingness-to-pay above flat per-seat economics.

---

## Open questions for the next 90 days

1. Do we start Team tier at $19/user/mo or $29/user/mo? Sentry uses $26.
2. Do we offer a "regulated nonprofit / academic" discount tier? Probably yes for goodwill.
3. Do we offer a perpetual free tier for individual developers? Probably yes — drives the upgrade path.
4. Do we charge for the transparency log inclusion separately or bundle it? Probably bundle below Enterprise, dedicated at Enterprise.
5. When we add 5 more regulator packs (FDA AI/ML, FCC, FERPA, PCI, NYDFS), do they bundle into Business or become per-pack add-ons? Per-pack at $5K-15K/year each is more typical.
6. Do we sell evidence packs as one-off purchases for non-customers (auditors who want to verify a third-party bank)? Probably yes — micro-revenue stream and lead generator.

---

## The honest truth about money

This model works **if and only if** we execute on:
- Push to public GitHub
- Land 3 paid design partners in 12 months
- Get into LF AI hosted-project status
- Land first cloud partner (AWS / Azure / GCP)
- Hire 5-10 people to execute distribution

Without those, the model is a slide deck. With those, the model is HashiCorp's first 24 months.

The substrate is real. The product is real. The path to revenue is real. **What is not yet real is the team, the funding, and the customer count.** Those are the next 12 months of work.
