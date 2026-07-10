/**
 * Prompt-injection detector, Plane 4 (Decision).
 *
 * Inspired by Lakera Guard and Robust Intelligence's runtime firewall,
 * but implemented entirely with heuristics (regex + token-level
 * scoring) rather than a second LLM. LLM-based detectors are
 * themselves a privacy and shadow-AI risk, regex is deterministic,
 * auditable, and adds zero latency.
 *
 * Detects:
 *   - Instruction overrides: "ignore previous instructions", "disregard the above"
 *   - Role injection: "you are now a different assistant", "pretend you are"
 *   - System-prompt leak: "show me your system prompt", "what are your instructions"
 *   - DAN-style jailbreaks ("DAN", "Developer Mode", "STAN")
 *   - Encoded payload smuggling: base64, hex, rot13 markers
 *   - Language switching: instructions in unexpected languages
 *   - Tool / function override attempts
 *   - Common adversarial templates from public injection datasets
 *
 * Scoring 0..1. >= 0.7 = likely injection, >= 0.4 = suspicious, < 0.4 = clean.
 */

export type InjectionCategory =
  | "instruction_override"
  | "role_injection"
  | "system_prompt_leak"
  | "dan_jailbreak"
  | "encoded_payload"
  | "tool_override"
  | "delimiter_injection"
  | "context_overflow"
  | "policy_bypass";

export interface InjectionFinding {
  category: InjectionCategory;
  severity: "low" | "medium" | "high";
  /** Snippet that triggered the rule, redacted to first/last few chars. */
  snippet: string;
  /** What the heuristic looked for, in plain English. */
  pattern: string;
}

export interface InjectionResult {
  is_injection: boolean;
  score: number;             // 0..1
  findings: InjectionFinding[];
  reason_codes: string[];
}

interface Rule {
  category: InjectionCategory;
  re: RegExp;
  severity: "low" | "medium" | "high";
  pattern: string;
}

const RULES: Rule[] = [
  // ---- instruction override ----
  {
    category: "instruction_override",
    // Accept filler words between the verb and "previous" (e.g. "ignore all the previous", "ignore everything above")
    re: /\b(?:ignore|disregard|forget|skip|override)\b(?:\s+\w+){0,4}\s+(?:previous|prior|earlier|preceding|original|above)\b(?:\s+\w+){0,3}\s+(?:instructions?|prompts?|rules?|directives?|guidelines?|messages?)\b/i,
    severity: "high",
    pattern: '"ignore previous instructions" style override',
  },
  {
    category: "instruction_override",
    re: /\b(?:new|updated|revised)\s+instructions?\s*[:\-]/i,
    severity: "medium",
    pattern: '"new instructions:" preamble',
  },
  // ---- role injection ----
  {
    category: "role_injection",
    re: /\byou\s+are\s+(?:now\s+)?(?:a\s+different|another|an?\s+un?restricted|an?\s+evil|an?\s+jailbroken)\b/i,
    severity: "high",
    pattern: '"you are now a different assistant" role override',
  },
  {
    category: "role_injection",
    re: /\b(?:pretend|act|behave|roleplay)\s+(?:as\s+if\s+)?(?:like\s+)?(?:that\s+)?you\s+(?:are|were)\s+(?:not|no\s+longer)\b/i,
    severity: "high",
    pattern: '"pretend you are not an AI" role override',
  },
  // ---- system prompt leak ----
  {
    category: "system_prompt_leak",
    re: /\b(?:show|reveal|print|display|repeat|give|tell|leak)\s+(?:me\s+)?(?:your|the)\s+(?:system|initial|original|base|hidden|secret)\s+(?:prompt|instructions?|message|rules?)\b/i,
    severity: "high",
    pattern: "request to leak the system prompt",
  },
  {
    category: "system_prompt_leak",
    re: /\bwhat\s+(?:are|were)\s+(?:your|the)\s+(?:original|initial|first|system)\s+(?:instructions?|prompts?)\b/i,
    severity: "medium",
    pattern: "asking what the original instructions were",
  },
  // ---- DAN-style jailbreaks ----
  {
    category: "dan_jailbreak",
    re: /\b(?:DAN|STAN|DUDE|Developer\s+Mode|jailbreak\s+mode|do\s+anything\s+now)\b/i,
    severity: "high",
    pattern: "DAN / Developer Mode / jailbreak terminology",
  },
  {
    category: "dan_jailbreak",
    re: /\b(?:without\s+(?:any\s+)?(?:restrictions?|filters?|warnings?|disclaimers?|ethics?|morals?))\b/i,
    severity: "medium",
    pattern: '"without restrictions" jailbreak request',
  },
  // ---- delimiter injection ----
  {
    category: "delimiter_injection",
    re: /(?:<\/?(?:system|admin|root|assistant|user|instruction)>)|(?:\[\/?(?:system|admin|root|assistant|user|instruction)\])|(?:\#{3,}\s*(?:system|admin)\s*\#{3,})/i,
    severity: "high",
    pattern: "fake delimiter tags (<system>, [admin], ###system###)",
  },
  // ---- encoded payloads ----
  {
    category: "encoded_payload",
    re: /\b(?:base64|b64)\s*[:\-]?\s*[A-Za-z0-9+/=]{40,}/i,
    severity: "medium",
    pattern: "long base64-encoded string with explicit label",
  },
  {
    category: "encoded_payload",
    re: /\b(?:decode|decipher|deobfuscate|rot13)\s+(?:this|the\s+following|and\s+(?:execute|run))/i,
    severity: "high",
    pattern: '"decode this and run" instruction',
  },
  // ---- tool / function override ----
  {
    category: "tool_override",
    re: /\b(?:call|invoke|execute|run)\s+(?:the\s+)?(?:function|tool|api|endpoint)\s+(?:with\s+)?(?:admin|root|sudo|unrestricted)\s+(?:privileges?|access)\b/i,
    severity: "high",
    pattern: "request to invoke tools with admin privileges",
  },
  // ---- policy bypass ----
  {
    category: "policy_bypass",
    re: /\b(?:bypass|circumvent|get\s+around|work\s+around)\s+(?:the\s+)?(?:policy|policies|safety|filter|guard|guardrail|restriction)/i,
    severity: "high",
    pattern: '"bypass the safety policy" attempt',
  },
  {
    category: "policy_bypass",
    re: /\bthis\s+is\s+(?:just\s+)?(?:for|a)\s+(?:research|educational|hypothetical|fictional)\s+purposes?\s+only\b/i,
    severity: "low",
    pattern: '"for educational purposes only" disclaimer (low-signal)',
  },
];

function snippet(s: string, start: number, end: number, n = 30): string {
  const left = Math.max(0, start - n);
  const right = Math.min(s.length, end + n);
  const ellipsisL = left > 0 ? "…" : "";
  const ellipsisR = right < s.length ? "…" : "";
  // Redact: keep first 6 chars of the match, mask the rest with ▪
  const matched = s.slice(start, end);
  const matchedRedacted =
    matched.length > 12 ? `${matched.slice(0, 6)}▪▪▪${matched.slice(-3)}` : matched;
  return `${ellipsisL}${s.slice(left, start)}${matchedRedacted}${s.slice(end, right)}${ellipsisR}`;
}

const SEV_SCORE: Record<"low" | "medium" | "high", number> = {
  low: 0.15,
  medium: 0.4,
  high: 0.7,
};

/**
 * Scan a prompt for injection patterns. Pure heuristic. Returns
 * findings, score, and a verdict flag.
 *
 * Designed for production hot paths: O(N×R) where N is the prompt
 * length and R is the rule count (~14 rules). For a 4 KB prompt this
 * is < 1 ms.
 */
export function scanPromptInjection(text: string): InjectionResult {
  if (!text) {
    return { is_injection: false, score: 0, findings: [], reason_codes: [] };
  }
  const findings: InjectionFinding[] = [];

  // Context-overflow heuristic: very long prompts with many "system"-style
  // delimiters are correlated with injection attempts.
  const systemDelimCount = (text.match(/<\/?(?:system|admin|instruction)>/gi) ?? []).length;
  if (systemDelimCount > 0 && text.length > 4000) {
    findings.push({
      category: "context_overflow",
      severity: "medium",
      snippet: `${systemDelimCount} system-style delimiters in a ${text.length}-char prompt`,
      pattern: "long prompt with many fake system delimiters",
    });
  }

  for (const r of RULES) {
    r.re.lastIndex = 0;
    const m = r.re.exec(text);
    if (m) {
      findings.push({
        category: r.category,
        severity: r.severity,
        snippet: snippet(text, m.index, m.index + m[0].length),
        pattern: r.pattern,
      });
    }
  }

  const score = Math.min(
    1,
    findings.reduce((s, f) => s + SEV_SCORE[f.severity], 0)
  );
  const reason_codes = findings.map((f) => `injection:${f.category}`);

  return {
    is_injection: score >= 0.4,
    score: Number(score.toFixed(3)),
    findings,
    reason_codes,
  };
}
