import { describe, it, expect } from "vitest";
import { buildAISBOM } from "../src/ai-sbom/index.js";

describe("AI SBOM", () => {
  it("produces a valid CycloneDX 1.5 envelope", () => {
    const sbom = buildAISBOM({
      tenant_id: "acme",
      components: [
        { type: "model", name: "claude-sonnet-4-6", version: "20251101", vendor: "Anthropic", source_uri: "https://anthropic.com/claude" },
        { type: "mcp-server", name: "projectledger-receipts", version: "0.1.0", license: "Apache-2.0" },
      ],
    });
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.components).toHaveLength(2);
    expect(sbom.components[0]?.type).toBe("machine-learning-model");
    expect(sbom.components[1]?.type).toBe("application");
  });

  it("emits dependencies block when components reference each other", () => {
    const sbom = buildAISBOM({
      tenant_id: "acme",
      components: [
        { type: "agent", name: "credit-decision", version: "1.2.0", dependencies: ["claude-sonnet-4-6", "risk-scorer"] },
        { type: "model", name: "claude-sonnet-4-6", version: "20251101" },
        { type: "skill", name: "risk-scorer", version: "0.3.0" },
      ],
    });
    expect(sbom.dependencies).toHaveLength(1);
    expect(sbom.dependencies[0]?.dependsOn).toEqual([
      "pkg:projectledger/claude-sonnet-4-6",
      "pkg:projectledger/risk-scorer",
    ]);
  });

  it("uses purl when supplied; falls back to projectledger purl otherwise", () => {
    const sbom = buildAISBOM({
      tenant_id: "acme",
      components: [
        { type: "model", name: "llama-3", version: "70b", purl: "pkg:huggingface/meta-llama/Meta-Llama-3-70B" },
        { type: "tool", name: "custom", version: "1.0.0" },
      ],
    });
    expect(sbom.components[0]?.purl).toBe("pkg:huggingface/meta-llama/Meta-Llama-3-70B");
    expect(sbom.components[0]?.["bom-ref"]).toBe("pkg:huggingface/meta-llama/Meta-Llama-3-70B");
    expect(sbom.components[1]?.["bom-ref"]).toBe("pkg:projectledger/custom@1.0.0");
  });

  it("attestations surface as CycloneDX properties", () => {
    const sbom = buildAISBOM({
      tenant_id: "acme",
      components: [{
        type: "model",
        name: "claude-sonnet-4-6",
        version: "20251101",
        attestations: [
          { type: "vendor-signature", signer: "anthropic", statement: "official-release" },
          { type: "scan-clean", signer: "trivy", statement: "no-malware" },
        ],
      }],
    });
    const props = (sbom.components[0]?.properties as Array<{ name: string; value: string }>) ?? [];
    expect(props.some((p) => p.name === "pl:attestation:0" && p.value === "vendor-signature:anthropic")).toBe(true);
    expect(props.some((p) => p.name === "pl:attestation:1" && p.value === "scan-clean:trivy")).toBe(true);
  });

  it("serial number is deterministic for the same input", () => {
    const a = buildAISBOM({ tenant_id: "t", components: [{ type: "model", name: "m", version: "1" }] });
    const b = buildAISBOM({ tenant_id: "t", components: [{ type: "model", name: "m", version: "1" }] });
    expect(a.serialNumber).toBe(b.serialNumber);
  });
});
