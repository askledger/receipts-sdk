import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const COVERAGE = [
  { regulator: "CBUAE", articles_satisfied: 6, articles_total: 6, confidence: 0.94, deadline: "Sep 16, 2026", status: "allow" as const, label: "ready" },
  { regulator: "EU AI Act", articles_satisfied: 7, articles_total: 8, confidence: 0.91, deadline: "Aug 2, 2026", status: "allow" as const, label: "ready" },
  { regulator: "SAMA", articles_satisfied: 4, articles_total: 5, confidence: 0.87, deadline: "ongoing", status: "info" as const, label: "monitoring" },
  { regulator: "ISO 42001", articles_satisfied: 5, articles_total: 6, confidence: 0.83, deadline: "voluntary", status: "info" as const, label: "monitoring" },
  { regulator: "NIST AI RMF", articles_satisfied: 5, articles_total: 5, confidence: 0.96, deadline: "voluntary", status: "allow" as const, label: "ready" },
  { regulator: "GDPR", articles_satisfied: 6, articles_total: 7, confidence: 0.88, deadline: "ongoing", status: "info" as const, label: "monitoring" },
  { regulator: "HIPAA", articles_satisfied: 0, articles_total: 7, confidence: 0, deadline: "n/a", status: "flag" as const, label: "not applicable" },
  { regulator: "FedRAMP", articles_satisfied: 0, articles_total: 8, confidence: 0, deadline: "n/a", status: "flag" as const, label: "not applicable" },
];

const GAPS = [
  { id: "g-001", regulator: "EU AI Act", article: "ART50", gap: "Generative AI Transparency · 12 receipts missing output_hash field", count: 12, severity: "medium" as const },
  { id: "g-002", regulator: "SAMA", article: "T2", gap: "Saudi Data Residency · 3 receipts missing region tag", count: 3, severity: "high" as const },
  { id: "g-003", regulator: "GDPR", article: "ART22", gap: "Automated Decisions · 1 receipt has block decision without reason_codes", count: 1, severity: "high" as const },
];

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Compliance dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          What your AI traffic satisfies, what is incomplete, and whether your inspection pack is ready today.
        </p>
      </header>

      <section aria-label="KPI summary" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="CBUAE coverage" value="94%" delta="6/6 articles · ready" tone="good" />
        <KpiTile label="EU AI Act coverage" value="91%" delta="7/8 articles" tone="good" />
        <KpiTile label="GDPR coverage" value="88%" delta="6/7 articles" tone="good" />
        <KpiTile label="Open gaps" value="3" delta="1 high · 1 medium" tone="warn" />
      </section>

      <Card title="Regulator coverage" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export evidence pack →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Regulator</th>
              <th className="py-2 font-medium">Articles</th>
              <th className="py-2 font-medium">Confidence</th>
              <th className="py-2 font-medium">Deadline</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map((c) => (
              <tr key={c.regulator} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{c.regulator}</td>
                <td className="py-3">{c.articles_satisfied}/{c.articles_total}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full" style={{ background: "var(--pl-surface-2)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${c.confidence * 100}%`, background: c.confidence >= 0.85 ? "var(--pl-status-allow)" : "var(--pl-status-flag)" }} />
                    </div>
                    <span className="text-xs">{(c.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="py-3 text-xs">{c.deadline}</td>
                <td className="py-3"><StatusBadge status={c.status} label={c.label} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Open gaps · requires action">
        <ul className="divide-y" style={{ borderColor: "var(--pl-border)" }}>
          {GAPS.map((g) => (
            <li key={g.id} className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{g.regulator} · {g.article}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--pl-text-secondary)" }}>{g.gap}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>{g.count} receipts</span>
                <StatusBadge status={g.severity === "high" ? "block" : "flag"} label={g.severity} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
