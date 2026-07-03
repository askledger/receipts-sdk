# PL-RFC-010 · Carbon Ledger Format

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define per-Receipt carbon attribution so an ESG report can be assembled
from the same chain that powers compliance and cost reporting.

## 2 · Carbon block

```
event.payload.carbon = {
  "vendor"        : <string>,
  "model"         : <string>,
  "wh"            : <decimal as string>,    // watt-hours
  "g_co2e"        : <decimal as string>,    // grams CO2-equivalent
  "per_1k_g"      : <decimal as string>,    // grams per 1k tokens
  "energy_source" : <string>,               // citation tag
  "grid_g_per_kwh": <int>                   // grid intensity used
}
```

Decimal precision: 4 decimal places, round half-up. String-encoded to
avoid floating-point drift.

## 3 · Energy profile table

The implementation maintains an energy profile keyed by
`<vendor>:<model>`:

```
EnergyProfile = {
  "wh_per_1k_tokens" : <float>,
  "grid_g_per_kwh"   : <int>,
  "source"           : <string>     // URL or citation
}
```

The reference table lives in `src/cost/carbon.ts`. Implementations
**SHOULD** refresh quarterly when vendors publish updated figures.

## 4 · ESG export bindings

For ESG reporting (S&P, MSCI, Sustainalytics):

- Sum `g_co2e` over the period to produce Scope 3 indirect emissions
  attributable to the tenant's AI usage.
- Sum by vendor for vendor-attribution.
- Combine with the cost block (PL-RFC-009) for cost-per-gram analysis.

## 5 · Honest precision caveat

These figures are **order-of-magnitude estimates**, not financial-grade
measurements. Receipts carrying carbon attribution **MUST** name the
energy-profile source in `energy_source` so consumers can adjust
methodology over time.

## 6 · References

- PL-RFC-009 — Cost Ledger Format.
- Hugging Face Energy Score methodology.
- IEA Grid Carbon Intensity 2026.
- `src/cost/carbon.ts`.
