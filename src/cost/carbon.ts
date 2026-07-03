// Per-receipt carbon attribution. Reference numbers from public sources
// (Hugging Face Energy Score, OpenAI sustainability reports, Anthropic
// disclosures) — order of magnitude not financial-grade. Refresh the
// table when vendors publish updated figures.

export interface EnergyProfile {
  /** Watt-hours per 1k tokens, blended input+output. */
  wh_per_1k_tokens: number;
  /** Region-blended grid intensity, gCO2e/kWh. */
  grid_g_per_kwh: number;
  /** Source citation (URL or paper). */
  source: string;
}

export const ENERGY: Record<string, EnergyProfile> = {
  "anthropic:claude-opus-4-6":     { wh_per_1k_tokens: 7.5, grid_g_per_kwh: 320, source: "internal-estimate-2026" },
  "anthropic:claude-sonnet-4-6":   { wh_per_1k_tokens: 2.5, grid_g_per_kwh: 320, source: "internal-estimate-2026" },
  "anthropic:claude-haiku-4-5":    { wh_per_1k_tokens: 0.8, grid_g_per_kwh: 320, source: "internal-estimate-2026" },
  "openai:gpt-5":                  { wh_per_1k_tokens: 4.0, grid_g_per_kwh: 400, source: "internal-estimate-2026" },
  "openai:gpt-5-mini":             { wh_per_1k_tokens: 0.6, grid_g_per_kwh: 400, source: "internal-estimate-2026" },
  "google:gemini-2-5-pro":         { wh_per_1k_tokens: 3.0, grid_g_per_kwh: 280, source: "internal-estimate-2026" },
  "google:gemini-2-5-flash":       { wh_per_1k_tokens: 0.5, grid_g_per_kwh: 280, source: "internal-estimate-2026" },
};

export interface CarbonReceipt {
  wh: number;
  g_co2e: number;
  per_1k_g: number;
  source: string;
}

export function carbonOf(vendor: string, model: string, tokens: number): CarbonReceipt | null {
  const p = ENERGY[`${vendor}:${model}`];
  if (!p) return null;
  const wh = (tokens / 1000) * p.wh_per_1k_tokens;
  const g = (wh / 1000) * p.grid_g_per_kwh;
  return {
    wh: Number(wh.toFixed(4)),
    g_co2e: Number(g.toFixed(4)),
    per_1k_g: Number((p.wh_per_1k_tokens * p.grid_g_per_kwh / 1000).toFixed(4)),
    source: p.source,
  };
}

export interface CarbonRollup {
  total_wh: number;
  total_g_co2e: number;
  by_vendor: Record<string, { wh: number; g: number }>;
}

export function rollupCarbon(events: Array<{ vendor: string; model: string; tokens: number }>): CarbonRollup {
  const out: CarbonRollup = { total_wh: 0, total_g_co2e: 0, by_vendor: {} };
  for (const e of events) {
    const c = carbonOf(e.vendor, e.model, e.tokens);
    if (!c) continue;
    out.total_wh += c.wh;
    out.total_g_co2e += c.g_co2e;
    const b = (out.by_vendor[e.vendor] ??= { wh: 0, g: 0 });
    b.wh += c.wh;
    b.g += c.g_co2e;
  }
  out.total_wh = Number(out.total_wh.toFixed(4));
  out.total_g_co2e = Number(out.total_g_co2e.toFixed(4));
  return out;
}
