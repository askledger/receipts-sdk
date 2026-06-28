# PL-RFC-008 · Policy Bundle and Decision Block

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Specify how a policy engine's decision is bound into a Receipt so that
a verifier, given the Receipt and the bundle, can independently
recompute the decision.

## 2 · Policy bundle

A policy bundle is a content-addressed artifact:

```
PolicyBundle = {
  "schema_version" : "1.0",
  "bundle_id"      : <string>,
  "produced_at"    : <RFC 3339>,
  "engine"         : "opa" | "cel" | "rego" | "json-logic" | <vendor>,
  "policies"       : [ Policy, ... ]
}

Policy = {
  "policy_id"   : <string>,
  "title"       : <string>,
  "regulator"   : <string> OPTIONAL,  // e.g. "EU_AI_ACT"
  "articles"    : [ <article_id>, ... ] OPTIONAL,
  "expression"  : <opaque to verifier; engine-specific source>
}
```

`policy_bundle_hash` is SHA-256 of the canonical bytes (PL-RFC-002) of
the bundle. This hash is what appears in `decision.policy_bundle_hash`.

## 3 · Decision block

```
DecisionBlock = {
  "policy_bundle_hash" : <hex SHA-256>,
  "applied_policies"   : [ <policy_id>, ... ],   // policies that fired
  "decision"           : "allow" | "block" | "flag" | "review",
  "reason_codes"       : [ <code>, ... ]
}
```

A reason code is a short opaque token (e.g. `PII_DETECTED`,
`SHADOW_AI`, `POLICY_HIGH_RISK`) that the policy bundle defines. The
mapping from `reason_code` to human-readable explanation **MUST** live
in the bundle, not in the Receipt.

## 4 · Reproducibility

A verifier with (Receipt R, PolicyBundle B) **MUST** be able to:

1. Recompute the canonical bytes of B and confirm SHA-256(B) ==
   R.decision.policy_bundle_hash.
2. Re-evaluate B against R.event and confirm the decision matches
   R.decision.decision and R.decision.applied_policies.

If the bundle's expression language is non-deterministic (e.g. clock
calls, RNG), the verifier **MAY** accept the prior decision without
re-evaluation, but the bundle **SHOULD** declare itself non-deterministic
in metadata.

## 5 · GDPR Article 22 considerations

For an automated decision producing legal/significant effects on a
natural person:

- The Receipt's `decision.reason_codes` **MUST** be human-explainable
  via the bundle's mapping table.
- The Receipt's `context.user_id` **MUST** identify the data subject
  (or be redacted to an opaque subject id per data-residency rules).
- The Receipt **MUST** be retained for the regulatory retention
  window, NOT subject to right-to-erasure (Art. 17(3)(b) exception).

## 6 · References

- PL-RFC-001 — Receipt Schema.
- PL-RFC-002 — Canonical Bytes Profile.
- EU AI Act Articles 14, 50, 86.
- GDPR Article 22.
