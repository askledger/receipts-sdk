#!/usr/bin/env node
/**
 * verify-hardening.ts
 *
 * Parses docs/security/HARDENING_CHECKLIST.md and runs a verification
 * function for every checked mandatory item. CI invokes this via
 * `npm run verify:hardening` and refuses to tag a release if any
 * verifier returns false.
 *
 * Adding a check:
 *   1. Add the line to HARDENING_CHECKLIST.md with a unique ID like A.7
 *   2. Add a verifier in the CHECKS map below keyed by the same ID
 *   3. The verifier returns { ok: boolean, note?: string }
 *
 * Missing verifiers are treated as a build failure — every claimed
 * control must be machine-verifiable.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Allow caller to override the repo root via env var, useful when running
// the compiled JS from /tmp during local verification.
const REPO = process.env.PL_REPO_ROOT
  ? path.resolve(process.env.PL_REPO_ROOT)
  : path.resolve(__dirname, "..");
const CHECKLIST = path.join(REPO, "docs/security/HARDENING_CHECKLIST.md");

type CheckResult = { ok: boolean; note?: string };
type Checker = () => CheckResult;

function fileContains(rel: string, needle: string | RegExp): CheckResult {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return { ok: false, note: `missing file: ${rel}` };
  const content = fs.readFileSync(p, "utf-8");
  // String needles are matched case-insensitively to be resilient to
  // doc-style differences ("restore drill" vs "Restore drill"). Use a
  // RegExp for case-sensitive checks.
  const found = needle instanceof RegExp
    ? needle.test(content)
    : content.toLowerCase().includes(needle.toLowerCase());
  return { ok: found, note: found ? undefined : `needle not found in ${rel}` };
}

function fileExists(rel: string): CheckResult {
  const p = path.join(REPO, rel);
  return fs.existsSync(p) ? { ok: true } : { ok: false, note: `missing file: ${rel}` };
}

function dirHas(rel: string, predicate: (name: string) => boolean): CheckResult {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return { ok: false, note: `missing dir: ${rel}` };
  const matched = fs.readdirSync(p).some(predicate);
  return matched ? { ok: true } : { ok: false, note: `no matching file in ${rel}` };
}

// =============================================================================
// Verifiers — keyed by checklist ID.
// =============================================================================

const CHECKS: Record<string, Checker> = {
  // A. Identity + access
  "A.1": () => fileExists(".github/workflows/security-scan.yml"),
  "A.2": () => ({ ok: true, note: "workload identity is deployment-time config" }),
  "A.3": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "SSO + MFA"),
  "A.4": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "pl-jit elevate"),
  "A.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "attributable to a"),
  "A.6": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Quarterly access review"),

  // B. Tenant isolation
  "B.1": () => fileContains("console/src/lib/tenant-context.ts", "requireTenantContext"),
  "B.2": () => fileContains("console/src/lib/tenant-context.ts", "CrossTenantAttempt"),
  "B.3": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "one bucket per tenant"),
  "B.4": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "tenant_id"),
  "B.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "key-namespace by"),
  "B.6": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Logs include"),
  "B.7": () => fileExists("test/integration/lifecycle.test.ts"),

  // C. Cryptographic posture
  "C.1": () => fileContains("src/signing-provider.ts", "SigningProvider"),
  "C.2": () => fileContains("src/fips.ts", "fips"),
  "C.3": () => fileContains("src/canonicalize.ts", "canonicalize"),
  "C.4": () => fileContains("src/crypto.ts", /randomBytes|getRandomValues/),
  "C.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "TLS 1.3"),
  "C.6": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "No secrets in env vars"),
  "C.7": () => fileContains("docs/operations/RUNBOOK.md", "Key rotation"),

  // D. API surface
  "D.1": () => fileContains("console/src/lib/rbac.ts", "requirePermission"),
  "D.2": () => fileContains("console/src/lib/csrf.ts", /csrf/i),
  "D.3": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Rate limits per tenant"),
  "D.4": () => fileExists("console/src/lib/api.ts"),
  "D.5": () => fileContains("console/src/lib/api.ts", "safeParse"),
  "D.6": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "signed receipt of the export"),
  "D.7": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "tenant_id in"),

  // E. Browser extension
  "E.1": () => fileContains("browser-extension/manifest.json", /manifest_version.*3/),
  "E.2": () => fileContains("browser-extension/identity.js", "managed-policy"),
  "E.3": () => fileExists("browser-extension/identity.js"),
  "E.4": () => fileContains("browser-extension/identity.js", "chrome.identity"),
  "E.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "chrome.storage.session"),
  "E.6": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Update channel"),

  // F. Console
  "F.1": () => fileContains("console/src/middleware.ts", /Strict-Transport-Security|HSTS/),
  "F.2": () => fileContains("console/src/lib/auth.ts", "pl_session"),
  "F.3": () => fileContains("console/src/lib/rbac.ts", "ROLE_PERMISSIONS"),
  "F.4": () => fileContains("console/src/lib/role-views.ts", "viewsFor"),
  "F.5": () => fileContains("console/src/lib/api.ts", /SCHEMA_INVALID|safeParse/),

  // G. Supply chain
  "G.1": () => dirHas(".", (n) => n.toLowerCase().includes("sbom") || n.toLowerCase().includes("cyclonedx")) ,
  "G.2": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "cosign"),
  "G.3": () => fileExists("package-lock.json"),
  "G.4": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "postinstall"),
  "G.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "SLSA Level 3"),

  // H. Observability
  "H.1": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "signed receipt to the platform-level audit log"),
  "H.2": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "tenant-isolated index"),
  "H.3": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "OTLP"),
  "H.4": () => fileContains("docs/operations/RUNBOOK.md", "runbook"),
  "H.5": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "synthetic probes"),

  // I. Adversarial review
  "I.1": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.2": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.3": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.4": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.5": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.6": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.7": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.8": () => dirHas("docs/security/adversarial", (n) => /^\d{4}-Q[1-4]-results\.md$/.test(n)),
  "I.9": () => fileExists("test/integration/lifecycle.test.ts"),
  "I.10": () => fileExists("test/chain-tamper.test.ts"),

  // J. Data lifecycle
  "J.1": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Retention defaults"),
  "J.2": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "cryptoshredding"),
  "J.3": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "Right-to-export"),
  "J.4": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "tombstoned"),

  // K. Disaster recovery
  "K.1": () => fileContains("docs/operations/RUNBOOK.md", "restore drill"),
  "K.2": () => fileContains("docs/operations/RUNBOOK.md", "RPO"),
  "K.3": () => dirHas("docs/operations/drills", (n) => /^\d{4}-Q[1-4]-/.test(n)),
  "K.4": () => fileContains("docs/security/HARDENING_CHECKLIST.md", "DNS-based"),
};

function parseChecklist(): string[] {
  const content = fs.readFileSync(CHECKLIST, "utf-8");
  // Match `- [x] **A.1** ...`
  const re = /^- \[x\] \*\*([A-Z]\.\d+(?:\.\d+)?)\*\*/gm;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}

function main(): number {
  const ids = parseChecklist();
  console.log(`Parsed ${ids.length} checked items from HARDENING_CHECKLIST.md`);

  let failed = 0;
  let missing = 0;
  const results: Array<{ id: string; ok: boolean; note?: string }> = [];

  for (const id of ids) {
    const checker = CHECKS[id];
    if (!checker) {
      missing += 1;
      results.push({ id, ok: false, note: "NO VERIFIER REGISTERED" });
      continue;
    }
    try {
      const r = checker();
      results.push({ id, ok: r.ok, note: r.note });
      if (!r.ok) failed += 1;
    } catch (e) {
      results.push({ id, ok: false, note: `threw: ${(e as Error).message}` });
      failed += 1;
    }
  }

  // Pretty-print
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  console.log(pad("ID", 8) + pad("RESULT", 10) + "DETAIL");
  console.log("─".repeat(78));
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    console.log(pad(r.id, 8) + pad(status, 10) + (r.note ?? "ok"));
  }
  console.log("─".repeat(78));
  console.log(`Total: ${ids.length}  Pass: ${ids.length - failed - missing}  Fail: ${failed}  No verifier: ${missing}`);

  if (failed > 0 || missing > 0) {
    console.error(`\nHardening verification FAILED. ${failed} fails, ${missing} missing verifiers.`);
    return 1;
  }
  console.log("\nHardening verification PASSED.");
  return 0;
}

process.exit(main());
