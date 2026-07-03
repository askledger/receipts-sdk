import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const KEYS = [
  { kid: "kms-prod-2026Q3", status: "active" as const, source: "AWS KMS · kms-fips · us-east-1", created: "2026-04-12", lastUsed: "just now", fips: true, pub: "9c4a2b7e08d31f5e9a6c1b73...d40e7b" },
  { kid: "kms-prod-2026Q2", status: "retired" as const, source: "AWS KMS · kms-fips · us-east-1", created: "2026-01-14", lastUsed: "12 days ago", fips: true, pub: "1d8f3c2a9b07e64f5d3a8c12...0a5e91" },
  { kid: "akv-staging-2026", status: "active" as const, source: "Azure Key Vault (Managed HSM) · UK South", created: "2026-03-08", lastUsed: "37 minutes ago", fips: true, pub: "32d8e1f0b95c47ad6e2f9b18...4c8e30" },
  { kid: "kms-dev-2026Q1", status: "revoked" as const, source: "AWS KMS · us-east-1", created: "2026-01-02", lastUsed: "78 days ago", fips: false, pub: "5e1a8b3f6c20d97e4a8b1c70...d2f001" },
];

const statusToBadge = {
  active: "allow",
  retired: "info",
  revoked: "revoked",
} as const;

export default function KeysPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Keys</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
            Manage every signing key — active, retired, and revoked.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-3 py-2 rounded text-sm border" style={{ borderColor: "var(--pl-border)" }}>
            Import public key
          </button>
          <button className="px-3 py-2 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
            Rotate signing key
          </button>
        </div>
      </header>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
                <th className="py-2 font-medium">Kid</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">FIPS</th>
                <th className="py-2 font-medium">Created</th>
                <th className="py-2 font-medium">Last used</th>
                <th className="py-2 font-medium">Public key</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {KEYS.map((k) => (
                <tr key={k.kid} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                  <td className="py-3 font-mono text-xs">{k.kid}</td>
                  <td className="py-3"><StatusBadge status={statusToBadge[k.status]} label={k.status} /></td>
                  <td className="py-3 text-xs">{k.source}</td>
                  <td className="py-3">{k.fips ? <StatusBadge status="allow" label="FIPS" /> : <StatusBadge status="flag" label="non-FIPS" />}</td>
                  <td className="py-3 text-xs">{k.created}</td>
                  <td className="py-3 text-xs">{k.lastUsed}</td>
                  <td className="py-3"><HashCell value={k.pub} /></td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {k.status === "active" && (
                        <>
                          <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Rotate</button>
                          <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Retire</button>
                          <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)", color: "var(--pl-status-block)" }}>Revoke</button>
                        </>
                      )}
                      {k.status === "retired" && <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>archive only</span>}
                      {k.status === "revoked" && <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>locked</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Key transition log">
        <ul className="text-sm divide-y" style={{ borderColor: "var(--pl-border)" }}>
          <li className="py-3"><span className="font-mono text-xs">2026-06-09 18:31 UTC</span> · kms-prod-2026Q3 → active · approved by 2/2 (alice, bob) · signed by platform key</li>
          <li className="py-3"><span className="font-mono text-xs">2026-05-28 14:02 UTC</span> · kms-prod-2026Q2 → retired · approved by 2/2 (alice, carol) · signed by platform key</li>
          <li className="py-3"><span className="font-mono text-xs">2026-03-23 09:11 UTC</span> · kms-dev-2026Q1 → revoked · reason: incidental exposure on a build runner</li>
        </ul>
      </Card>
    </div>
  );
}
