# Insurance + Regulator Engagement Playbook

**Status:** Internal — ready for execution
**Owner:** Rashed Ali Khan

---

## The strategic insight

Apiiro, Credo AI, WitnessAI, Lakera all play the same sales motion: hunt the CISO, win the budget, defend the renewal. That motion plateaus around $100M ARR because the CISO can only buy so much.

The motion that wins the **global standard** position is different:

> **Make the insurer require us. Make the regulator cite us. Customer adoption becomes structural rather than evangelical.**

This is what Sigstore did with build attestation. It's what FIDO did with authentication. It's the position we're playing for.

---

## Track 1 · Insurance partnerships

### Why insurers matter

AI deployment requires liability cover (model errors, biased decisions, PII leaks, prompt injection that triggers harm). Insurers cannot underwrite without **cryptographically verifiable claims data**. Today they price the risk above market because they assume self-attestation. If we become the substrate they trust, every buyer needs us to be insurable at reasonable cost.

### Named targets (priority order)

| Insurer | Why | Contact path | Ask |
|---|---|---|---|
| **Munich Re · aiSure** | Already underwriting AI; published interest in evidence-based pricing | Patrick Wagner (Head of AI Underwriting) via LinkedIn intro through Mphasis network (Bandar) | Pilot — 1 BFSI customer, 90-day evidence collection, joint case study |
| **AXA · AI Liability** | Active in EU AI Act compliance market | AXA Climate (CEO Sébastien Caps) via FR/EU climate AI track | EU AI Act tie-in; co-author the underwriting guideline |
| **Lloyd's of London** | Specialty risk; growing AI line | Lloyd's Lab AI track | London Market AI Working Group membership |
| **Zurich · Cyber + AI bundle** | DACH market dominance | Christine Bosse (Group Chief Underwriting Officer) | DACH bundled AI/cyber pilot |
| **Allianz Trade** | Saudi + UAE BFSI focus | Through Saudi BFSI customer if we land one | MENA AI risk pilot |
| **Marsh McLennan / Aon** | Brokers — they tell underwriters what to price | Cyber broker leads at both | Broker advisory board |

### What we offer insurers

1. **Cryptographically verified incident data** — they can underwrite based on real evidence, not surveys
2. **Counterfactual analysis** — receipts let them say "this incident would have been blocked if AskLedger safety layer was active"
3. **Per-deployment Receipt Score** — like a credit score for AI risk, drives premium pricing
4. **Joint underwriting guideline** — co-published, becomes the industry baseline

### The pitch in one paragraph

> "Today you price AI liability blind. AskLedger receipts make every AI incident reproducible from the cryptographic record. Pilot with one customer: they install our SDK, you get 90 days of receipt data, you build a baseline model, you discount their premium based on their Receipt Score. We publish the case study with you, named, in 2027. Then every other insured in your book wants the same discount."

### Sequence (per insurer)

| Week | Action |
|---|---|
| 0 | Warm intro via shared network |
| 2 | 30-min discovery call · explain the receipt format |
| 4 | Technical walkthrough · their actuarial + claims team |
| 8 | Letter of Intent for 1-customer pilot |
| 12 | Pilot live · weekly status |
| 24 | Joint case study published |
| 36 | Standard offering with Receipt Score discount |

---

## Track 2 · Regulator engagement

### Why regulators matter

A regulator citing our spec **once** flips the market. Banks regulated by that authority must implement us. The sales motion becomes "we don't choose AskLedger; the regulator chose AskLedger and we comply."

### Named targets (priority order)

| Regulator | Why · timing | Contact path | Ask |
|---|---|---|---|
| **CBUAE · UAE Central Bank** | Sep 16 2026 deadline — they need an evidence format NOW | Through UAE banks (Emirates NBD, FAB, ADIB, Mashreq) or via Bandar's network | Named reference to the Receipts Protocol in their next supervisory letter |
| **SAMA · Saudi Central Bank** | 2026 Year of AI; $9.1B AI investment in KSA | Through Saudi banks (Al Rajhi, SNB) or Bandar's Zahid Group connection | Brief at SAMA's Fintech Saudi conference |
| **EU AI Office** | Drafting Art. 50 transparency implementing acts NOW | Through European Banking Authority public consultation; through MEPs on AI Act committee | Comment letter on draft implementing acts pointing at our spec |
| **MAS · Singapore** | Veritas Toolkit on Responsible AI; respected globally | Through Singapore fintech connections | Sandbox slot in MAS Fintech Festival |
| **FCA · UK** | AI sandbox active; thoughtful supervisor | Through TechUK / UK Finance | AI Discussion Paper response |
| **HKMA · Hong Kong** | Greater Bay AI; need MENA-compliant evidence | Through HK banks | Working paper co-authorship |
| **Federal Reserve · SR 26-2 working group** | AI extension to SR 11-7 | Through US banking clients | Comment letter on the upcoming SR 26-2 implementation guidance |
| **RBI · India** | FREE-AI framework drafting | Through Mphasis (Bandar's employer) | Briefing to FREE-AI working group |
| **Bank of Japan / FSA** | METI-led AI guidance | Through Japan Fintech | Embassy briefing |

### What we offer regulators

1. **A vendor-neutral, open-source verifier** they can deploy without buying anything from us
2. **A regulator portal** — github.com/askledger/receipts-sdk/verify — they can paste any bank's evidence pack and verify offline
3. **Free training** for their inspection teams
4. **Co-authored guidance** if they want it
5. **Saudi / UAE / EU / UK / US locale-aware reference implementations** with the local-regulator template pre-loaded

### The pitch to a regulator in one paragraph

> "Your inspection teams will be asked to verify AI compliance starting in 2026. They need a format that is vendor-neutral, mathematically verifiable, and that a regulated firm cannot game. AskLedger is open standard, open source, and verifiable in your browser with no AskLedger account. We are not asking you to endorse a company — we are offering you to anchor on a published cryptographic format you can name in your guidance. We have already mapped CBUAE's five principles into the template. Will you let us walk your inspection team through the verifier?"

### Sequence (per regulator)

| Week | Action |
|---|---|
| 0 | Warm intro · brief outside formal channels first |
| 2 | 30-min walkthrough of the verifier with their tech-policy lead |
| 4 | Formal demo to inspection team |
| 8 | Joint training session |
| 12 | Citation in next supervisory letter or guidance |
| 24 | Reference deployment with one of their regulated entities |

---

## Track 3 · Standards bodies (cross-cutting)

| Body | Owner contact | Ask |
|---|---|---|
| **Linux Foundation AI &amp; Data** | Ibrahim Haddad · Executive Director | Hosted project — see `LF_AI_SUBMISSION.md` |
| **IETF** | Roman Danyliw (security AD) | Informational draft of the wire format |
| **OpenSSF** | Brian Behlendorf · GM | Sigstore working-group seat |
| **CNCF Security TAG** | Justin Cormack | Endorsement of the threat model |
| **ISO/IEC JTC 1/SC 42** | Wael Diab · Chair | Liaison contribution to AI MS standards update |
| **NIST AI Safety Institute** | Elizabeth Kelly | Public comment on AI evaluation methodology |
| **OWASP AIBOM working group** | Helen Oakley · Co-Lead | AIBOM runtime contribution |

---

## Track 4 · Lighthouse customers

| Logo | Why | Path | Status |
|---|---|---|---|
| **Emirates NBD** | UAE Tier-1; CBUAE timing | Direct outreach + Bandar's Mphasis network | Target Q3 2026 |
| **First Abu Dhabi Bank (FAB)** | Largest UAE bank | Same | Target Q3 2026 |
| **Al Rajhi Bank** | Largest KSA bank; PIF-aligned | Through Saudi BFSI network | Target Q4 2026 |
| **SNB** | KSA · Vision 2030 aligned | Same | Target Q4 2026 |
| **HSBC** | Global · EU AI Act + MENA presence | UK Finance connection | Target Q1 2027 |
| **Standard Chartered** | EU AI Act + GCC presence | UK + Singapore | Target Q1 2027 |
| **Goldman Sachs · AI Risk** | US/EU dual; aggressive AI buyer | Through Sigstore-adjacent engineering | Target Q2 2027 |

### Pilot terms (template)

- **90 days** at zero cost
- **1 AI use case** in production (suggest: regulatory reporting, KYC, AML triage)
- **Co-published case study** with anonymization options
- **Receipt Score** publicly displayed in their AI disclosures
- **Joint regulator briefing** within 90 days of pilot end

The trade is asymmetric in their favor — they get a verifiable AI evidence trail for free; we get the logo. **One signed bank is worth six months of paid sales work.**

---

## Track 5 · Co-marketing with the open ecosystem

| Partner | What we co-publish |
|---|---|
| Sigstore (Linux Foundation) | Joint blog: "From build-time to runtime — completing the AI attestation picture" |
| Hugging Face | Hugging Face Hub integration · receipts for every Inference API call |
| Cloud Native Computing Foundation | KubeCon talk: cryptographic AI receipts in production |
| OpenSSF | Joint AI supply-chain proposal |
| Linux Foundation AI &amp; Data | Annual conference keynote |

---

## Budget signals (if we raise)

To execute this playbook professionally:

| Hire | Cost (annual) | Why |
|---|---|---|
| VP Industry Engagement (regulator + standards) | $300K | One full-time human pushing on regulators / LF / IETF in parallel |
| Insurance partnership lead | $250K | Dedicated to Munich Re / AXA / Lloyd's path |
| BFSI Solutions Architect (MENA) | $200K | Lives in Dubai, walks into banks |
| Open-source community manager | $180K | LF AI / OpenSSF / public RFC processes |
| Travel + conferences | $150K | LF AI, KubeCon, RSA, Money 20/20, Saudi Fintech, GITEX |
| Total | **~$1.1M** | This is the focused human spend that turns the substrate into the standard |

Out of a $10-15M seed, this is allocation we recommend front-loading.

---

## Document maintenance

Updated after every conversation with any party named above. Owner: Rashed.
