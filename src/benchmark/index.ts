// Public AI vendor benchmark. Aggregates per-vendor signals from
// anonymised receipts (with explicit customer opt-in only) and
// produces a ranking table that ships as a static page.

import { priceFor, costUsd } from "../cost/pricing.js";

export interface VendorSample {
  vendor: string;
  model: string;
  invocations: number;
  blocked: number;
  flagged: number;
  errors: number;
  reviewed: number;
  input_tokens: number;
  output_tokens: number;
  high_severity_findings: number;
}

export interface VendorScore {
  vendor: string;
  model: string;
  invocations: number;
  hallucination_proxy: number;         // 0..1; lower better
  cost_per_outcome_usd: number;         // total cost / successful outcomes
  compliance_posture: number;           // 0..1; higher better
  supply_chain_risk: number;            // 0..1; lower better
  composite: number;                    // 0..100; lower is better
}

export interface BenchmarkReport {
  schema_version: "1.0";
  generated_at: string;
  methodology_url: string;
  sample_size: number;
  by_vendor: VendorScore[];
  rankings: { hallucination: string[]; cost_per_outcome: string[]; compliance_posture: string[]; supply_chain: string[] };
}

export function score(samples: VendorSample[]): BenchmarkReport {
  const totalInvocations = samples.reduce((n, s) => n + s.invocations, 0);

  const by_vendor = samples.map((s) => {
    const successful = Math.max(1, s.invocations - s.errors - s.blocked);
    const price = priceFor(s.vendor, s.model);
    const usd = price ? costUsd(price, { input: s.input_tokens, output: s.output_tokens }) : 0;
    const hallucination_proxy = s.invocations === 0 ? 0 : round((s.flagged + s.errors) / s.invocations);
    const cost_per_outcome = round(usd / successful);
    const compliance_posture = s.invocations === 0 ? 0 : round(s.reviewed / s.invocations);
    const supply_chain_risk = round(Math.min(1, s.high_severity_findings / 10));
    const composite = round(
      hallucination_proxy * 40 +
      Math.min(1, cost_per_outcome * 1000) * 20 +
      (1 - compliance_posture) * 20 +
      supply_chain_risk * 20,
    );
    return {
      vendor: s.vendor,
      model: s.model,
      invocations: s.invocations,
      hallucination_proxy,
      cost_per_outcome_usd: cost_per_outcome,
      compliance_posture,
      supply_chain_risk,
      composite,
    };
  });

  const key = (v: VendorScore) => `${v.vendor}:${v.model}`;
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    methodology_url: "https://github.com/askledger/receipts-sdk/tree/main/spec/benchmark/methodology.md",
    sample_size: totalInvocations,
    by_vendor,
    rankings: {
      hallucination:    [...by_vendor].sort((a, b) => a.hallucination_proxy - b.hallucination_proxy).map(key),
      cost_per_outcome: [...by_vendor].sort((a, b) => a.cost_per_outcome_usd - b.cost_per_outcome_usd).map(key),
      compliance_posture: [...by_vendor].sort((a, b) => b.compliance_posture - a.compliance_posture).map(key),
      supply_chain:     [...by_vendor].sort((a, b) => a.supply_chain_risk - b.supply_chain_risk).map(key),
    },
  };
}

export function renderHTML(b: BenchmarkReport): string {
  const rows = b.by_vendor
    .slice()
    .sort((a, b) => a.composite - b.composite)
    .map((v) => `<tr>
      <td>${escape(v.vendor)}</td><td>${escape(v.model)}</td>
      <td class="r">${v.invocations.toLocaleString()}</td>
      <td class="r">${(v.hallucination_proxy * 100).toFixed(2)}%</td>
      <td class="r">$${v.cost_per_outcome_usd.toFixed(5)}</td>
      <td class="r">${(v.compliance_posture * 100).toFixed(1)}%</td>
      <td class="r">${(v.supply_chain_risk * 100).toFixed(1)}%</td>
      <td class="r"><strong>${v.composite}</strong></td>
    </tr>`)
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>AskLedger · Quarterly AI Vendor Benchmark</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font:14px/1.5 ui-sans-serif,system-ui,sans-serif;margin:60px auto;max-width:960px;padding:0 16px;color:#0b1c2c}
  h1{margin-bottom:4px} p.lede{color:#475569;margin-top:0}
  table{border-collapse:collapse;width:100%;margin-top:24px}
  th,td{padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:left}
  th{background:#f8fafc;font-weight:600;color:#0f172a}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  footer{margin-top:40px;color:#64748b;font-size:12px}
  code{background:#f1f5f9;padding:1px 6px;border-radius:4px}
</style></head><body>
<h1>AskLedger · Quarterly AI Vendor Benchmark</h1>
<p class="lede">Composite scoring derived from ${b.sample_size.toLocaleString()} anonymised receipts. Methodology: <a href="${b.methodology_url}">methodology.md</a>.</p>
<table><thead><tr>
  <th>Vendor</th><th>Model</th><th class="r">Invocations</th>
  <th class="r">Hallucination proxy</th><th class="r">Cost/outcome</th>
  <th class="r">Compliance posture</th><th class="r">Supply-chain risk</th>
  <th class="r">Composite</th>
</tr></thead><tbody>${rows}</tbody></table>
<footer>Composite score (0–100, lower is better). Generated ${b.generated_at}. <code>schema_version=${b.schema_version}</code>.</footer>
</body></html>`;
}

function escape(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c] ?? c)); }
function round(n: number): number { return Math.round(n * 10000) / 10000; }
