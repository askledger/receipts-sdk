// Demo / dev fixtures. Swapped at runtime when PL_USE_FIXTURES=false
// and the real data layer is wired in. Kept here so route handlers stay
// pure and reviewers can find what's stubbed in one place.
//
// Note: HR violators + GDPR Article 22 events below now reference real
// signed receipts generated at build time by
// console/scripts/generate-demo-receipts.mjs. Visitors can paste any
// receipt_id shown in the dashboards into the public verifier and get
// a real VALID result.

import { getDemoReceipt } from "./demo-receipts-loader.js";

const demoHR = [0, 1, 2].map((i) => getDemoReceipt(i));
const demoGdpr22 = [3, 4].map((i) => getDemoReceipt(i));

export const complianceCoverage = [
  { regulator: "CBUAE", articles_satisfied: 6, articles_total: 6, confidence: 0.94, deadline: "Sep 16, 2026", status: "allow", label: "ready" },
  { regulator: "EU AI Act", articles_satisfied: 7, articles_total: 8, confidence: 0.91, deadline: "Aug 2, 2026", status: "allow", label: "ready" },
  { regulator: "SAMA", articles_satisfied: 4, articles_total: 5, confidence: 0.87, deadline: "ongoing", status: "info", label: "monitoring" },
  { regulator: "ISO 42001", articles_satisfied: 5, articles_total: 6, confidence: 0.83, deadline: "voluntary", status: "info", label: "monitoring" },
  { regulator: "NIST AI RMF", articles_satisfied: 5, articles_total: 5, confidence: 0.96, deadline: "voluntary", status: "allow", label: "ready" },
  { regulator: "GDPR", articles_satisfied: 6, articles_total: 7, confidence: 0.88, deadline: "ongoing", status: "info", label: "monitoring" },
  { regulator: "HIPAA", articles_satisfied: 0, articles_total: 7, confidence: 0, deadline: "n/a", status: "flag", label: "not applicable" },
  { regulator: "FedRAMP", articles_satisfied: 0, articles_total: 8, confidence: 0, deadline: "n/a", status: "flag", label: "not applicable" },
] as const;

export const complianceGaps = [
  { id: "g-001", regulator: "EU AI Act", article: "ART50", gap: "Generative AI Transparency · 12 receipts missing output_hash field", count: 12, severity: "medium" },
  { id: "g-002", regulator: "SAMA", article: "T2", gap: "Saudi Data Residency · 3 receipts missing region tag", count: 3, severity: "high" },
  { id: "g-003", regulator: "GDPR", article: "ART22", gap: "Automated Decisions · 1 receipt has block decision without reason_codes", count: 1, severity: "high" },
] as const;

export const hrViolators = [
  { user: demoHR[0]?.user ?? "amir.h@askledger-demo", team: demoHR[0]?.team ?? "Engineering · Core Payments", events: 4, severity: "high", lastEvent: demoHR[0]?.issued_at?.replace("T", " ").slice(0, 16) ?? "2026-06-13 09:12", receipt_id: demoHR[0]?.receipt_id ?? null },
  { user: demoHR[1]?.user ?? "yana.r@askledger-demo", team: demoHR[1]?.team ?? "Marketing", events: 2, severity: "medium", lastEvent: demoHR[1]?.issued_at?.replace("T", " ").slice(0, 16) ?? "2026-06-12 16:44", receipt_id: demoHR[1]?.receipt_id ?? null },
  { user: demoHR[2]?.user ?? "fahad.s@askledger-demo", team: demoHR[2]?.team ?? "Engineering · Data Platform", events: 1, severity: "medium", lastEvent: demoHR[2]?.issued_at?.replace("T", " ").slice(0, 16) ?? "2026-06-12 11:08", receipt_id: demoHR[2]?.receipt_id ?? null },
] as const;

export const hrTeams = [
  { team: "Engineering", users: 142, violations_week: 5, training_completion: 0.87, status: "info", label: "monitor" },
  { team: "Marketing", users: 31, violations_week: 2, training_completion: 0.72, status: "flag", label: "training due" },
  { team: "Sales", users: 58, violations_week: 0, training_completion: 0.94, status: "allow", label: "healthy" },
  { team: "Compliance", users: 12, violations_week: 0, training_completion: 1.0, status: "allow", label: "healthy" },
  { team: "HR", users: 9, violations_week: 0, training_completion: 0.89, status: "allow", label: "healthy" },
] as const;

export const legalHolds = [
  { id: "hold-2026-001", matter: "Customer Wire Dispute · Al-Mansoori Holdings", custodians: 4, scope: "All AI events 2026-04-01 to present", status: "info", label: "active" },
  { id: "hold-2026-002", matter: "Regulator inquiry · CBUAE Q2 2026", custodians: 12, scope: "Risk + AML AI decisions Q2 2026", status: "info", label: "active" },
] as const;

export const legalGdpr22 = [
  { rid: demoGdpr22[0]?.receipt_id ?? "01J9X8VK0001", time: demoGdpr22[0]?.time_hhmm ?? "10:14", subject: "credit-decline · German resident", model: demoGdpr22[0]?.model ?? "claude-sonnet-4-6", reviewed_by: "marta.h@askledger-demo", status: "allow" },
  { rid: demoGdpr22[1]?.receipt_id ?? "01J9X8VK0002", time: demoGdpr22[1]?.time_hhmm ?? "09:58", subject: "fraud-flag · French resident", model: demoGdpr22[1]?.model ?? "gpt-5", reviewed_by: "pending", status: "pending" },
] as const;

export const financeSpendTeams = [
  { team: "Engineering · Core Payments", spend_mtd: 8430.22, growth: "+12%", tokens_in_M: 41.2, top_use_case: "code-completion" },
  { team: "Marketing", spend_mtd: 5210.50, growth: "+38%", tokens_in_M: 18.7, top_use_case: "content-drafting" },
  { team: "Compliance", spend_mtd: 4180.80, growth: "+5%", tokens_in_M: 14.1, top_use_case: "document-summarization" },
  { team: "Sales", spend_mtd: 3092.15, growth: "+22%", tokens_in_M: 9.8, top_use_case: "customer-comms" },
  { team: "Engineering · Data Platform", spend_mtd: 2840.00, growth: "-4%", tokens_in_M: 22.9, top_use_case: "data-explanation" },
  { team: "Legal", spend_mtd: 1190.40, growth: "+18%", tokens_in_M: 4.3, top_use_case: "contract-review" },
] as const;

export const financeSpendVendors = [
  { vendor: "Anthropic", spend_mtd: 12480.50, share: 0.52, unit_cost_per_1k_tokens: 0.0048 },
  { vendor: "OpenAI", spend_mtd: 7820.00, share: 0.32, unit_cost_per_1k_tokens: 0.0061 },
  { vendor: "AWS Bedrock", spend_mtd: 2540.20, share: 0.11, unit_cost_per_1k_tokens: 0.0039 },
  { vendor: "Google Vertex", spend_mtd: 1103.37, share: 0.05, unit_cost_per_1k_tokens: 0.0042 },
] as const;
