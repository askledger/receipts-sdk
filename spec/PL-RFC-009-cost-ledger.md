# PL-RFC-009 · Cost Ledger Format

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Codify how token usage and cost are recorded inside a Receipt so finance
dashboards across vendors compare like-for-like and cascade savings are
verifiable.

## 2 · Cost block

When a Receipt records an AI invocation, the implementation **SHOULD**
populate:

```
event.payload.cost = {
  "vendor"             : <string>,
  "model"              : <string>,
  "input_tokens"       : <int>,
  "output_tokens"      : <int>,
  "cache_read_tokens"  : <int> OPTIONAL,
  "cache_write_tokens" : <int> OPTIONAL,
  "usd"                : <decimal as string>,
  "pricing_version"    : <string>          // pricing table version
}
```

`usd` is recorded as a string-encoded decimal to avoid floating-point
rounding (e.g. `"0.00370"`). Implementations **MUST** round half-up to
6 decimal places.

## 3 · Pricing tables

The pricing table is a separate artifact. Reference table is shipped at
`src/cost/pricing.ts` and versioned via `pricing_version`. Verifiers
recomputing cost **MUST** use the same pricing version named in the
Receipt.

## 4 · Cascade attribution

When a Receipt is part of a cascade (PL-RFC-007 §2 + cascade docs), the
cascade linkage is recorded:

```
event.payload.cost.cascade = {
  "stage"      : "planner" | "executor",
  "linked_to"  : <receipt_id>,         // sibling stage's id
  "approved"   : <bool>                // executor-stage only
}
```

The savings calculation is reproducible by summing planner + executor
costs and comparing against a baseline computed from the executor's
pricing applied to all tokens.

## 5 · Budget decisions

When a budget guard fires (`warn`, `throttle`, `deny`), a Receipt is
emitted with:

```
event.event_type         = "ai.invocation_denied_by_budget" | "ai.invocation_budget_warning"
event.payload.metadata.budget = {
  "policy_id"     : <string>,
  "action"        : "warn" | "throttle" | "deny",
  "ratio"         : <0..1+>,
  "remaining_usd" : <decimal as string>
}
```

This is the artifact the developer cites as "policy denied my call, not
my mistake."

## 6 · Carbon linkage

A cost block **MAY** carry a `carbon` sub-block referencing PL-RFC-010.
When present, both blocks **MUST** be canonicalized together.

## 7 · References

- PL-RFC-001 — Receipt Schema.
- PL-RFC-010 — Carbon Ledger Format.
- `src/cost/pricing.ts`, `src/cost/cascade.ts`, `src/cost/budget.ts`.
