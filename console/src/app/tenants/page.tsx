import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

const TENANTS = [
  { id: "acme-bank", plan: "Enterprise · BFSI", region: "EU + MENA", receipts: "12.4M", state: "allow" as const, label: "active" },
  { id: "acme-bank-staging", plan: "Enterprise · BFSI", region: "EU", receipts: "412K", state: "allow" as const, label: "active" },
  { id: "demo-co", plan: "Growth", region: "US", receipts: "8.2K", state: "info" as const, label: "trial" },
  { id: "legacy-tenant", plan: "Enterprise · BFSI", region: "MENA", receipts: "—", state: "flag" as const, label: "suspended" },
];

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
            Provisioning, plan, region, and lifecycle.
          </p>
        </div>
        <button className="px-3 py-2 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>Provision tenant</button>
      </header>

      <Card>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Tenant ID</th>
              <th className="py-2 font-medium">Plan</th>
              <th className="py-2 font-medium">Region</th>
              <th className="py-2 font-medium">Receipts (30d)</th>
              <th className="py-2 font-medium">State</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {TENANTS.map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-mono text-xs">{t.id}</td>
                <td className="py-3">{t.plan}</td>
                <td className="py-3">{t.region}</td>
                <td className="py-3">{t.receipts}</td>
                <td className="py-3"><StatusBadge status={t.state} label={t.label} /></td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Open</button>
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Plan</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
