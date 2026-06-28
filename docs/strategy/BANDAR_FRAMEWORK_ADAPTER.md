# Bandar Naghi Framework Adapter — Strategy

**Version:** 1.0
**Owner:** Rashed Ali Khan
**Status:** Internal — to be discussed with Bandar at next meeting

---

## What we built

A formal **open-source adapter shell** for Bandar Naghi's three published frameworks — QAG, QAIS, and AI Agency — that plugs into Project Ledger as a composable industry framework.

- **`src/frameworks/bandar-naghi.ts`** — typed framework definitions
- **`src/frameworks/index.ts`** — `frameworkAlignment()` walks a receipt and returns which Bandar pillars / towers the receipt contributes evidence to
- **`applyAuthorContribution()`** — accepts author-supplied JSON to fill in pillar text, signed and attributed back to Bandar

This is the first published artifact that takes Bandar's frameworks beyond a Kindle book — into running open-source code with byte-identical receipts in five languages.

---

## What is verified vs. awaiting

Per our verification discipline:

| Asset | Source | State |
|---|---|---|
| QAG · framework name + 5-pillar structure | bandarnaghi.com homepage AI Governance card | **VERIFIED** |
| QAG · individual pillar text | Kindle book B0FQ5Y6KVY | **AWAITING_AUTHOR_VERIFICATION** |
| QAIS · framework name + 3-tower structure | bandarnaghi.com homepage AI Security card | **VERIFIED** |
| QAIS · individual tower text | Kindle book B0FR3766G9 | **AWAITING_AUTHOR_VERIFICATION** |
| AI Agency · framework name + 7-pillar structure | bandarnaghi.com homepage AI Agency card | **VERIFIED** |
| AI Agency · individual pillar text | Kindle book B0FRF3B5P7 | **AWAITING_AUTHOR_VERIFICATION** |
| Executive Philosophy · 6 priorities | bandarnaghi.com homepage Executive Philosophy section | **VERIFIED** word-for-word |
| Executive Metrics · $2B+ / 106 / 25+ | bandarnaghi.com homepage Executive Metrics section | **VERIFIED** |

We **deliberately did not** paraphrase or reverse-engineer the per-pillar book content. The adapter ships every pillar slot marked `[AWAITING_AUTHOR_VERIFICATION]` with a citation pointing at the source book.

---

## Why this is the meeting hook

The original meeting ask was: *"Will you be our advisor?"* That ask is generic.

The new ask is: ***"We've open-sourced an adapter for your three frameworks. The structure is published verbatim from your site. The pillar specifics are pending your input. Will you co-author the verified mapping?"***

That ask is concrete. It produces a named artifact under joint credit. It costs Bandar 30 minutes of book-to-JSON translation. And it produces an open-source publication that **his books point at and that points back at his books**. That's the kind of compounding distribution any serious author wants.

### The proposed published artifact

> **Bandar Naghi Frameworks · Project Ledger Adapter v1.0**
> *by Bandar Naghi (frameworks) and Rashed Ali Khan + Mahamed Arif (substrate)*
>
> The first cryptographically verifiable implementation of QAG, QAIS, and AI Agency on top of the Project Ledger Receipts protocol. Every receipt produced under this adapter automatically cites which QAG pillars, QAIS towers, and AI Agency pillars it contributes evidence toward. Apache-2.0, open spec, byte-identical across 5 SDKs.

This is the artifact we drop into the meeting. It's already on GitHub. It compiles. It runs. It needs his pillar text and his blessing to become v1.0.

---

## What we ask Bandar for in the meeting

Concretely, three things — in ascending difficulty:

1. **Permission** to publish the adapter as it is (verified outer structure, pending pillar text) with attribution to him as the framework author. This costs him nothing and produces an open-source artifact that markets his books.

2. **30 minutes** of his time to translate his book's pillar/tower headlines and one-paragraph descriptions into the adapter's JSON format. We do the technical work; he supplies the text he already wrote. The contribution gets signed under his name with a public attribution chain.

3. **Joint authorship** of a 6–10 page position paper:
   > *"From Framework to Cryptographic Implementation: How Quantitative AI Governance Becomes Regulator-Verifiable"* by Bandar Naghi and Rashed Ali Khan.

   The adapter is the running code that the paper points at. The paper is the demand-side credibility that the adapter needs. The two compound.

---

## Why he will say yes

| Bandar's interest | What this delivers |
|---|---|
| His books selling | Every customer who installs Project Ledger sees QAG / QAIS / AI Agency in their receipts and pulls up the Amazon link |
| His reputation as the originator of the frameworks | Cryptographically signed attribution in every receipt that cites his work |
| His operating principle "Impossible only means we haven't found the solution yet!" | The adapter is the solution to a problem his frameworks define |
| His commitment to "creating intelligent systems that learn, adapt and potentially act autonomously" | The adapter is the cryptographic substrate for exactly that |
| Top 50 CxO Middle East 2023 standing | A named co-author position on an open-source standard is a CV asset, not a CV cost |
| First CDO to implement GenAI in the Kingdom | Pairs naturally with first cryptographic AI receipts substrate in MENA |

---

## What we do if he says no

- We keep the adapter exactly as it is (verified outer structure, pending text)
- The page in the demo still cites his frameworks by name and links to his books
- We never claim verified pillar text we don't have
- The substrate proceeds without his explicit endorsement; he gets credit by name; he gets distribution for his books; we lose nothing

This is the structural elegance of the design: it works whether or not he opts in. His opt-in just makes it stronger.

---

## What we do if he says yes

1. Within 48 hours of the meeting: publish the JSON contribution PR with his text
2. Within 7 days: ship adapter v1.0 with a press release referencing both his books and our protocol
3. Within 30 days: draft and circulate the joint position paper for his review
4. Within 90 days: publish the paper; announce on his platform and ours simultaneously

---

## Technical structure

```ts
import {
  QAG_FRAMEWORK,
  QAIS_FRAMEWORK,
  AI_AGENCY_FRAMEWORK,
  applyAuthorContribution,
  frameworkAlignment,
} from "@projectledger/receipts-sdk";

// Today — verified outer structure with awaiting pillar text
console.log(QAG_FRAMEWORK.components.length);   // 5
console.log(QAG_FRAMEWORK.components[0].verification);  // "awaiting"

// After Bandar contributes
const updated = applyAuthorContribution(QAG_FRAMEWORK, {
  framework_id: "bn-qag",
  components: {
    "QAG-P1": {
      title: "[Bandar's actual P1 title]",
      description: "[Bandar's actual P1 description]",
    },
    // ...
  },
  attribution: { author: "Bandar Naghi", verified_at: "2026-06-15T..." },
});

// Now in every receipt
const alignment = frameworkAlignment(receipt);
// → [{framework_id: "bn-qag", component_id: "QAG-P1", confidence: 0.92}, ...]
```

The receipts SDK already exports this. Tests pass. Build is clean. The adapter is real code, not a slide.

---

## Document maintenance

Owned by Rashed. Updated after every conversation with Bandar. The verification table at the top is the truth ledger — every row is dated.
