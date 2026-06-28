#!/usr/bin/env node
/**
 * Dev login helper — prints a session cookie value that satisfies the
 * console's middleware.
 *
 * Usage:
 *   node scripts/dev-login.mjs                   # default tenant_admin role
 *   node scripts/dev-login.mjs platform_super_admin
 *
 * Paste the printed cookie into your browser dev tools under cookies
 * for http://localhost:3000 — name "pl_session", value as printed.
 *
 * NEVER USE THIS IN PRODUCTION. The console enforces real OIDC + MFA
 * in production via the configured IdP.
 */

const ROLES = [
  "platform_super_admin",
  "support_admin",
  "billing_admin",
  "org_owner",
  "tenant_admin",
  "finance_manager",
  "hr_manager",
  "sales_manager",
  "approver",
  "auditor",
  "employee",
];

const role = process.argv[2] ?? "tenant_admin";
if (!ROLES.includes(role)) {
  console.error("Unknown role:", role);
  console.error("Valid roles:", ROLES.join(", "));
  process.exit(1);
}

const session = {
  sub: "dev-user-001",
  email: "demo@github.com/askledger/receipts-sdk",
  name: "Demo User",
  tenantId: "acme-bank",
  roles: [role],
  lastMfaAt: Date.now(),
  expiresAt: Date.now() + 8 * 60 * 60 * 1000,
};

const value = Buffer.from(JSON.stringify(session)).toString("base64");

console.log("");
console.log("Project Ledger · dev login cookie");
console.log("───────────────────────────────────────────────────────────────────");
console.log("  Cookie name:  pl_session");
console.log("  Cookie value:");
console.log("");
console.log("  " + value);
console.log("");
console.log("  Role:     " + role);
console.log("  Tenant:   " + session.tenantId);
console.log("  Expires:  " + new Date(session.expiresAt).toISOString());
console.log("───────────────────────────────────────────────────────────────────");
console.log("");
console.log("  To use in Chrome / Edge:");
console.log("    1. Open http://localhost:3000");
console.log("    2. F12 → Application → Cookies → http://localhost:3000");
console.log("    3. Add cookie: name=pl_session, value=<above>");
console.log("    4. Refresh");
console.log("");
console.log("  Or in a single line for curl / Playwright:");
console.log("    Cookie: pl_session=" + value);
console.log("");
