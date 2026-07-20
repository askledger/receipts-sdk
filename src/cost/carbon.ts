// Per-receipt carbon attribution. Reference numbers from public sources
// (Hugging Face Energy Score, OpenAI sustainability reports, Anthropic
// disclosures), order of magnitude not financial-grade. Refresh the
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

// Unrounded per-event figures. `carbonOf` rounds for display; anything that
// AGGREGATES must use these, never the rounded receipt.
function rawCarbon(vendor: string, model: string, tokens: number): { wh: number; g: number } | null {
  const p = ENERGY[`${vendor}:${model}`];
  if (!p) return null;
  const wh = (tokens / 1000) * p.wh_per_1k_tokens;
  return { wh, g: (wh / 1000) * p.grid_g_per_kwh };
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

// Sum the RAW per-event figures and round once at the end.
//
// Rounding each event to 4dp before adding is one-directional whenever the
// per-event value is small relative to 1e-4, and it compounds: 1,000,000
// single-token events on gpt-5 reported total_g_co2e = 300 against a true 256,
// an inflation of 17.2%. A sustainability figure that only ever moves upward
// with the event count is not a measurement.
export function rollupCarbon(events: Array<{ vendor: string; model: string; tokens: number }>): CarbonRollup {
  let totalWh = 0;
  let totalG = 0;
  const raw: Record<string, { wh: number; g: number }> = {};
  for (const e of events) {
    const c = rawCarbon(e.vendor, e.model, e.tokens);
    if (!c) continue;
    totalWh += c.wh;
    totalG += c.g;
    const b = (raw[e.vendor] ??= { wh: 0, g: 0 });
    b.wh += c.wh;
    b.g += c.g;
  }
  const by_vendor: CarbonRollup["by_vendor"] = {};
  for (const [vendor, b] of Object.entries(raw)) {
    by_vendor[vendor] = { wh: Number(b.wh.toFixed(4)), g: Number(b.g.toFixed(4)) };
  }
  return {
    total_wh: Number(totalWh.toFixed(4)),
    total_g_co2e: Number(totalG.toFixed(4)),
    by_vendor,
  };
}
