// Free, local, single-tenant usage & cost dashboard.
//
// Aggregates a set of signed receipts you already produced — no network, no
// account, no hosted service — into the numbers a team most wants on day one:
// how many AI calls, which models, how many tokens, and an ESTIMATED cost from
// the built-in pricing table. It also surfaces the trust signals that make
// AskLedger different from a plain usage meter: how many receipts are signed,
// the chain height, and how many carry external correctness bindings
// (evidence_refs).
//
// Honesty boundaries (kept deliberately tight so the free view never
// overclaims — see the open-core split):
//   • Cost is an ESTIMATE derived from instrumented receipts and the local
//     PRICING table. Models not in the table are counted but priced at $0 and
//     reported separately as "unpriced", never silently folded into the total.
//   • This sees ONLY the receipts you hand it. It cannot discover shadow AI or
//     join billing/identity signals — that is the hosted/enterprise tier.
//   • It is single-tenant: it summarizes whatever receipts are present and
//     lists the tenant ids it saw, but does no cross-tenant attribution.

import { priceFor, costUsd } from "./pricing.js";
import type { SignedReceipt } from "../types.js";

export interface ModelStat {
  vendor: string;
  model: string;
  key: string; // "vendor:model"
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean; // false => model absent from the PRICING table
}

export interface NamedCount {
  name: string;
  requests: number;
  costUsd: number;
}

export interface DashboardSummary {
  receipts: number; // every receipt handed in
  requests: number; // receipts that look like an AI call (have subject.ai_model)
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number; // estimate; excludes unpriced models
  pricedRequests: number;
  unpricedRequests: number;
  models: ModelStat[]; // sorted desc by cost, then requests
  apps: NamedCount[]; // by event.source_system
  environments: NamedCount[]; // by event.context.environment
  tenants: string[];
  chainHeight: number | null; // max integrity.chain_height seen
  signedReceipts: number; // receipts carrying >=1 signature
  withEvidenceRefs: number; // Layer-3 correctness bindings present
  period: { from: string | null; to: string | null };
}

function bump(map: Map<string, NamedCount>, name: string, cost: number): void {
  const cur = map.get(name) ?? { name, requests: 0, costUsd: 0 };
  cur.requests += 1;
  cur.costUsd += cost;
  map.set(name, cur);
}

/**
 * Fold a list of signed receipts into the local dashboard summary.
 * Pure and deterministic: same receipts in, same summary out.
 */
export function summarizeReceipts(receipts: SignedReceipt[]): DashboardSummary {
  const models = new Map<string, ModelStat>();
  const apps = new Map<string, NamedCount>();
  const envs = new Map<string, NamedCount>();
  const tenants = new Set<string>();

  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;
  let pricedRequests = 0;
  let unpricedRequests = 0;
  let chainHeight: number | null = null;
  let signedReceipts = 0;
  let withEvidenceRefs = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const sr of receipts) {
    const r = sr.receipt;
    if (!r) continue;

    if (r.tenant_id) tenants.add(r.tenant_id);
    if (Array.isArray(sr.signatures) && sr.signatures.length > 0) signedReceipts += 1;
    if (Array.isArray(r.evidence_refs) && r.evidence_refs.length > 0) withEvidenceRefs += 1;

    const height = r.integrity?.chain_height;
    if (typeof height === "number") {
      chainHeight = chainHeight === null ? height : Math.max(chainHeight, height);
    }

    const captured = r.event?.captured_at ?? r.issued_at;
    if (typeof captured === "string") {
      if (from === null || captured < from) from = captured;
      if (to === null || captured > to) to = captured;
    }

    const subject = r.event?.subject;
    const model = subject?.ai_model;
    // Only receipts that identify a model are counted as AI "requests".
    if (!model) continue;

    const vendor = subject?.ai_vendor ?? "unknown";
    const key = `${vendor}:${model}`;
    const payload = r.event?.payload;
    const input = payload?.input_token_count ?? 0;
    const output = payload?.output_token_count ?? 0;

    const price = priceFor(vendor, model);
    const priced = price !== null;
    const cost = price ? costUsd(price, { input, output }) : 0;

    requests += 1;
    inputTokens += input;
    outputTokens += output;
    totalCost += cost;
    if (priced) pricedRequests += 1;
    else unpricedRequests += 1;

    const ms = models.get(key) ?? {
      vendor,
      model,
      key,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      priced,
    };
    ms.requests += 1;
    ms.inputTokens += input;
    ms.outputTokens += output;
    ms.costUsd += cost;
    models.set(key, ms);

    bump(apps, r.event?.source_system || "unknown", cost);
    bump(envs, r.event?.context?.environment || "unspecified", cost);
  }

  const modelList = Array.from(models.values()).sort(
    (a, b) => b.costUsd - a.costUsd || b.requests - a.requests
  );
  const appList = Array.from(apps.values()).sort(
    (a, b) => b.costUsd - a.costUsd || b.requests - a.requests
  );
  const envList = Array.from(envs.values()).sort((a, b) => b.requests - a.requests);

  return {
    receipts: receipts.length,
    requests,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: totalCost,
    pricedRequests,
    unpricedRequests,
    models: modelList,
    apps: appList,
    environments: envList,
    tenants: Array.from(tenants).sort(),
    chainHeight,
    signedReceipts,
    withEvidenceRefs,
    period: { from, to },
  };
}

// ---------- formatting helpers (shared by CLI + HTML) ----------

export function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the summary as a self-contained HTML page (no external assets, no
 * scripts, safe to open from disk). `generatedAt` is passed in so this stays
 * pure — the CLI supplies the timestamp.
 */
export function renderDashboardHtml(
  summary: DashboardSummary,
  generatedAt: string
): string {
  const maxModelCost = summary.models.reduce((m, x) => Math.max(m, x.costUsd), 0) || 1;
  const maxAppCost = summary.apps.reduce((m, x) => Math.max(m, x.costUsd), 0) || 1;

  const modelRows = summary.models
    .map((m) => {
      const w = Math.max(2, Math.round((m.costUsd / maxModelCost) * 100));
      const tag = m.priced
        ? ""
        : ` <span class="tag">unpriced</span>`;
      return `<tr>
        <td class="nm">${esc(m.key)}${tag}</td>
        <td class="num">${m.requests.toLocaleString()}</td>
        <td class="num">${fmtTokens(m.inputTokens)}</td>
        <td class="num">${fmtTokens(m.outputTokens)}</td>
        <td class="barcell"><span class="bar"><i style="width:${w}%"></i></span></td>
        <td class="num cost">${m.priced ? fmtUsd(m.costUsd) : "—"}</td>
      </tr>`;
    })
    .join("");

  const appRows = summary.apps
    .map((a) => {
      const w = Math.max(2, Math.round((a.costUsd / maxAppCost) * 100));
      return `<tr>
        <td class="nm">${esc(a.name)}</td>
        <td class="num">${a.requests.toLocaleString()}</td>
        <td class="barcell"><span class="bar app"><i style="width:${w}%"></i></span></td>
        <td class="num cost">${fmtUsd(a.costUsd)}</td>
      </tr>`;
    })
    .join("");

  const envChips = summary.environments
    .map((e) => `<span class="chip">${esc(e.name)} · ${e.requests.toLocaleString()}</span>`)
    .join("");

  const unpricedNote =
    summary.unpricedRequests > 0
      ? `<p class="note">${summary.unpricedRequests.toLocaleString()} request(s) used a model not in the local pricing table — counted, but excluded from the cost estimate and marked <b>unpriced</b>.</p>`
      : "";

  const periodText =
    summary.period.from && summary.period.to
      ? `${esc(summary.period.from)} → ${esc(summary.period.to)}`
      : "—";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AskLedger · local usage & cost</title>
<style>
  :root{--navy:#0A1B3D;--blue:#1E6BFF;--green:#0f9d6b;--wash:#f5f7fb;--paper:#fff;--muted:#5a6b8c;--muted2:#8494b0;--line:#e6ebf3}
  *{box-sizing:border-box}
  body{margin:0;background:var(--wash);color:var(--navy);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:920px;margin:0 auto;padding:40px 24px 64px}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:6px}
  .brand{font-weight:800;letter-spacing:-.02em;font-size:15px}
  .brand b{color:var(--blue)}
  h1{font-size:26px;letter-spacing:-.02em;margin:14px 0 4px}
  .sub{color:var(--muted);font-size:14px;margin:0}
  .gen{color:var(--muted2);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0 8px}
  @media(max-width:680px){.kpis{grid-template-columns:repeat(2,1fr)}}
  .kpi{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
  .kpi .v{font-size:24px;font-weight:800;letter-spacing:-.02em}
  .kpi .l{font-size:12px;color:var(--muted);margin-top:3px}
  .kpi.cost .v{color:var(--green)}
  .card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:22px 22px;margin-top:20px}
  .card h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted2);margin:0 0 14px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:9px 8px;font-size:13.5px;border-bottom:1px solid var(--line)}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2);font-weight:700}
  tr:last-child td{border-bottom:none}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  td.nm{font-weight:600}
  td.cost{color:var(--green);font-weight:700}
  .barcell{width:26%}
  .bar{display:block;height:8px;background:var(--wash);border-radius:6px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--blue);border-radius:6px}
  .bar.app i{background:#7a5cff}
  .tag{font-size:10px;font-weight:700;color:#b06a00;background:#fff3e0;border:1px solid #ffdca8;border-radius:5px;padding:1px 5px;vertical-align:middle}
  .chip{display:inline-block;background:var(--wash);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12.5px;color:var(--navy);margin:0 8px 8px 0;font-weight:600}
  .trust{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  @media(max-width:680px){.trust{grid-template-columns:1fr}}
  .trust .t{background:var(--wash);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .trust .t .v{font-size:19px;font-weight:800}
  .trust .t .l{font-size:12px;color:var(--muted);margin-top:2px}
  .trust .t .v.ok{color:var(--green)}
  .note{font-size:12.5px;color:var(--muted);margin:14px 0 0;line-height:1.5}
  .foot{margin-top:26px;font-size:12px;color:var(--muted2);line-height:1.6}
  .foot b{color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand">Ask<b>Ledger</b> · local dashboard</div>
    <div class="gen">generated ${esc(generatedAt)}</div>
  </div>
  <h1>Your AI usage & cost</h1>
  <p class="sub">Estimated from ${summary.receipts.toLocaleString()} signed receipt(s) on this machine · period ${periodText}</p>

  <div class="kpis">
    <div class="kpi cost"><div class="v">${fmtUsd(summary.costUsd)}</div><div class="l">Estimated spend</div></div>
    <div class="kpi"><div class="v">${summary.requests.toLocaleString()}</div><div class="l">AI requests</div></div>
    <div class="kpi"><div class="v">${fmtTokens(summary.totalTokens)}</div><div class="l">Tokens</div></div>
    <div class="kpi"><div class="v">${summary.models.length.toLocaleString()}</div><div class="l">Models</div></div>
  </div>

  <div class="card">
    <h2>Spend by model</h2>
    ${
      summary.models.length
        ? `<table>
      <thead><tr><th>Model</th><th class="num">Requests</th><th class="num">Input</th><th class="num">Output</th><th></th><th class="num">Est. cost</th></tr></thead>
      <tbody>${modelRows}</tbody>
    </table>`
        : `<p class="note">No receipts identified an AI model. Add <code>event.subject.ai_vendor</code> / <code>ai_model</code> to instrument cost.</p>`
    }
    ${unpricedNote}
  </div>

  ${
    summary.apps.length
      ? `<div class="card">
    <h2>Spend by application</h2>
    <table>
      <thead><tr><th>Source system</th><th class="num">Requests</th><th></th><th class="num">Est. cost</th></tr></thead>
      <tbody>${appRows}</tbody>
    </table>
  </div>`
      : ""
  }

  ${
    envChips
      ? `<div class="card"><h2>Environments</h2>${envChips}</div>`
      : ""
  }

  <div class="card">
    <h2>Integrity</h2>
    <div class="trust">
      <div class="t"><div class="v ok">${summary.signedReceipts.toLocaleString()}/${summary.receipts.toLocaleString()}</div><div class="l">Receipts signed &amp; verifiable</div></div>
      <div class="t"><div class="v">${summary.chainHeight === null ? "—" : "#" + summary.chainHeight.toLocaleString()}</div><div class="l">Highest chain height</div></div>
      <div class="t"><div class="v">${summary.withEvidenceRefs.toLocaleString()}</div><div class="l">Carry correctness bindings</div></div>
    </div>
  </div>

  <div class="foot">
    <b>How to read this.</b> Cost is an <b>estimate</b> computed locally from your instrumented receipts and AskLedger's built-in pricing table — not a bill. It reflects only the receipts you generated on this machine; it cannot see un-instrumented (shadow) AI, and it does not join billing or identity data. Cross-system discovery, verified savings, and hosted dashboards are the enterprise tier. Every number above is backed by a signed, independently verifiable receipt.
  </div>
</div>
</body>
</html>`;
}
