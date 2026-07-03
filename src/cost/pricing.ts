// Vendor pricing table. Single source of truth; refresh quarterly.
// All values are USD per 1k tokens. Tiered pricing handled by the
// caller (e.g. AWS Bedrock provisioned-throughput discount).

export interface VendorPricing {
  input_per_1k: number;
  output_per_1k: number;
  cache_read_per_1k?: number;
  cache_write_per_1k?: number;
}

export type ModelKey = `${string}:${string}`;

export const PRICING: Record<ModelKey, VendorPricing> = {
  // Anthropic
  "anthropic:claude-opus-4-6":     { input_per_1k: 0.015,   output_per_1k: 0.075,   cache_read_per_1k: 0.0015, cache_write_per_1k: 0.01875 },
  "anthropic:claude-sonnet-4-6":   { input_per_1k: 0.003,   output_per_1k: 0.015,   cache_read_per_1k: 0.0003,  cache_write_per_1k: 0.00375 },
  "anthropic:claude-haiku-4-5":    { input_per_1k: 0.001,   output_per_1k: 0.005,   cache_read_per_1k: 0.0001,  cache_write_per_1k: 0.00125 },
  // OpenAI
  "openai:gpt-5":                  { input_per_1k: 0.005,   output_per_1k: 0.015 },
  "openai:gpt-5-mini":             { input_per_1k: 0.00025, output_per_1k: 0.001 },
  "openai:gpt-4o":                 { input_per_1k: 0.0025,  output_per_1k: 0.01 },
  // Google
  "google:gemini-2-5-pro":         { input_per_1k: 0.00125, output_per_1k: 0.01 },
  "google:gemini-2-5-flash":       { input_per_1k: 0.000075,output_per_1k: 0.0003 },
  // AWS Bedrock (passthrough of vendor list price)
  "aws-bedrock:claude-sonnet-4-6": { input_per_1k: 0.003,   output_per_1k: 0.015 },
};

export function priceFor(vendor: string, model: string): VendorPricing | null {
  return PRICING[`${vendor}:${model}` as ModelKey] ?? null;
}

export interface Usage {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export function costUsd(p: VendorPricing, u: Usage): number {
  let cents = 0;
  cents += (u.input / 1000) * p.input_per_1k;
  cents += (u.output / 1000) * p.output_per_1k;
  if (u.cache_read && p.cache_read_per_1k) cents += (u.cache_read / 1000) * p.cache_read_per_1k;
  if (u.cache_write && p.cache_write_per_1k) cents += (u.cache_write / 1000) * p.cache_write_per_1k;
  return cents;
}
