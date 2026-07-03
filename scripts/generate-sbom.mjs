#!/usr/bin/env node
/**
 * Generate a CycloneDX 1.5 SBOM for this package.
 *
 * Reads package.json and node_modules to build a minimal but valid SBOM
 * useful for supply-chain transparency and SLSA Level 3 attestation.
 *
 *   npm run sbom > sbom.cdx.json
 *
 * For richer SBOMs (transitive deps with licenses, vulns), use
 * `cyclonedx-bom` or `syft`. This script keeps zero extra deps.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function bomRefFor(pkg) {
  return `pkg:npm/${encodeURIComponent(pkg.name)}@${pkg.version}`;
}

function hashFile(p) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function discoverDeps(root) {
  const nm = path.join(root, "node_modules");
  if (!fs.existsSync(nm)) return [];
  const components = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (name === ".bin" || name === ".cache") continue;
      const sub = path.join(dir, name);
      if (name.startsWith("@")) {
        walk(sub);
        continue;
      }
      const pj = path.join(sub, "package.json");
      if (fs.existsSync(pj)) {
        try {
          const pkg = readJSON(pj);
          if (!pkg.name) continue;
          components.push({
            type: "library",
            "bom-ref": bomRefFor(pkg),
            name: pkg.name,
            version: pkg.version ?? "0.0.0",
            purl: bomRefFor(pkg),
            ...(pkg.license && { licenses: [{ license: { id: String(pkg.license) } }] }),
            ...(pkg.description && { description: String(pkg.description).slice(0, 300) }),
          });
        } catch {
          // skip malformed
        }
      }
    }
  };
  walk(nm);
  return components;
}

const root = ROOT;
const ours = readJSON(path.join(root, "package.json"));
const components = discoverDeps(root);

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: "AskLedger",
        name: "generate-sbom.mjs",
        version: ours.version,
      },
    ],
    component: {
      type: "library",
      "bom-ref": bomRefFor(ours),
      name: ours.name,
      version: ours.version,
      purl: bomRefFor(ours),
      licenses: [{ license: { id: ours.license ?? "Apache-2.0" } }],
    },
  },
  components,
};

process.stdout.write(JSON.stringify(sbom, null, 2));
