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
import type { Workload } from "./ingest.js";

export interface ModelStat {
  vendor: string;
  model: string;
  key: string; // "vendor:model"
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean; // false => model absent from the PRICING table
  avgOutputTokens: number; // outputTokens / requests — a "how heavy is this workload" signal
  topApp: string | null; // source_system that used this model the most
}

export interface NamedCount {
  name: string;
  requests: number;
  costUsd: number;
}

/**
 * A single, honest cost-saving suggestion produced entirely from your local
 * receipts. This is the FREE, heuristic subset of the enterprise
 * recommendation engine: it only flags "over-tiering" — a premium model used
 * for short/simple calls that a cheaper same-vendor tier usually handles — and
 * it quantifies the opportunity with an EXACT counterfactual: what those same
 * recorded calls would have cost on `toModel`, using their actual token counts.
 *
 * It deliberately does NOT model quality, cascade acceptance, cache hit-rates,
 * or use-case fit — those need richer telemetry and are the paid tier. So every
 * suggestion is framed as "test this," never "you will save this."
 */
export interface SavingsSuggestion {
  fromModel: string; // "vendor:model" currently in use
  toModel: string; // cheaper same-vendor tier from the pricing table
  requests: number; // calls that would be affected
  shareOfSpendPct: number; // fromModel's share of total estimated spend (0..100)
  avgOutputTokens: number; // evidence the workload is light
  avgInputTokens: number; // context size — high input can mean the big model is warranted
  // "high" = short output AND modest input AND an adjacent same-family tier: a
  // low-risk swap we'll put in the headline number. "review" = worth trying but
  // the swap carries real quality risk (heavy input context, or a cross-family
  // move), so it is reported separately and NEVER counted as confident savings.
  confidence: "high" | "review";
  topApp: string | null; // where this spend mostly comes from
  currentCost: number; // what these calls cost (recorded tokens × current price)
  projectedCost: number; // what they'd cost on toModel (same tokens × cheaper price)
  estSavings: number; // currentCost - projectedCost, for this receipt set's period
  reason: string; // ready-to-render human sentence
}

export interface DashboardSummary {
  receipts: number; // every receipt handed in
  requests: number; // receipts that look like an AI call (have subject.ai_model)
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pricedTokens: number; // tokens on PRICED models only — the denominator for the blended rate
  costUsd: number; // estimate; excludes unpriced models
  pricedRequests: number;
  unpricedRequests: number;
  models: ModelStat[]; // sorted desc by cost, then requests
  apps: NamedCount[]; // by event.source_system
  environments: NamedCount[]; // by event.context.environment
  suggestions: SavingsSuggestion[]; // over-tiering opportunities (free heuristic)
  potentialSavings: number; // sum of estSavings for HIGH-confidence suggestions only (the defensible headline)
  reviewSavings: number; // sum of estSavings for "review" suggestions (real quality risk — not counted as confident)
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

// A premium model -> the cheaper same-vendor tier a light workload can usually
// move to. Only pairs where both sides are in the PRICING table are used, so
// the counterfactual cost is always real. `sameFamily` marks an adjacent tier
// of the SAME family/generation (opus->sonnet, gpt-5->gpt-5-mini) — a low-risk
// swap. A cross-family/generation move (gpt-4o->gpt-5-mini) is a bigger quality
// change, so it can only ever be surfaced as "review", never as confident.
const DOWNSHIFT: Record<string, { to: string; sameFamily: boolean }> = {
  "anthropic:claude-opus-4-6": { to: "claude-sonnet-4-6", sameFamily: true },
  "anthropic:claude-sonnet-4-6": { to: "claude-haiku-4-5", sameFamily: true },
  "openai:gpt-5": { to: "gpt-5-mini", sameFamily: true },
  "openai:gpt-4o": { to: "gpt-5-mini", sameFamily: false },
  "google:gemini-2-5-pro": { to: "gemini-2-5-flash", sameFamily: true },
};

// A workload is a downshift candidate when its average completion is short.
// Long generations are where a premium model earns its keep, so we don't nudge
// those — keep the big model's capacity for the heavy, high-value calls.
const LIGHT_OUTPUT_TOKENS = 800;

// Short output alone is NOT enough. A call that feeds a large input context
// (RAG, long documents, big system prompts) often genuinely needs the stronger
// model even when its answer is brief. Above this average input size we don't
// claim the saving with confidence — it becomes a "review" flag instead. This
// is the fix for the heuristic being "input-blind".
const LIGHT_INPUT_TOKENS = 4000;

// A (model × application) workload — the granularity at which over-tiering is
// judged. Grouping by model alone would let a few heavy calls mask a large,
// light, over-tiered workload sitting under the same model.
interface GroupStat {
  modelKey: string;
  vendor: string;
  model: string;
  app: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean;
}

/**
 * Build free over-tiering suggestions from per-(model × app) workloads.
 * Each suggestion's savings is an exact counterfactual: the same recorded
 * token volume repriced on the cheaper same-vendor tier. Sorted by savings.
 */
function buildSuggestions(groups: GroupStat[], totalCost: number): SavingsSuggestion[] {
  const out: SavingsSuggestion[] = [];
  for (const g of groups) {
    if (!g.priced) continue;
    const ds = DOWNSHIFT[g.modelKey];
    if (!ds) continue;

    const avgOut = g.requests > 0 ? Math.round(g.outputTokens / g.requests) : 0;
    const avgIn = g.requests > 0 ? Math.round(g.inputTokens / g.requests) : 0;
    // Only flag light workloads with at least a few calls and real spend.
    if (avgOut > LIGHT_OUTPUT_TOKENS) continue;
    if (g.requests < 3 || g.costUsd <= 0) continue;

    const altPrice = priceFor(g.vendor, ds.to);
    if (!altPrice) continue;
    const projectedCost = costUsd(altPrice, { input: g.inputTokens, output: g.outputTokens });
    const estSavings = g.costUsd - projectedCost;
    if (estSavings <= 0) continue;

    // Confidence: high only when the swap is genuinely low-risk — an adjacent
    // same-family tier AND the workload isn't feeding heavy context. Anything
    // else is real (the repricing is exact) but carries quality risk, so it's
    // reported for review, never folded into the headline savings number.
    const heavyContext = avgIn > LIGHT_INPUT_TOKENS;
    const confidence: "high" | "review" =
      ds.sameFamily && !heavyContext ? "high" : "review";

    const head = `${g.requests.toLocaleString()} ${g.model} call(s) in "${g.app}" averaged just ${avgOut.toLocaleString()} output tokens`;
    const money = `${ds.to} would cost ${fmtUsd(projectedCost)} vs ${fmtUsd(g.costUsd)}`;
    let reason: string;
    if (confidence === "high") {
      reason =
        `${head} — short enough that ${ds.to} usually handles them. Those same calls repriced on ${ds.to} cost ${fmtUsd(projectedCost)} vs ${fmtUsd(g.costUsd)}. Route this workload to ${ds.to} and keep ${g.model} for the heavy, high-value calls.`;
    } else if (heavyContext) {
      reason =
        `${head}, but each also feeds a large input context (avg ${avgIn.toLocaleString()} tokens) — long-context work often needs the stronger model, so review a sample before switching. If quality holds, ${money}.`;
    } else {
      reason =
        `${head}, short enough to try ${ds.to} — but this crosses model families (${g.model} → ${ds.to}), a bigger quality change, so test on a sample first. If quality holds, ${money}.`;
    }

    out.push({
      fromModel: g.modelKey,
      toModel: `${g.vendor}:${ds.to}`,
      requests: g.requests,
      shareOfSpendPct: Number(share(g.costUsd, totalCost).toFixed(1)),
      avgOutputTokens: avgOut,
      avgInputTokens: avgIn,
      confidence,
      topApp: g.app,
      currentCost: g.costUsd,
      projectedCost,
      estSavings,
      reason,
    });
  }
  // High-confidence first, then by savings within each tier.
  return out.sort((a, b) =>
    a.confidence === b.confidence
      ? b.estSavings - a.estSavings
      : a.confidence === "high"
        ? -1
        : 1
  );
}

function share(cost: number, total: number): number {
  return total > 0 ? (cost / total) * 100 : 0;
}

/**
 * Fold a list of signed receipts into the local dashboard summary.
 * Pure and deterministic: same receipts in, same summary out.
 */
export function summarizeReceipts(receipts: SignedReceipt[]): DashboardSummary {
  const models = new Map<string, ModelStat>();
  const groups = new Map<string, GroupStat>(); // "modelKey\u0000app" -> workload
  const apps = new Map<string, NamedCount>();
  const envs = new Map<string, NamedCount>();
  const tenants = new Set<string>();

  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;
  let pricedRequests = 0;
  let unpricedRequests = 0;
  let pricedInputTokens = 0;
  let pricedOutputTokens = 0;
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
    if (priced) {
      pricedRequests += 1;
      pricedInputTokens += input;
      pricedOutputTokens += output;
    } else {
      unpricedRequests += 1;
    }

    const ms = models.get(key) ?? {
      vendor,
      model,
      key,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      priced,
      avgOutputTokens: 0,
      topApp: null,
    };
    ms.requests += 1;
    ms.inputTokens += input;
    ms.outputTokens += output;
    ms.costUsd += cost;
    models.set(key, ms);

    const appName = r.event?.source_system || "unknown";
    // Over-tiering aggregation excludes governed decisions (a receipt with a
    // policy decision block, e.g. a loan approval) — there the stronger model
    // is often a considered choice, not waste. Spend/usage totals count all.
    const governed = r.decision?.decision != null;
    if (!governed) {
      const gk = `${key}\u0000${appName}`;
      const g = groups.get(gk) ?? {
        modelKey: key,
        vendor,
        model,
        app: appName,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        priced,
      };
      g.requests += 1;
      g.inputTokens += input;
      g.outputTokens += output;
      g.costUsd += cost;
      groups.set(gk, g);
    }

    bump(apps, appName, cost);
    bump(envs, r.event?.context?.environment || "unspecified", cost);
  }

  // Finalize per-model derived fields (avg output size + dominant app), read
  // off the (model × app) groups.
  const groupList = Array.from(groups.values());
  for (const [k, ms] of models) {
    ms.avgOutputTokens = ms.requests > 0 ? Math.round(ms.outputTokens / ms.requests) : 0;
    let topApp: string | null = null;
    let topReq = -1;
    for (const g of groupList) {
      if (g.modelKey === k && g.requests > topReq) {
        topReq = g.requests;
        topApp = g.app;
      }
    }
    ms.topApp = topApp;
  }

  const modelList = Array.from(models.values()).sort(
    (a, b) => b.costUsd - a.costUsd || b.requests - a.requests
  );

  const suggestions = buildSuggestions(groupList, totalCost);
  const potentialSavings = suggestions
    .filter((x) => x.confidence === "high")
    .reduce((s, x) => s + x.estSavings, 0);
  const reviewSavings = suggestions
    .filter((x) => x.confidence === "review")
    .reduce((s, x) => s + x.estSavings, 0);
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
    pricedTokens: pricedInputTokens + pricedOutputTokens,
    costUsd: totalCost,
    pricedRequests,
    unpricedRequests,
    models: modelList,
    apps: appList,
    environments: envList,
    suggestions,
    potentialSavings,
    reviewSavings,
    tenants: Array.from(tenants).sort(),
    chainHeight,
    signedReceipts,
    withEvidenceRefs,
    period: { from, to },
  };
}

/**
 * Summarize an imported bill EXACTLY from aggregated (model × app × period)
 * rows — no per-request expansion, no sampling, no scale factor. The signed
 * baseline/prove path and `scan` both use this, so their figures are exact and
 * always agree regardless of bill size (this removes the last sampling-precision
 * residual on pathological mixed bills).
 */
export function summarizeWorkloads(workloads: Workload[]): DashboardSummary {
  const models = new Map<string, ModelStat>();
  const groups = new Map<string, GroupStat>();
  const apps = new Map<string, NamedCount>();
  const envs = new Map<string, NamedCount>();

  let requests = 0, inputTokens = 0, outputTokens = 0, totalCost = 0;
  let pricedRequests = 0, unpricedRequests = 0, pricedInputTokens = 0, pricedOutputTokens = 0;
  let from: string | null = null, to: string | null = null;

  for (const w of workloads) {
    if (w.requests <= 0) continue;
    const key = `${w.vendor}:${w.model}`;
    const input = w.inputTotal;
    const output = w.outputTotal;
    const price = priceFor(w.vendor, w.model);
    const priced = price !== null;
    const cost = price ? costUsd(price, { input, output }) : 0;

    requests += w.requests;
    inputTokens += input;
    outputTokens += output;
    totalCost += cost;
    if (priced) {
      pricedRequests += w.requests;
      pricedInputTokens += input;
      pricedOutputTokens += output;
    } else {
      unpricedRequests += w.requests;
    }
    if (w.at) {
      if (from === null || w.at < from) from = w.at;
      if (to === null || w.at > to) to = w.at;
    }

    const ms = models.get(key) ?? {
      vendor: w.vendor, model: w.model, key, requests: 0, inputTokens: 0,
      outputTokens: 0, costUsd: 0, priced, avgOutputTokens: 0, topApp: null,
    };
    ms.requests += w.requests; ms.inputTokens += input; ms.outputTokens += output; ms.costUsd += cost;
    models.set(key, ms);

    const appName = w.app || "unknown";
    const gk = `${key} ${appName}`;
    const g = groups.get(gk) ?? {
      modelKey: key, vendor: w.vendor, model: w.model, app: appName,
      requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, priced,
    };
    g.requests += w.requests; g.inputTokens += input; g.outputTokens += output; g.costUsd += cost;
    groups.set(gk, g);

    const a = apps.get(appName) ?? { name: appName, requests: 0, costUsd: 0 };
    a.requests += w.requests; a.costUsd += cost; apps.set(appName, a);
    const e = envs.get("production") ?? { name: "production", requests: 0, costUsd: 0 };
    e.requests += w.requests; e.costUsd += cost; envs.set("production", e);
  }

  const groupList = Array.from(groups.values());
  for (const [k, ms] of models) {
    ms.avgOutputTokens = ms.requests > 0 ? Math.round(ms.outputTokens / ms.requests) : 0;
    let topApp: string | null = null;
    let topReq = -1;
    for (const g of groupList) {
      if (g.modelKey === k && g.requests > topReq) { topReq = g.requests; topApp = g.app; }
    }
    ms.topApp = topApp;
  }

  const modelList = Array.from(models.values()).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);
  const suggestions = buildSuggestions(groupList, totalCost);
  const potentialSavings = suggestions.filter((x) => x.confidence === "high").reduce((s, x) => s + x.estSavings, 0);
  const reviewSavings = suggestions.filter((x) => x.confidence === "review").reduce((s, x) => s + x.estSavings, 0);
  const appList = Array.from(apps.values()).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);
  const envList = Array.from(envs.values()).sort((a, b) => b.requests - a.requests);

  return {
    receipts: requests,
    requests,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    pricedTokens: pricedInputTokens + pricedOutputTokens,
    costUsd: totalCost,
    pricedRequests,
    unpricedRequests,
    models: modelList,
    apps: appList,
    environments: envList,
    suggestions,
    potentialSavings,
    reviewSavings,
    tenants: [],
    chainHeight: null,
    signedReceipts: 0,
    withEvidenceRefs: 0,
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

  const savingsCard = summary.suggestions.length
    ? `<div class="card save">
    <h2>Savings opportunities <span class="save-total">${esc(fmtUsd(summary.potentialSavings))} confident${summary.reviewSavings > 0 ? ` · +${esc(fmtUsd(summary.reviewSavings))} to review` : ""}</span></h2>
    ${summary.suggestions
      .map(
        (s) => `<div class="sug${s.confidence === "review" ? " review" : ""}">
        <div class="sug-head">
          <span class="sug-move"><b>${esc(s.fromModel)}</b> <span class="arw">→</span> <b class="to">${esc(s.toModel)}</b> <span class="conf ${s.confidence}">${s.confidence === "high" ? "confident" : "review"}</span></span>
          <span class="sug-save">save ~${esc(fmtUsd(s.estSavings))}</span>
        </div>
        <div class="sug-meta">${s.requests.toLocaleString()} calls · ${s.shareOfSpendPct}% of spend · avg ${s.avgInputTokens.toLocaleString()} in / ${s.avgOutputTokens.toLocaleString()} out tokens${s.topApp ? ` · mostly "${esc(s.topApp)}"` : ""}</div>
        <div class="sug-why">${esc(s.reason)}</div>
      </div>`
      )
      .join("")}
    <p class="note">These are <b>heuristic</b> over-tiering flags. The savings figure reprices the <em>same</em> recorded calls on the cheaper tier — exact arithmetic, but it can't judge output quality. Only <b>confident</b> flags (short output, modest input context, an adjacent same-family tier) count toward the headline number; <b>review</b> flags (heavy input context or a cross-family swap) are shown separately because they carry real quality risk — test on a sample before switching. Automated verified-savings (baseline → signed proof) is the AskLedger platform.</p>
  </div>`
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
  .card.save{border-color:#bfe6d3;background:linear-gradient(180deg,#f2fbf7,#fff)}
  .card.save h2{color:var(--green);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .save-total{font-size:12px;font-weight:700;color:#0b7d55;background:#e3f6ec;border:1px solid #bfe6d3;border-radius:999px;padding:2px 10px;text-transform:none;letter-spacing:0}
  .sug{border:1px solid var(--line);background:var(--paper);border-radius:12px;padding:14px 16px;margin-bottom:12px}
  .sug:last-of-type{margin-bottom:0}
  .sug-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .sug-move{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
  .sug-move .arw{color:var(--muted2);margin:0 4px}
  .sug-move .to{color:var(--green)}
  .sug-save{font-weight:800;color:var(--green);font-size:14px;white-space:nowrap}
  .sug.review{opacity:.92}
  .conf{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-radius:5px;padding:1px 6px;vertical-align:middle}
  .conf.high{background:rgba(15,157,107,.12);color:var(--green)}
  .conf.review{background:rgba(201,135,26,.14);color:#a9711a}
  .sug-meta{font-size:12px;color:var(--muted2);margin-top:4px}
  .sug-why{font-size:13px;color:var(--muted);margin-top:7px;line-height:1.5}
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

  ${savingsCard}

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

/**
 * Undo the uniform downsampling that `receiptsFromWorkloads` applies to a very
 * large imported bill. Every EXTENSIVE quantity (receipt/request counts, tokens,
 * dollars) scales linearly by `scale`; INTENSIVE quantities (blended rates,
 * per-request averages, spend shares) and identifiers are left untouched.
 *
 * Sampling is uniform and preserves each receipt's per-call averages, so this
 * exactly recovers full-volume totals. No-op when `scale <= 1`. This is what
 * makes `scan` and `baseline`/`prove` agree on absolute spend for big bills.
 */
export function scaleSummary(s: DashboardSummary, scale: number): DashboardSummary {
  if (!(scale > 1)) return s;
  const n = (x: number) => Math.round(x * scale); // integer counts
  const d = (x: number) => x * scale; // dollars / tokens carried as-is
  return {
    ...s,
    receipts: n(s.receipts),
    requests: n(s.requests),
    pricedRequests: n(s.pricedRequests),
    unpricedRequests: n(s.unpricedRequests),
    inputTokens: n(s.inputTokens),
    outputTokens: n(s.outputTokens),
    totalTokens: n(s.totalTokens),
    pricedTokens: n(s.pricedTokens),
    costUsd: d(s.costUsd),
    potentialSavings: d(s.potentialSavings),
    reviewSavings: d(s.reviewSavings),
    signedReceipts: n(s.signedReceipts),
    withEvidenceRefs: n(s.withEvidenceRefs),
    models: s.models.map((m) => ({
      ...m,
      requests: n(m.requests),
      inputTokens: n(m.inputTokens),
      outputTokens: n(m.outputTokens),
      costUsd: d(m.costUsd),
    })),
    apps: s.apps.map((a) => ({ ...a, requests: n(a.requests), costUsd: d(a.costUsd) })),
    environments: s.environments.map((e) => ({ ...e, requests: n(e.requests), costUsd: d(e.costUsd) })),
    suggestions: s.suggestions.map((sg) => ({
      ...sg,
      requests: n(sg.requests),
      currentCost: d(sg.currentCost),
      projectedCost: d(sg.projectedCost),
      estSavings: d(sg.estSavings),
    })),
  };
}
