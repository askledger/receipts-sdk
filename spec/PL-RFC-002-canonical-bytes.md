# PL-RFC-002 · Canonical Bytes Profile

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define the byte-exact serialization used as the input to every SHA-256
hash and Ed25519 signature in the AskLedger protocol. Without a
canonical form, two implementations of `signReceipt` cannot agree on a
receipt's hash and cross-language conformance is impossible.

## 2 · Algorithm

AskLedger adopts **RFC 8785 (JSON Canonicalization Scheme, JCS)**
without modification. Implementations **MUST** produce the same byte
sequence as the JCS reference implementations for any well-formed JSON
input.

## 3 · Profile constraints on inputs

Receipt bodies passed to canonicalization **MUST** satisfy:

1. All values are JSON types: `null`, boolean, number, string, array, or object.
2. No JavaScript `undefined` values appear; omit the key entirely.
3. Strings are valid UTF-8 with no unpaired surrogates.
4. Numbers are finite (no `NaN`, no `Infinity`).
5. Object keys are unique within their containing object.
6. Object keys are valid UTF-8.

A canonicalizer that accepts an input violating any of the above **MUST**
reject the input rather than silently coerce it.

## 4 · Determinism requirements

For any two canonicalizer invocations on the same input, the byte
sequence output **MUST** be identical, regardless of:

- The order of keys in the input object.
- Whitespace in the input.
- Unicode normalization form of the input (NFC, NFD, NFKC, NFKD).
- Floating-point representation in the source text (e.g. `1.0` vs `1.00`).
- The implementation language.

## 5 · Hash and signature input

Throughout the AskLedger protocol:

- SHA-256 hash inputs **MUST** be the canonical bytes of the JSON value, not the JSON value's reparsed form.
- Ed25519 signature inputs **MUST** be the canonical bytes of the Receipt body, including a populated `integrity.receipt_hash`.

## 6 · Self-referential field handling

The `integrity.receipt_hash` field is self-referential: it is part of
the body that is hashed. The protocol resolves this by:

1. Constructing the Receipt body with `receipt_hash = ""`.
2. Computing SHA-256 of the canonical bytes of that body.
3. Setting `receipt_hash` to the result.
4. Producing the canonical bytes a second time, this time over the
   body with the populated `receipt_hash`. This second canonical-byte
   sequence is the signature input.

Implementations **MUST** follow this two-pass procedure.

## 7 · Conformance test corpus

The conformance package (`@askledger/conformance`) ships a fixture
set with input/output pairs that exercise:

- Unicode escape sequences (control characters, surrogate pairs).
- Numeric edge cases (very large, very small, negative zero).
- Deeply nested objects and arrays.
- Empty objects, arrays, and strings.

An implementation is *CL1-conformant* iff every fixture in the corpus
produces a byte-identical canonical form.

## 8 · References

- RFC 8785 — JSON Canonicalization Scheme.
- PL-RFC-001 — Receipt Schema.
