// Property-based tests for RFC 8785 canonical JSON.
// Hand-written corpora prove correctness on specific cases; these
// properties prove correctness on the space of cases.
//
// We don't depend on fast-check to keep the test bundle small — the
// generator below is sufficient for the invariants we care about.

import { describe, it, expect } from "vitest";
import { canonicalize } from "../src/canonicalize.js";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function rand(seed: { s: number }): number {
  // Linear congruential — deterministic, good enough for fuzz.
  seed.s = (seed.s * 1664525 + 1013904223) >>> 0;
  return seed.s / 0x1_0000_0000;
}

function genString(seed: { s: number }, maxLen = 8): string {
  const len = Math.floor(rand(seed) * maxLen);
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(32 + Math.floor(rand(seed) * 94));
  }
  return s;
}

function genJson(seed: { s: number }, depth = 0): Json {
  const r = rand(seed);
  if (depth > 4 || r < 0.2) {
    const which = Math.floor(rand(seed) * 5);
    if (which === 0) return null;
    if (which === 1) return rand(seed) < 0.5;
    if (which === 2) return Math.floor(rand(seed) * 1_000_000) - 500_000;
    if (which === 3) return genString(seed);
    return rand(seed) * 1000;
  }
  if (r < 0.6) {
    const len = Math.floor(rand(seed) * 5);
    return Array.from({ length: len }, () => genJson(seed, depth + 1));
  }
  const len = Math.floor(rand(seed) * 6);
  const obj: { [k: string]: Json } = {};
  for (let i = 0; i < len; i++) {
    const k = genString(seed, 6) || `k${i}`;
    obj[k] = genJson(seed, depth + 1);
  }
  return obj;
}

function shuffleKeys(j: Json, seed: { s: number }): Json {
  if (j === null || typeof j !== "object") return j;
  if (Array.isArray(j)) return j.map((x) => shuffleKeys(x, seed));
  const keys = Object.keys(j);
  for (let i = keys.length - 1; i > 0; i--) {
    const swap = Math.floor(rand(seed) * (i + 1));
    [keys[i], keys[swap]] = [keys[swap], keys[i]];
  }
  const out: { [k: string]: Json } = {};
  for (const k of keys) out[k] = shuffleKeys((j as { [k: string]: Json })[k], seed);
  return out;
}

describe("canonicalize · property tests over 1000 random inputs", () => {
  it("is idempotent: canonicalize(canonicalize(x)) == canonicalize(x)", () => {
    const seed = { s: 0xc0ffee };
    for (let i = 0; i < 1000; i++) {
      const j = genJson(seed);
      const once = canonicalize(j);
      const twice = canonicalize(JSON.parse(once) as unknown);
      expect(twice).toBe(once);
    }
  });

  it("is key-order-invariant: any permutation of object keys produces the same output", () => {
    const seed = { s: 0xdeadbeef };
    for (let i = 0; i < 500; i++) {
      const j = genJson(seed);
      const base = canonicalize(j);
      const shuffled = shuffleKeys(j, seed);
      expect(canonicalize(shuffled)).toBe(base);
    }
  });

  it("output is valid JSON that re-parses to a structurally equal value", () => {
    const seed = { s: 0xbadc0ffe };
    for (let i = 0; i < 500; i++) {
      const j = genJson(seed);
      const c = canonicalize(j);
      const roundTrip = JSON.parse(c) as unknown;
      expect(canonicalize(roundTrip)).toBe(c);
    }
  });
});
