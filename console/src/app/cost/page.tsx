import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";

const SAVINGS = { total_mtd: 4283.45, avg_per_task: 0.07, cascade_runs: 60_812, approval_rate: 0.84 };

const RECOMMENDATIONS = [
  { id: "r-001", kind: "use_cheaper_model", use_case: "doc-summary", evidence: "92% of cascade previews on Sonnet were accepted unchanged.", monthly_savings: 1842.00, confidence: 0.85, from: "anthropic:claude-opus-4-6", to: "anthropic:claude-sonnet-4-6" },
  { id: "r-002", kind: "enable_cascade",    use_case: "contract-review", evidence: "1,420 calls hit Opus with no preview stage.", monthly_savings: 980.00, confidence: 0.65, from: "anthropic:claude-opus-4-6", to: "claude-haiku-4-5 (planner)" },
  { id: "r-003", kind: "enable_dedup_cache", use_case: "code-completion", evidence: "3/1200 calls hit dedup cache.", monthly_savings: 312.50, confidence: 0.50, from: "anthropic:claude-sonnet-4-6", to: "—" },
];

const CARBON_BY_VENDOR = [
  { vendor: "Anthropic", g_co2e: 12_840, share: 0.46 },
  { vendor: "OpenAI",    g_co2e: 9_120, share: 0.33 },
  { vendor: "Google",    g_co2e: 3_440, share: 0.12 },
  { vendor: "AWS Bedrock", g_co2e: 2_510, share: 0.09 },
];

export default function CostPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Cost discipline</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Cascade savings ledger · recommendations · carbon attribution. Every figure is auditable to a receipt id.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Cascade savings MTD" value={`$${SAVINGS.total_mtd.toLocaleString()}`} delta={`${(SAVINGS.approval_rate * 100).toFixed(0)}% approval rate`} tone="good" />
        <KpiTile label="Avg savings per task" value={`$${SAVINGS.avg_per_task.toFixed(2)}`} delta={`${SAVINGS.cascade_runs.toLocaleString()} cascade runs`} tone="good" />
        <KpiTile label="Top recommendation" value={`$${RECOMMENDATIONS[0].monthly_savings.toLocaleString()}/mo`} delta={RECOMMENDATIONS[0].use_case} tone="warn" />
        <KpiTile label="Carbon · MTD" value={`${(CARBON_BY_VENDOR.reduce((n, v) => n + v.g_co2e, 0) / 1000).toFixed(2)} kg CO₂e`} delta="vendor-attributed" tone="neutral" />
      </section>

      <Card title="Recommendations · ranked by expected monthly savings" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export to G/L →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Action</th>
              <th className="py-2 font-medium">Use case</th>
              <th className="py-2 font-medium">From → To</th>
              <th className="py-2 font-medium">Confidence</th>
              <th className="py-2 font-medium">Expected savings/mo</th>
            </tr>
          </thead>
          <tbody>
            {RECOMMENDATIONS.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs"><StatusBadge status={r.kind === "use_cheaper_model" ? "allow" : r.kind === "enable_cascade" ? "info" : "flag"} label={r.kind.replace(/_/g, " ")} /></td>
                <td className="py-3 text-xs">{r.use_case}</td>
                <td className="py-3 text-xs font-mono">{r.from} → {r.to}</td>
                <td className="py-3"><div className="flex items-center gap-2"><div className="w-20 h-1.5 rounded-full" style={{ background: "var(--pl-surface-2)" }}><div className="h-1.5 rounded-full" style={{ width: `${r.confidence * 100}%`, background: "var(--pl-status-info)" }} /></div><span className="text-xs">{(r.confidence * 100).toFixed(0)}%</span></div></td>
                <td className="py-3 font-medium">${r.monthly_savings.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Carbon attribution · MTD">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Vendor</th>
              <th className="py-2 font-medium">CO₂e (g)</th>
              <th className="py-2 font-medium">% of total</th>
            </tr>
          </thead>
          <tbody>
            {CARBON_BY_VENDOR.map((v) => (
              <tr key={v.vendor} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{v.vendor}</td>
                <td className="py-3">{v.g_co2e.toLocaleString()}</td>
                <td className="py-3 text-xs">{(v.share * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
