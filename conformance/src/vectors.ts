// Conformance vectors. Hand-curated to exercise the corners of
// PL-RFC-002 (canonical bytes), PL-RFC-001 (receipt schema), and
// PL-RFC-003 (chain semantics). Reference outputs are produced by the
// canonical TypeScript implementation and frozen here.

import type { CanonicalVector, SignedVector, ChainedVector } from "./index.js";

export const CANONICAL_VECTORS: CanonicalVector[] = [
  { id: "empty-object", input: {}, expected_bytes_hex: "7b7d" },                       // "{}"
  { id: "empty-array",  input: [],  expected_bytes_hex: "5b5d" },                       // "[]"
  { id: "simple",       input: { a: 1, b: 2 }, expected_bytes_hex: "7b2261223a312c2262223a327d" },
  // remaining vectors loaded at runtime; this is the seed corpus.
];

export const SIGNED_VECTORS: SignedVector[] = [
  // Populated by `npm run conformance:freeze` against the reference
  // TS implementation. Out-of-band signed test key lives in
  // vectors/keys/conformance.json so any implementation can reproduce.
];

export const CHAINED_VECTORS: ChainedVector[] = [
  // Same — frozen sequences shipped in vectors/chained/*.jsonl.
];
