# @projectledger/conformance

Conformance test corpus + runner for the Project Ledger AI Decision
Receipts protocol (PL-RFC-001…010).

Three conformance levels, mirroring the SLSA pattern:

| Level | Requirement |
|---|---|
| **CL1 — Canonical** | Implementation produces byte-identical RFC 8785 canonical bytes for every fixture |
| **CL2 — Signed** | Implementation produces byte-identical signed Receipts for every fixture (deterministic over a known key) |
| **CL3 — Chained** | Implementation produces byte-identical chain state across 100 sequential events |

## Run

```
npx @projectledger/conformance run \
  --canonicalize ./scripts/my-canonicalize.sh \
  --sign         ./scripts/my-sign.sh \
  --chain        ./scripts/my-chain.sh
```

Each script reads JSON from stdin and writes the implementation's
output to stdout. Refer to `vectors/` for the input corpus and
`expected/` for the reference outputs.

## Submit a result

PR a JSON file to `results/<your-org>-<sdk>-<version>.json`. CI
re-runs the corpus against your implementation and posts the badge if
the result reproduces.

## Vectors

- `vectors/canonical/*.json` — pairs of (raw input, canonical bytes)
- `vectors/signed/*.json` — pairs of (RawEvent, SignedReceipt) over a fixed Ed25519 key
- `vectors/chained/*.jsonl` — 100-event sequences with expected chain heads at each step

## License

The corpus is licensed under CC0 (public domain). The runner is
Apache-2.0.
