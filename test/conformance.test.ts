/**
 * Conformance test runner.
 *
 * Runs the shared cross-language conformance vectors (JSON files in
 * test/conformance/) against this TypeScript implementation. The Python
 * SDK runs the same vectors via its own pytest harness.
 *
 * This is the wire-format contract: if these vectors pass for two
 * different SDKs, receipts signed by one can be verified by the other.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, sha256String } from "../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "conformance");

interface CanonVector {
  name: string;
  input: unknown;
  expected: string;
}
interface ShaVector {
  name: string;
  input: string;
  expected_hex: string;
}

const canon = JSON.parse(
  fs.readFileSync(path.join(DIR, "canonicalize.json"), "utf-8")
) as { vectors: CanonVector[] };
const shaVec = JSON.parse(
  fs.readFileSync(path.join(DIR, "sha256.json"), "utf-8")
) as { vectors: ShaVector[] };

describe("conformance: canonicalize (RFC 8785)", () => {
  for (const v of canon.vectors) {
    it(v.name, () => {
      expect(canonicalize(v.input)).toBe(v.expected);
    });
  }
});

describe("conformance: sha256", () => {
  for (const v of shaVec.vectors) {
    it(v.name, () => {
      expect(sha256String(v.input)).toBe(v.expected_hex);
    });
  }
});
