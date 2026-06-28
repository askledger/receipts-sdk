import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const RECENT = [
  { id: "01J9X8...", at: "10:42:11", evt: "gateway.request", model: "claude-sonnet-4-6", status: "allow", hash: "a73f2ce5d0c0b1d9...8b3c1e" },
  { id: "01J9X8...", at: "10:42:09", evt: "agent.tool_call", model: "claude-sonnet-4-6", status: "allow", hash: "f1ae3b7c0e4d2a91...c2b401" },
  { id: "01J9X8...", at: "10:41:58", evt: "gateway.request", model: "gpt-5", status: "block", hash: "92cd1a0b8e3f6d72...004e5e" },
  { id: "01J9X8...", at: "10:41:51", evt: "ide.completion", model: "claude-sonnet-4-6", status: "allow", hash: "55b9c2f1e8a07d34...1ed09a" },
];

const APPROVALS = [
  { id: "approval-001", at: "10:32", requested: "Rotate signing key (kms-prod-2026Q3)", state: "pending" as const, approvers: "1/2" },
  { id: "approval-002", at: "09:58", requested: "Export Q3 evidence pack to CBUAE", state: "pending" as const, approvers: "0/2" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Trust posture overview · acme-bank · production
        </p>
      </header>

      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <KpiTile label="Receipts signed today" value="12,487" delta="+8.3% vs yesterday" tone="good" />
        <KpiTile label="Policy blocks today" value="312" delta="+12 vs yesterday" tone="warn" />
        <KpiTile label="Chain breaks (24h)" value="0" delta="streak 41 days" tone="good" />
        <KpiTile label="Pending approvals" value="2" delta="2 awaiting you" tone="warn" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Recent receipts" action={<a href="/receipts" className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>View all →</a>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
                    <th className="py-2 font-medium">Time</th>
                    <th className="py-2 font-medium">Event</th>
                    <th className="py-2 font-medium">Model</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">receipt_hash</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                      <td className="py-2.5 font-mono text-xs">{r.at}</td>
                      <td className="py-2.5">{r.evt}</td>
                      <td className="py-2.5">{r.model}</td>
                      <td className="py-2.5"><StatusBadge status={r.status as "allow" | "block"} /></td>
                      <td className="py-2.5"><HashCell value={r.hash} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Pending approvals">
            <ul className="divide-y" style={{ borderColor: "var(--pl-border)" }}>
              {APPROVALS.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{a.requested}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--pl-text-secondary)" }}>
                      {a.id} · requested at {a.at} · approvers {a.approvers}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status="pending" />
                    <button className="text-sm font-medium px-3 py-1.5 rounded" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
                      Review
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Key health">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span><span className="font-mono text-xs">kms-prod-2026Q3</span><span className="ml-2 text-xs" style={{ color: "var(--pl-text-secondary)" }}>active · 23 days</span></span>
                <StatusBadge status="allow" label="active" />
              </li>
              <li className="flex items-center justify-between">
                <span><span className="font-mono text-xs">kms-prod-2026Q2</span><span className="ml-2 text-xs" style={{ color: "var(--pl-text-secondary)" }}>retired · 12d ago</span></span>
                <StatusBadge status="info" label="retired" />
              </li>
              <li className="flex items-center justify-between">
                <span><span className="font-mono text-xs">kms-dev-2026Q1</span><span className="ml-2 text-xs" style={{ color: "var(--pl-text-secondary)" }}>revoked · 78d ago</span></span>
                <StatusBadge status="revoked" />
              </li>
            </ul>
          </Card>

          <Card title="System posture">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>FIPS mode</span><StatusBadge status="allow" label="enforced" /></li>
              <li className="flex justify-between"><span>HSM</span><span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>AWS KMS · kms-fips</span></li>
              <li className="flex justify-between"><span>TSA</span><span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>DigiCert TSA</span></li>
              <li className="flex justify-between"><span>Transparency log</span><span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>Sigstore Rekor</span></li>
              <li className="flex justify-between"><span>Postgres RLS</span><StatusBadge status="allow" label="active" /></li>
              <li className="flex justify-between"><span>SPIRE SVIDs</span><StatusBadge status="allow" label="rotating" /></li>
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}
