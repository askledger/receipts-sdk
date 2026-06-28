import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";

const TEAM_SPEND = [
  { team: "Engineering · Core Payments", spend_mtd: 8430.22, growth: "+12%", tokens_in_M: 41.2, top_use_case: "code-completion" },
  { team: "Marketing", spend_mtd: 5210.50, growth: "+38%", tokens_in_M: 18.7, top_use_case: "content-drafting" },
  { team: "Compliance", spend_mtd: 4180.80, growth: "+5%", tokens_in_M: 14.1, top_use_case: "document-summarization" },
  { team: "Sales", spend_mtd: 3092.15, growth: "+22%", tokens_in_M: 9.8, top_use_case: "customer-comms" },
  { team: "Engineering · Data Platform", spend_mtd: 2840.00, growth: "-4%", tokens_in_M: 22.9, top_use_case: "data-explanation" },
  { team: "Legal", spend_mtd: 1190.40, growth: "+18%", tokens_in_M: 4.3, top_use_case: "contract-review" },
];

const VENDOR_SPEND = [
  { vendor: "Anthropic", spend_mtd: 12480.50, share: 0.52, unit_cost_per_1k_tokens: 0.0048 },
  { vendor: "OpenAI", spend_mtd: 7820.00, share: 0.32, unit_cost_per_1k_tokens: 0.0061 },
  { vendor: "AWS Bedrock", spend_mtd: 2540.20, share: 0.11, unit_cost_per_1k_tokens: 0.0039 },
  { vendor: "Google Vertex", spend_mtd: 1103.37, share: 0.05, unit_cost_per_1k_tokens: 0.0042 },
];

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Finance dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          AI spend per team, per vendor, per use case — with productivity correlation.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="AI spend MTD" value="$23,944" delta="+19% MoM" tone="warn" />
        <KpiTile label="MoM growth" value="+19%" delta="trending up" tone="warn" />
        <KpiTile label="Top spending team" value="Eng · Payments" delta="$8,430 MTD" tone="neutral" />
        <KpiTile label="Cost per 1k tokens · avg" value="$0.0049" delta="-8% vs Q1" tone="good" />
      </section>

      <Card title="Spend by team (MTD)" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export to G/L →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Team / Cost center</th>
              <th className="py-2 font-medium">MTD spend</th>
              <th className="py-2 font-medium">MoM growth</th>
              <th className="py-2 font-medium">Tokens consumed</th>
              <th className="py-2 font-medium">Top use case</th>
            </tr>
          </thead>
          <tbody>
            {TEAM_SPEND.map((t) => (
              <tr key={t.team} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3">{t.team}</td>
                <td className="py-3 font-medium">${t.spend_mtd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 text-xs" style={{ color: t.growth.startsWith("-") ? "var(--pl-status-allow)" : t.growth.startsWith("+0") || t.growth.startsWith("+5") || t.growth.startsWith("+1") ? "var(--pl-text-primary)" : "var(--pl-status-flag)" }}>{t.growth}</td>
                <td className="py-3 text-xs">{t.tokens_in_M.toFixed(1)}M</td>
                <td className="py-3 text-xs">{t.top_use_case}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Spend by vendor (MTD)">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Vendor</th>
              <th className="py-2 font-medium">MTD spend</th>
              <th className="py-2 font-medium">% of total</th>
              <th className="py-2 font-medium">Unit cost / 1k tokens</th>
            </tr>
          </thead>
          <tbody>
            {VENDOR_SPEND.map((v) => (
              <tr key={v.vendor} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{v.vendor}</td>
                <td className="py-3">${v.spend_mtd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 text-xs">{(v.share * 100).toFixed(0)}%</td>
                <td className="py-3 font-mono text-xs">${v.unit_cost_per_1k_tokens.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
