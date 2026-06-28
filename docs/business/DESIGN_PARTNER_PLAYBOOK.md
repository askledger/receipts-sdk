# Design Partner Playbook

Five named, signed design partners by end of 2026-Q4. Each one gets
hands-on engineering attention in exchange for permission to publish a
case study and a letter of reference.

## Target profile

- **Tier-1 BFSI** in a regulated market (UAE, Saudi, Germany, Singapore).
- **AI-forward** (LLM use in customer-facing or compliance-adjacent workflows).
- **Already auditable** elsewhere (so the value of receipt evidence is obvious).
- **Buyer + champion accessible** (no 9-month procurement cycle on first contract).

## What the partner gets

- 12 months at $0 list price (we cover infra).
- Direct Slack/Discord channel to engineering.
- Quarterly feature steering input.
- White-glove deployment + onboarding.
- Co-branded case study published with their approval.
- Letter of reference for our next-round sales motion.

## What we get

- Real production traffic and edge cases.
- A logo and a quote.
- Reference call willingness for two named prospects per quarter.
- Veto-free permission to publish architecture pattern with their data anonymized.

## Onboarding cadence

| Week | Activity | Owner |
|---|---|---|
| -2 | Mutual NDA + design-partner agreement | Legal |
| -1 | Tenant provisioning, SSO config, branding | Customer Ops |
| 0 | Kick-off; success criteria signed | CEO + champion |
| 1 | First receipts signed in their environment | Eng |
| 2 | Console + dashboards customised for their roles | Eng |
| 4 | Plug into their SIEM + ticketing | Eng + their SRE |
| 8 | First compliance evidence pack exported | Customer Ops + their compliance |
| 12 | Mid-engagement review; expand to second team | CEO |
| 26 | Renewal conversation begins | Sales |

## Success criteria — must be measurable

For every partner, jointly write five criteria with numeric targets. Examples:

- ≥ 95% of AI calls in <named workflows> produce signed receipts.
- ≤ 1 false-positive policy block per 10,000 receipts in steady state.
- Console p95 page load < 1.5s on partner hardware.
- ≥ 1 compliance evidence pack generated per quarter, accepted by their internal audit.
- ≥ 1 named regulator inquiry answered with our evidence pack within target SLA.

## Outreach pipeline (priority order)

1. Banks where we have a personal connection (UAE retail bank, Saudi corporate bank).
2. Insurance carriers (claims-decisions are GDPR Art. 22 magnets).
3. Healthcare payers in EU (HIPAA + EU AI Act overlap).
4. Public-sector procurement teams (FedRAMP + OMB M-24-10 in US).
5. Cloud-provider partnership team (Bedrock / Vertex / Azure OpenAI) — they want differentiation.

## First-month deliverables to the partner

1. Their tenant on staging with their identity binding live.
2. Their first ten receipts signed against their cloud LLM call.
3. Their policy bundle authored against three regulators relevant to them.
4. Their first evidence pack PDF in their compliance officer's inbox.
5. Joint architecture diagram on a slide they can show their board.

## Risk handling

- If partner stalls, we name a 30-day countdown to "preview customer" status.
- If partner asks for a feature outside the roadmap, we either ship it within
  one sprint or document the cost and move on. We don't promise vague timelines.
- If partner wants exclusivity, they pay for it. No free exclusivity.
