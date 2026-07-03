import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";

const MODELS = [
  { id: "anthropic:claude-sonnet-4-6:20251101", invocations: 41_280, block_rate: 0.012, flag_rate: 0.034, error_rate: 0.008, use_cases: ["credit-decline","fraud-review","kyc-summary"] },
  { id: "openai:gpt-5",                          invocations: 18_730, block_rate: 0.021, flag_rate: 0.041, error_rate: 0.012, use_cases: ["customer-comms","sanction-screen"] },
  { id: "anthropic:claude-haiku-4-5",            invocations: 92_140, block_rate: 0.005, flag_rate: 0.014, error_rate: 0.004, use_cases: ["code-completion","doc-summary"] },
];

const FINDINGS = [
  { severity: "high" as const, title: "Elevated error rate on openai:gpt-5", detail: "Error rate 1.20% exceeds 5% threshold proxy on customer-comms over 18,730 invocations.", evidence: 14 },
  { severity: "medium" as const, title: "Flag rate trending up · anthropic:claude-sonnet-4-6", detail: "Flag rate 3.40% over 41,280 invocations; review applied_policies for tuning.", evidence: 8 },
];

export default function MRMPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">MRM workpaper</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          SR 11-7 / OSFI E-23 / PRA SS1/23 / EU AI Act Annex IV validation workpaper, derived live from the receipt chain. Every figure is auditable to a receipt id.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Models in production" value={MODELS.length.toString()} delta="3 vendors · 5 use cases" tone="neutral" />
        <KpiTile label="Total invocations (Q)" value={MODELS.reduce((n, m) => n + m.invocations, 0).toLocaleString()} delta="receipt-attested" tone="good" />
        <KpiTile label="Policy coverage" value="100%" delta="every receipt cites policy_bundle_hash" tone="good" />
        <KpiTile label="Findings open" value={FINDINGS.length.toString()} delta="1 high · 1 medium" tone="warn" />
      </section>

      <Card title="Model inventory" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export workpaper (Markdown) →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Model</th>
              <th className="py-2 font-medium">Invocations</th>
              <th className="py-2 font-medium">Block</th>
              <th className="py-2 font-medium">Flag</th>
              <th className="py-2 font-medium">Error</th>
              <th className="py-2 font-medium">Use cases</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs font-mono">{m.id}</td>
                <td className="py-3">{m.invocations.toLocaleString()}</td>
                <td className="py-3 text-xs">{(m.block_rate * 100).toFixed(2)}%</td>
                <td className="py-3 text-xs">{(m.flag_rate * 100).toFixed(2)}%</td>
                <td className="py-3 text-xs">{(m.error_rate * 100).toFixed(2)}%</td>
                <td className="py-3 text-xs">{m.use_cases.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Findings · requires action">
        <ul className="divide-y" style={{ borderColor: "var(--pl-border)" }}>
          {FINDINGS.map((f, i) => (
            <li key={i} className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--pl-text-secondary)" }}>{f.detail}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>{f.evidence} receipts</span>
                <StatusBadge status={f.severity === "high" ? "block" : "flag"} label={f.severity} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Citations · regulator coverage">
        <ul className="text-sm space-y-2">
          <li><b>SR 11-7 / OCC 2011-12</b> · §IV Risk Mgmt Framework · §V Development · §VI Implementation · §VII Validation · §VIII Governance</li>
          <li><b>OSFI E-23</b> · Principles 1 Identification, 2 Risk Assessment, 4 Validation, 6 Monitoring</li>
          <li><b>PRA SS1/23</b> · Principles 1 Model Definition, 2 Governance, 3 RMF, 4 Validation</li>
          <li><b>EU AI Act Annex IV</b> · (1) Description, (2) Design specs, (3) Architecture, (5) Risk mgmt, (7) Validation</li>
        </ul>
      </Card>
    </div>
  );
}
