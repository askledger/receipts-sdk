import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const HOLDS = [
  { id: "hold-2026-001", matter: "Customer Wire Dispute · Al-Mansoori Holdings", custodians: 4, scope: "All AI events 2026-04-01 to present", status: "info" as const, label: "active" },
  { id: "hold-2026-002", matter: "Regulator inquiry · CBUAE Q2 2026", custodians: 12, scope: "Risk + AML AI decisions Q2 2026", status: "info" as const, label: "active" },
];

const RECENT_GDPR22 = [
  { rid: "01J9X8VK0001", time: "10:14", subject: "credit-decline · German resident", model: "claude-sonnet-4-6", reviewed_by: "marta.h@acme-bank.de", status: "allow" as const },
  { rid: "01J9X8VK0002", time: "09:58", subject: "fraud-flag · French resident", model: "gpt-5", reviewed_by: "pending", status: "pending" as const },
];

export default function LegalPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Legal dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Disclosure-ready records, litigation holds, GDPR Article 22 events, and chain integrity for evidence purposes.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Customer-facing AI decisions (30d)" value="4,128" delta="" tone="neutral" />
        <KpiTile label="GDPR Art. 22 events (30d)" value="187" delta="183 reviewed · 4 pending" tone="warn" />
        <KpiTile label="Active litigation holds" value="2" delta="16 custodians scope" tone="neutral" />
        <KpiTile label="Chain integrity" value="100%" delta="0 verification failures" tone="good" />
      </section>

      <Card title="GDPR Article 22 · automated decisions requiring human-review evidence" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Generate Article 22 evidence pack →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Receipt ID</th>
              <th className="py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Subject of decision</th>
              <th className="py-2 font-medium">Model</th>
              <th className="py-2 font-medium">Reviewed by</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_GDPR22.map((r) => (
              <tr key={r.rid} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3"><HashCell value={r.rid} /></td>
                <td className="py-3 font-mono text-xs">{r.time}</td>
                <td className="py-3 text-xs">{r.subject}</td>
                <td className="py-3 font-mono text-xs">{r.model}</td>
                <td className="py-3 text-xs">{r.reviewed_by}</td>
                <td className="py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Active litigation holds">
        <ul className="divide-y" style={{ borderColor: "var(--pl-border)" }}>
          {HOLDS.map((h) => (
            <li key={h.id} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{h.matter}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--pl-text-secondary)" }}>
                    {h.id} · {h.custodians} custodians · {h.scope}
                  </div>
                </div>
                <StatusBadge status={h.status} label={h.label} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Chain integrity (last 30 days)">
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div><div className="text-2xl font-bold">8,294,112</div><div className="text-xs mt-1" style={{ color: "var(--pl-text-secondary)" }}>Receipts in scope</div></div>
          <div><div className="text-2xl font-bold" style={{ color: "var(--pl-status-allow)" }}>100%</div><div className="text-xs mt-1" style={{ color: "var(--pl-text-secondary)" }}>Chain links verify</div></div>
          <div><div className="text-2xl font-bold">0</div><div className="text-xs mt-1" style={{ color: "var(--pl-text-secondary)" }}>Tamper events detected</div></div>
        </div>
      </Card>
    </div>
  );
}
