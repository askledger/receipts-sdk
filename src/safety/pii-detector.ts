/**
 * PII detector — Plane 4 (Decision) Pillar 6 (Shadow AI Discovery & Block).
 *
 * Scans text for Personally Identifiable Information and BFSI-specific
 * sensitive patterns. Designed to run in <1 ms on a typical prompt so
 * it can sit inline in the receipt-signing path.
 *
 * The matcher is intentionally regex + Luhn — NOT an LLM. LLM-based
 * PII detectors are themselves a privacy and shadow-AI risk; our
 * detector runs locally, deterministically, and is fully auditable.
 *
 * Every finding becomes part of the receipt's payload.metadata so the
 * audit trail captures what was flagged AND what was decided.
 */

export type PiiCategory =
  | "email"
  | "phone"
  | "us_ssn"
  | "credit_card"
  | "iban"
  | "uae_emirates_id"
  | "saudi_national_id"
  | "indian_aadhaar"
  | "customer_id"
  | "account_number"
  | "wire_reference"
  | "ip_address"
  | "passport"
  | "date_of_birth"
  | "api_key";

export interface PiiFinding {
  category: PiiCategory;
  /** First 4 chars + "…" + last 2 chars — never the full match. */
  redacted: string;
  /** Start index in the original text. */
  start: number;
  /** End index in the original text. */
  end: number;
  /** Detector confidence 0..1. Regex-only = 0.7, regex+checksum = 0.95. */
  confidence: number;
}

export interface PiiScanResult {
  count: number;
  categories: Partial<Record<PiiCategory, number>>;
  findings: PiiFinding[];
  /** SHA-256 of the input text would be recorded in the receipt, NOT the text. */
  has_high_confidence: boolean;
}

interface Matcher {
  category: PiiCategory;
  re: RegExp;
  /** Optional secondary validation (e.g., Luhn for credit cards). */
  validate?: (m: string) => boolean;
}

// ---------- Luhn check for credit cards ----------
function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ---------- IBAN MOD-97 check ----------
function ibanValid(iban: string): boolean {
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let num = "";
  for (const c of rearranged) {
    if (c >= "0" && c <= "9") num += c;
    else if (c >= "A" && c <= "Z") num += (c.charCodeAt(0) - 55).toString();
    else return false;
  }
  // Compute MOD-97 over the long digit string
  let r = 0;
  for (const ch of num) r = (r * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return r === 1;
}

// ---------- patterns ----------
const MATCHERS: Matcher[] = [
  {
    category: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    category: "us_ssn",
    re: /\b(?!000|9\d{2})\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: "credit_card",
    re: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: luhnValid,
  },
  {
    category: "iban",
    // Country code + 2 check digits + up to 30 alphanum (Saudi 24, UAE 23, EU mostly 18-22)
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    validate: ibanValid,
  },
  {
    category: "uae_emirates_id",
    re: /\b784-\d{4}-\d{7}-\d\b/g,
  },
  {
    category: "saudi_national_id",
    re: /\b[12]\d{9}\b/g,
  },
  {
    category: "indian_aadhaar",
    re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
  },
  {
    category: "phone",
    // International formats: +CC followed by 7-14 digits with optional separators
    re: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
  },
  {
    category: "ip_address",
    re: /\b(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}\b/g,
  },
  {
    category: "customer_id",
    // Internal patterns common in BFSI: C-12345, CUST-..., ACC-..., etc.
    re: /\b(?:C|CUST|ACC|MEMB|CIF)[-_]\d{4,12}\b/g,
  },
  {
    category: "account_number",
    // Anonymous bank account-style 10-18 digit numbers (false positives possible)
    re: /\b\d{10,18}\b/g,
  },
  {
    category: "wire_reference",
    // WIRE-2026-06-10-44812 / TXN-... / REF-... etc.
    re: /\b(?:WIRE|TXN|REF|PMT|MT103)[-_]\d{4,}[-_A-Z0-9]+\b/g,
  },
  {
    category: "passport",
    // Country-prefixed: e.g. P<USA1234567>, or plain ABC1234567
    re: /\b[A-Z]{1,3}\d{6,9}\b/g,
  },
  {
    category: "date_of_birth",
    // YYYY-MM-DD or DD/MM/YYYY in DOB-like ranges
    re: /\b(?:19[2-9]\d|20[01]\d)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
  },
  {
    category: "api_key",
    // sk-..., sk-proj-..., ghp_..., AWS AKIA..., Slack xoxb-...
    re: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|xox[bpars]-[A-Za-z0-9-]{10,})\b/g,
  },
];

function redact(s: string): string {
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

/**
 * Scan text for PII. Returns structured findings — never returns the
 * raw matched strings, only redacted previews.
 */
export function scanPii(text: string): PiiScanResult {
  if (!text) {
    return { count: 0, categories: {}, findings: [], has_high_confidence: false };
  }
  const findings: PiiFinding[] = [];
  for (const m of MATCHERS) {
    m.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = m.re.exec(text)) !== null) {
      const raw = match[0];
      if (m.validate && !m.validate(raw)) continue;
      findings.push({
        category: m.category,
        redacted: redact(raw),
        start: match.index,
        end: match.index + raw.length,
        confidence: m.validate ? 0.95 : 0.7,
      });
    }
  }
  // De-overlap: a credit card and an account_number can match the same digits;
  // keep the most-specific (highest-confidence + longest) per index range.
  findings.sort((a, b) => a.start - b.start);
  const kept: PiiFinding[] = [];
  for (const f of findings) {
    const last = kept[kept.length - 1];
    if (!last || f.start >= last.end) {
      kept.push(f);
    } else {
      // overlap — keep higher confidence, then longer
      const aLen = last.end - last.start;
      const bLen = f.end - f.start;
      if (
        f.confidence > last.confidence ||
        (f.confidence === last.confidence && bLen > aLen)
      ) {
        kept[kept.length - 1] = f;
      }
    }
  }
  const categories: Partial<Record<PiiCategory, number>> = {};
  for (const f of kept) categories[f.category] = (categories[f.category] ?? 0) + 1;
  return {
    count: kept.length,
    categories,
    findings: kept,
    has_high_confidence: kept.some((f) => f.confidence >= 0.9),
  };
}
