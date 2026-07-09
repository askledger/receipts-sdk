import { describe, it, expect } from "vitest";
import { TransparencyLog } from "../src/transparency-log/log.js";

// Any 32-byte hex is a valid leaf; make them deterministic and distinct.
const leafHex = (i: number) => (i + 1).toString(16).padStart(64, "0");

async function logOfSize(n: number): Promise<TransparencyLog> {
  const log = new TransparencyLog({ log_id: "t", signer: {} as any });
  for (let i = 0; i < n; i++) await log.append(leafHex(i), `r${i}`, "tenant");
  return log;
}

describe("transparency-log consistency proofs (RFC 9162)", () => {
  it("prove/verify round-trips for every (first,second) pair up to size 16", async () => {
    for (let second = 1; second <= 16; second++) {
      const log = await logOfSize(second);
      const secondRoot = log.currentRoot();
      for (let first = 1; first <= second; first++) {
        const firstRoot = (await logOfSize(first)).currentRoot();
        const proof = log.proveConsistency(first, second);
        expect(
          TransparencyLog.verifyConsistency(first, firstRoot, second, secondRoot, proof.proof),
          `consistency ${first} -> ${second}`
        ).toBe(true);
      }
    }
  });

  it("detects a rewritten history (bad root or corrupted proof fails)", async () => {
    const log = await logOfSize(8);
    const secondRoot = log.currentRoot();
    const firstRoot = (await logOfSize(5)).currentRoot();
    const proof = log.proveConsistency(5, 8).proof;

    // honest proof verifies
    expect(TransparencyLog.verifyConsistency(5, firstRoot, 8, secondRoot, proof)).toBe(true);
    // a rewritten prefix (wrong first root) is caught
    expect(TransparencyLog.verifyConsistency(5, "ff".repeat(32), 8, secondRoot, proof)).toBe(false);
    // a forged current root is caught
    expect(TransparencyLog.verifyConsistency(5, firstRoot, 8, "ee".repeat(32), proof)).toBe(false);
    // a tampered proof node is caught
    const bad = [...proof];
    bad[0] = "00".repeat(32);
    expect(TransparencyLog.verifyConsistency(5, firstRoot, 8, secondRoot, bad)).toBe(false);
  });

  it("non-trivial proofs are non-empty (regression for the old empty-proof bug)", async () => {
    const log = await logOfSize(4);
    // (2,4) must carry the right-subtree root; the old code returned [] here.
    expect(log.proveConsistency(2, 4).proof.length).toBeGreaterThan(0);
    // (1,2) must carry exactly the sibling leaf hash.
    expect((await logOfSize(2)).proveConsistency(1, 2).proof.length).toBe(1);
  });
});
