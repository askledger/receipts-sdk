# P0 — Initial status page entry

Use this for the FIRST update on a customer-impacting outage.

---

**Title:** Investigating elevated error rates

**Body:**

We are investigating reports of elevated error rates affecting [SERVICE]
starting at [TIME UTC]. Our on-call engineering team is engaged. Receipt
signing and verification [is / is not] affected.

We will post the next update within 30 minutes regardless of new findings.

---

# P0 — Identified

**Title:** Identified — [BRIEF ROOT CAUSE]

**Body:**

We have identified the cause as [BRIEF ROOT CAUSE]. We are working on a
fix. Estimated time to mitigation: [DURATION].

Customer impact so far: [PERCENTAGE] of requests to [SERVICE] received
errors between [START UTC] and [NOW UTC].

Receipt integrity is not affected — no receipts have been lost or
tampered with. The transparency log continues to publish.

---

# P0 — Mitigated

**Title:** Mitigated — service restored

**Body:**

The issue has been mitigated as of [TIME UTC]. Error rates have returned
to baseline.

We will publish a public postmortem within 5 business days at
status.projectledger.io/postmortems.

---

# Style rules

- UTC times, ISO-style ("13:45 UTC", not "1:45pm").
- Never name a single tenant.
- Never speculate on root cause in the initial post.
- Never use the words "no impact" before forensics confirms it.
- Never include "we are sorry" until the mitigated post.
