// Model-fit score. Heuristic in v1, learnable in v2. For a given prompt,
// return a 0..1 score of how likely a cheaper model can serve it as
// well as the current model. Surfaced in the finance dashboard so the
// CFO can see "we're overpaying on this use case".

export interface PromptSignals {
  prompt: string;
  has_tools: boolean;
  expected_output_tokens: number;
  task_intent?: "code" | "summarize" | "extract" | "analyze" | "translate" | "creative" | "unknown";
}

export interface FitVerdict {
  score: number;                   // 0..1, higher = cheaper model fits
  recommended_model: string | null;
  factors: { name: string; weight: number; value: number }[];
}

const INTENT_BASE: Record<string, number> = {
  extract: 0.9,
  translate: 0.85,
  summarize: 0.8,
  code: 0.65,
  analyze: 0.45,
  creative: 0.3,
  unknown: 0.5,
};

const CHEAP_FOR_INTENT: Record<string, string> = {
  extract: "google:gemini-2-5-flash",
  translate: "google:gemini-2-5-flash",
  summarize: "openai:gpt-5-mini",
  code: "anthropic:claude-haiku-4-5",
  analyze: "anthropic:claude-haiku-4-5",
  creative: "anthropic:claude-haiku-4-5",
  unknown: "anthropic:claude-haiku-4-5",
};

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

export function fitScore(s: PromptSignals): FitVerdict {
  const intent = s.task_intent ?? "unknown";
  const baseScore = INTENT_BASE[intent];
  const factors: FitVerdict["factors"] = [{ name: "intent_base", weight: 1, value: baseScore }];

  let score = baseScore;

  // Long expected outputs slightly disfavour the cheap model.
  if (s.expected_output_tokens > 2000) { score -= 0.10; factors.push({ name: "long_output", weight: -0.10, value: s.expected_output_tokens }); }
  // Tool use can favour either; large tool sets favour stronger models.
  if (s.has_tools) { score -= 0.15; factors.push({ name: "tool_use", weight: -0.15, value: 1 }); }

  // Short input prompts are usually easy; cheap model fits.
  const promptTokens = Math.ceil(s.prompt.length / 4);
  if (promptTokens < 400) { score += 0.05; factors.push({ name: "short_prompt", weight: 0.05, value: promptTokens }); }
  // Very long prompts hint at complex reasoning.
  if (promptTokens > 4000) { score -= 0.10; factors.push({ name: "long_prompt", weight: -0.10, value: promptTokens }); }

  score = clamp01(score);

  return {
    score,
    recommended_model: score >= 0.65 ? CHEAP_FOR_INTENT[intent] : null,
    factors,
  };
}
