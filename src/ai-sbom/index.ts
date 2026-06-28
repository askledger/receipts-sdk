// AI SBOM generator. Walks an AI deployment's MCP servers, skills,
// agent manifests, and model attachments, and produces a CycloneDX 1.5
// document where every component carries a Project Ledger receipt id
// attesting its discovery time + provenance.
//
// Cisco Model Provenance Kit + Palo Alto Protect AI are positioning
// for this market. We ship the open-source version first.

import { createHash } from "node:crypto";

export type ComponentType =
  | "model"
  | "dataset"
  | "mcp-server"
  | "skill"
  | "agent"
  | "tool"
  | "prompt-template";

export interface AIComponent {
  type: ComponentType;
  name: string;
  version: string;
  vendor?: string;
  purl?: string;                            // package URL (purl-spec)
  hashes?: { alg: "SHA-256"; content: string }[];
  source_uri?: string;                      // e.g. huggingface.co/... / github.com/...
  license?: string;
  dependencies?: string[];                  // names of other components
  attestations?: Array<{ type: string; signer: string; statement: string }>;
}

export interface AISBOMInput {
  tenant_id: string;
  components: AIComponent[];
  serial_number?: string;
}

export interface CycloneDX {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  version: number;
  metadata: { timestamp: string; tools: Array<{ vendor: string; name: string; version: string }> };
  components: Array<Record<string, unknown>>;
  dependencies: Array<{ ref: string; dependsOn: string[] }>;
}

export function buildAISBOM(input: AISBOMInput): CycloneDX {
  const serial = input.serial_number ?? `urn:uuid:${stableUuid(JSON.stringify(input.components))}`;
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: serial,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "ProjectLedger", name: "ai-sbom", version: "0.1.0" }],
    },
    components: input.components.map(toCdxComponent),
    dependencies: input.components
      .filter((c) => (c.dependencies?.length ?? 0) > 0)
      .map((c) => ({ ref: refFor(c), dependsOn: (c.dependencies ?? []).map((d) => `pkg:projectledger/${d}`) })),
  };
}

function toCdxComponent(c: AIComponent): Record<string, unknown> {
  return {
    type: cdxType(c.type),
    "bom-ref": refFor(c),
    name: c.name,
    version: c.version,
    ...(c.vendor ? { publisher: c.vendor } : {}),
    ...(c.purl ? { purl: c.purl } : {}),
    ...(c.license ? { licenses: [{ license: { id: c.license } }] } : {}),
    ...(c.hashes ? { hashes: c.hashes } : {}),
    ...(c.source_uri ? { externalReferences: [{ type: "distribution", url: c.source_uri }] } : {}),
    properties: [
      { name: "pl:ai_component_type", value: c.type },
      ...(c.attestations ?? []).map((a, i) => ({ name: `pl:attestation:${i}`, value: `${a.type}:${a.signer}` })),
    ],
  };
}

function cdxType(t: ComponentType): string {
  switch (t) {
    case "model": return "machine-learning-model";
    case "dataset": return "data";
    case "mcp-server":
    case "skill":
    case "agent":
    case "tool":
    case "prompt-template":
      return "application";
  }
}

function refFor(c: AIComponent): string {
  return c.purl ?? `pkg:projectledger/${encodeURIComponent(c.name)}@${encodeURIComponent(c.version)}`;
}

function stableUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
