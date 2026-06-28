import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";

const SCORES = [
  { vendor: "anthropic", model: "claude-sonnet-4-6", invocations: 92140, hallucination: 0.014, cost_per_outcome: 0.00032, compliance: 0.97, supply: 0.00, composite: 12.4 },
  { vendor: "google",    model: "gemini-2-5-pro",   invocations: 18430, hallucination: 0.017, cost_per_outcome: 0.00041, compliance: 0.94, supply: 0.10, composite: 16.8 },
  { vendor: "anthropic", model: "claude-opus-4-6",  invocations: 8240,  hallucination: 0.018, cost_per_outcome: 0.00132, compliance: 0.98, supply: 0.00, composite: 19.2 },
  { vendor: "openai",    model: "gpt-5",            invocations: 41730, hallucination: 0.034, cost_per_outcome: 0.00061, compliance: 0.86, supply: 0.10, composite: 28.5 },
  { vendor: "anthropic", model: "claude-haiku-4-5", invocations: 142810,hallucination: 0.012, cost_per_outcome: 0.00018, compliance: 0.95, supply: 0.00, composite: 9.8 },
];

export default function BenchmarkPage() {
  const sorted = SCORES.slice().sort((a, b) => a.composite - b.composite);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">AI vendor benchmark · 2026-Q2</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Composite scoring derived from {SCORES.reduce((n, s) => n + s.invocations, 0).toLocaleString()} anonymised receipts. Methodology open at <span style={{ color: "var(--pl-status-info)" }}>spec.projectledger.io/benchmark</span>.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Best composite" value={`${sorted[0].vendor}/${sorted[0].model}`} delta={`score ${sorted[0].composite}`} tone="good" />
        <KpiTile label="Lowest cost/outcome" value={`$${sorted[0].cost_per_outcome.toFixed(5)}`} delta="per successful outcome" tone="good" />
        <KpiTile label="Worst composite" value={`${sorted[sorted.length-1].vendor}/${sorted[sorted.length-1].model}`} delta={`score ${sorted[sorted.length-1].composite}`} tone="warn" />
        <KpiTile label="Sample size" value={SCORES.reduce((n, s) => n + s.invocations, 0).toLocaleString()} delta="anonymised · consented" tone="neutral" />
      </section>

      <Card title="Vendor scoring" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export HTML report →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Vendor / model</th>
              <th className="py-2 font-medium">Invocations</th>
              <th className="py-2 font-medium">Hallucination proxy</th>
              <th className="py-2 font-medium">Cost / outcome</th>
              <th className="py-2 font-medium">Compliance posture</th>
              <th className="py-2 font-medium">Supply-chain risk</th>
              <th className="py-2 font-medium">Composite</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={`${s.vendor}-${s.model}`} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs font-mono">{s.vendor} / {s.model}</td>
                <td className="py-3">{s.invocations.toLocaleString()}</td>
                <td className="py-3 text-xs">{(s.hallucination * 100).toFixed(2)}%</td>
                <td className="py-3 font-mono text-xs">${s.cost_per_outcome.toFixed(5)}</td>
                <td className="py-3 text-xs">{(s.compliance * 100).toFixed(1)}%</td>
                <td className="py-3 text-xs">{(s.supply * 100).toFixed(1)}%</td>
                <td className="py-3 font-medium">{s.composite}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
