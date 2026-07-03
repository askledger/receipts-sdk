import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

const PACKS = [
  { id: "evp-2026-q2-cbuae", title: "Q2 2026 · CBUAE Inspection Pack", count: 138_247, builtBy: "jordan.lee@acme-bank", builtAt: "2026-06-05 14:22", status: "allow" as const, label: "delivered" },
  { id: "evp-2026-may-audit", title: "May 2026 · Internal Audit", count: 41_902, builtBy: "audit@acme-bank", builtAt: "2026-06-01 09:11", status: "allow" as const, label: "delivered" },
  { id: "evp-2026-q3-sama", title: "Q3 2026 · SAMA submission (draft)", count: 87_154, builtBy: "jordan.lee@acme-bank", builtAt: "2026-06-09 17:50", status: "pending" as const, label: "review" },
];

export default function EvidencePage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evidence Packs</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
            Regulator-ready bundles. Each pack is a self-verifying tarball with receipts, Merkle root, TSA tokens, and public keys.
          </p>
        </div>
        <button className="px-3 py-2 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
          New evidence pack
        </button>
      </header>

      <Card>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Pack ID</th>
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Receipts</th>
              <th className="py-2 font-medium">Built by</th>
              <th className="py-2 font-medium">Built at</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {PACKS.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-mono text-xs">{p.id}</td>
                <td className="py-3">{p.title}</td>
                <td className="py-3">{p.count.toLocaleString()}</td>
                <td className="py-3 text-xs">{p.builtBy}</td>
                <td className="py-3 text-xs">{p.builtAt}</td>
                <td className="py-3"><StatusBadge status={p.status} label={p.label} /></td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Verify</button>
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Download</button>
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Share link</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Build a new pack" action={<span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>Runs locally in your browser using the SDK</span>}>
        <ol className="text-sm space-y-3" style={{ color: "var(--pl-text-primary)" }}>
          <li>1. Pick the tenant and time period</li>
          <li>2. Apply filters (vendor, model, classification, decision)</li>
          <li>3. Preview the selection (count + sample receipts)</li>
          <li>4. Name the pack and state its purpose</li>
          <li>5. Build → SDK constructs Merkle batch + integrity hash → tarball download</li>
          <li>6. Share the verifier link with the recipient (regulator, auditor, customer)</li>
        </ol>
      </Card>
    </div>
  );
}
