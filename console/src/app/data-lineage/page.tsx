import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const DATASETS = [
  { id: "fraud-train",       version: "2026-Q2", files: 312, bytes: 84_400_000_000, pii: false, license: "internal", parents: 0, attest: "ready" as const },
  { id: "credit-decision",   version: "2026-Q2", files: 18,  bytes: 1_120_000_000, pii: true,  license: "internal", parents: 1, attest: "ready" as const },
  { id: "support-rag-corpus",version: "v3.4",   files: 4_120, bytes: 19_200_000_000, pii: true,  license: "CC-BY-4.0", parents: 0, attest: "pending" as const },
];

const ATTESTATIONS = [
  { dataset_id: "fraud-train",        version: "2026-Q2", manifest_hash: "01J9X8VKDS001abc", files_hash: "01J9X8VKFL002def", at: "2026-06-12 09:14" },
  { dataset_id: "credit-decision",    version: "2026-Q2", manifest_hash: "01J9X8VKDS003ghi", files_hash: "01J9X8VKFL004jkl", at: "2026-06-11 14:32" },
];

export default function DataLineagePage() {
  const totalBytes = DATASETS.reduce((n, d) => n + d.bytes, 0);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Data lineage · dataset attestation</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Signed snapshots of every dataset feeding a model. Manifest hash, Merkle file root, schema hash, and lineage hash chained into the receipt log.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Attested datasets" value={String(DATASETS.length)} delta={`${(totalBytes / 1e9).toFixed(1)} GB total`} tone="neutral" />
        <KpiTile label="PII-bearing" value={String(DATASETS.filter((d) => d.pii).length)} delta="redaction recorded" tone="warn" />
        <KpiTile label="Parent datasets" value={String(DATASETS.reduce((n, d) => n + d.parents, 0))} delta="lineage chain" tone="neutral" />
        <KpiTile label="Pending attestations" value={String(DATASETS.filter((d) => d.attest === "pending").length)} delta="awaiting hash freeze" tone="warn" />
      </section>

      <Card title="Datasets" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Attest new dataset →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Dataset</th>
              <th className="py-2 font-medium">Version</th>
              <th className="py-2 font-medium">Files</th>
              <th className="py-2 font-medium">Size</th>
              <th className="py-2 font-medium">PII</th>
              <th className="py-2 font-medium">License</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {DATASETS.map((d) => (
              <tr key={`${d.id}-${d.version}`} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{d.id}</td>
                <td className="py-3 text-xs font-mono">{d.version}</td>
                <td className="py-3">{d.files.toLocaleString()}</td>
                <td className="py-3 text-xs">{(d.bytes / 1e9).toFixed(2)} GB</td>
                <td className="py-3 text-xs">{d.pii ? "yes" : "no"}</td>
                <td className="py-3 text-xs font-mono">{d.license}</td>
                <td className="py-3"><StatusBadge status={d.attest === "ready" ? "allow" : "info"} label={d.attest} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Recent attestations">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Dataset</th>
              <th className="py-2 font-medium">Version</th>
              <th className="py-2 font-medium">Manifest hash</th>
              <th className="py-2 font-medium">Files Merkle root</th>
              <th className="py-2 font-medium">Attested at</th>
            </tr>
          </thead>
          <tbody>
            {ATTESTATIONS.map((a) => (
              <tr key={a.manifest_hash} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs">{a.dataset_id}</td>
                <td className="py-3 text-xs font-mono">{a.version}</td>
                <td className="py-3"><HashCell value={a.manifest_hash} /></td>
                <td className="py-3"><HashCell value={a.files_hash} /></td>
                <td className="py-3 font-mono text-xs">{a.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
