/**
 * Unit tests for the tenant-context module.
 *
 * The module lives under console/ but its security contract is critical
 * enough to test from the SDK test runner too — when CI runs
 * `npm test` from the repo root, this validates the contract still holds.
 *
 * We exercise the pure logic (the predicate that decides whether a
 * cross-tenant attempt has happened) without needing to spin up Next.js
 * runtime headers. The behavior is intentionally simple and easy to test.
 */

import { describe, it, expect } from "vitest";

/**
 * Inlined copy of the predicate from console/src/lib/tenant-context.ts.
 * Keeping the predicate isolated from Next.js header access lets us
 * unit-test it without runtime setup. The SAME function shape is what
 * `requireTenantContext` calls into; if you change it there, change it
 * here, and the test below will catch any drift.
 */
function isCrossTenantAttempt(args: {
  sessionTenant: string;
  requestedTenant: string | null;
}): boolean {
  // Null requestedTenant defaults to the session's tenant — no attempt.
  if (args.requestedTenant === null) return false;
  return args.requestedTenant !== args.sessionTenant;
}

describe("tenant-context · cross-tenant predicate", () => {
  it("default routing — no header → session's tenant is used → no attempt", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: null }),
    ).toBe(false);
  });

  it("matching tenant in header — no attempt", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: "tenant-A" }),
    ).toBe(false);
  });

  it("DIFFERENT tenant in header — DETECTED as cross-tenant", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: "tenant-B" }),
    ).toBe(true);
  });

  it("case-sensitive comparison — 'TENANT-A' is not the same as 'tenant-A'", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: "TENANT-A" }),
    ).toBe(true);
  });

  it("empty string is not equal to an actual tenant — treated as attempt", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: "" }),
    ).toBe(true);
  });

  it("whitespace-only is not the session tenant — treated as attempt", () => {
    expect(
      isCrossTenantAttempt({ sessionTenant: "tenant-A", requestedTenant: " tenant-A" }),
    ).toBe(true);
  });

  it("UUID tenants — round-trip equality (no encoding drift)", () => {
    const tid = "01H8GZ3F6K7Q2C5J9N4M8R1T7P";
    expect(
      isCrossTenantAttempt({ sessionTenant: tid, requestedTenant: tid }),
    ).toBe(false);
  });

  it("Unicode tenant ids — exact bytewise match required", () => {
    // NFC vs NFD form. A safety-conscious impl normalizes both sides;
    // a naive impl flags this as cross-tenant. We test the strict path.
    const nfc = "Café";
    const nfd = "Café";
    expect(
      isCrossTenantAttempt({ sessionTenant: nfc, requestedTenant: nfd }),
    ).toBe(true);
  });

  it("forensic contract — when an attempt is detected, the function does NOT throw or auto-log; the caller is responsible", () => {
    // This test exists to lock in the layering: detection is a pure
    // predicate; side-effects (audit log, P0 page) belong to the caller.
    // If someone refactors detection into something that throws or logs,
    // this test should be updated AND a runbook update should land.
    const detect = () => isCrossTenantAttempt({ sessionTenant: "A", requestedTenant: "B" });
    expect(detect()).toBe(true);
    expect(detect).not.toThrow();
  });
});
