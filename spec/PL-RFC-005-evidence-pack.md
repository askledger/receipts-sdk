# PL-RFC-005 · Evidence Pack Envelope

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define the package a regulator or auditor receives to inspect a
tenant's AI activity for a given period and regulator.

## 2 · Envelope

An Evidence Pack is a signed `.tar.zst` archive with the following
structure:

```
pack-<tenant>-<regulator>-<period>.tar.zst
├── manifest.json            ← signed
├── receipts/                ← per-tenant chain segment in canonical JSON
│   ├── 00000001.json
│   ├── 00000002.json
│   └── …
├── policies/                ← active policy bundles at the time of each receipt
│   ├── <bundle_hash>.json
│   └── …
├── proofs/                  ← transparency-log inclusion proofs for each receipt
│   ├── <receipt_id>.json
│   └── …
├── keys/                    ← public keys for every kid referenced
│   └── <kid>.pub
└── README.md                ← human-readable orientation
```

## 3 · manifest.json

```
{
  "schema_version" : "1.0",
  "tenant_id"      : <string>,
  "regulator"      : <string>,        // e.g. "EU_AI_ACT"
  "period_start"   : <RFC 3339>,
  "period_end"     : <RFC 3339>,
  "regulator_articles" : [ <article_id>, ... ],
  "receipt_count"  : <int>,
  "first_height"   : <int>,
  "last_height"    : <int>,
  "head_hash_at_period_end" : <hex>,
  "policy_bundles" : [ { "bundle_hash": <hex>, "active_from": ..., "active_to": ... } ],
  "log_id"         : <opaque>,
  "issued_at"      : <RFC 3339>,
  "issuer"         : { "name": <string>, "kid": <string> }
}
```

The manifest is signed in `manifest.json.sig` (Ed25519 over canonical
bytes of the manifest).

## 4 · Inclusion of policies

Every Receipt in `receipts/` references a `policy_bundle_hash`. The
corresponding bundle MUST appear in `policies/`. Auditors can re-derive
the bundle hash and confirm the bundle was what the chain claims.

## 5 · Inclusion of proofs

Every Receipt in `receipts/` MUST have a corresponding inclusion proof
in `proofs/<receipt_id>.json`, referencing an STH that was current at
the time of the period end.

## 6 · Validation procedure

Given an Evidence Pack:

1. Verify `manifest.json.sig` against the issuer's public key.
2. For each Receipt in `receipts/`, verify per PL-RFC-001 §8 using
   the public keys in `keys/`.
3. For each Receipt, recompute the leaf hash per PL-RFC-004 §3 and
   verify the inclusion proof against the STH referenced.
4. Verify chain continuity per PL-RFC-003 §4.
5. For each Receipt, verify `policy_bundle_hash` matches a bundle in
   `policies/`.

A pack is *valid* iff every step succeeds.

## 7 · Reference exporter

The reference exporter is in `src/evidence/`. Invocation:

```
pl evidence pack \
  --tenant=<id> \
  --regulator=EU_AI_ACT \
  --from=2026-01-01 --to=2026-03-31 \
  --out=pack-acme-eu_ai_act-2026q1.tar.zst
```

## 8 · Regulator-specific exhibits

A pack **MAY** include additional exhibits at the root, named
`exhibit-<id>.json`, that map Receipts to regulator-specific evidence
requirements (e.g. EU AI Act Annex IV technical files; CBUAE Article-15
attestations). Exhibit semantics are out of scope for this RFC and live
in regulator-specific addendums.

## 9 · References

- PL-RFC-001 — Receipt Schema.
- PL-RFC-003 — Chain Semantics.
- PL-RFC-004 — Transparency Log Binding.
