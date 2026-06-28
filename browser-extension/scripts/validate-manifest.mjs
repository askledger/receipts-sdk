#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: validate-manifest.mjs <manifest.json>"); process.exit(2); }

const m = JSON.parse(readFileSync(path, "utf-8"));
const errors = [];

if (m.manifest_version !== 3) errors.push("manifest_version must be 3 (MV3 required)");
if (!m.name) errors.push("name required");
if (!m.version) errors.push("version required");
if (!m.description) errors.push("description required");
if (!m.permissions || !Array.isArray(m.permissions)) errors.push("permissions[] required");
if (!m.host_permissions || !Array.isArray(m.host_permissions)) errors.push("host_permissions[] required");

const csp = m.content_security_policy?.extension_pages || "";
if (!csp.includes("script-src 'self'")) errors.push("content_security_policy.extension_pages must restrict script-src to 'self'");
if (csp.includes("'unsafe-eval'")) errors.push("'unsafe-eval' is not allowed (Chrome Web Store rejects MV3 with eval)");
if (csp.includes("'unsafe-inline'") && !csp.includes("'unsafe-inline' /* style-only */")) errors.push("'unsafe-inline' present outside style-src — remove");

if (m.background?.service_worker == null) errors.push("background.service_worker required (MV3)");
if (m.web_accessible_resources && m.web_accessible_resources.some(r => (r.matches || []).includes("<all_urls>") && !r.use_dynamic_url)) {
  errors.push("web_accessible_resources with <all_urls> must set use_dynamic_url:true");
}

if (errors.length) {
  console.error("manifest invalid:\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log("manifest ok · version " + m.version);
