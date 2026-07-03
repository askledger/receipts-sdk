# Universal Capture Architecture

**Vision:** Every AI invocation that happens in any company — by any user, on any device, through any vendor — produces a AskLedger receipt. The admin sees everything.

**Status:** Strategic roadmap · the substrate is universal today. The capture layer is partially universal. This document explains where each surface stands and what closes the gaps.

---

## The reality of where AI lives in 2026

| Surface | Where the AI invocation actually happens | Share of enterprise AI traffic |
|---|---|---|
| Browser tabs (chatgpt.com, claude.ai, gemini.google.com, etc.) | Browser | ~25% |
| Cloud API calls from app code (OpenAI, Anthropic, Bedrock, Vertex) | Server | ~30% |
| Desktop AI apps (Cursor, Claude Desktop, ChatGPT desktop, Copilot M365) | Desktop OS | ~25% |
| SaaS apps with embedded AI (Notion AI, Slack AI, Salesforce Einstein, M365 Copilot) | SaaS vendor | ~15% |
| Mobile AI (ChatGPT app, Claude app, Gemini in Android, Apple Intelligence) | Mobile OS | ~5% |

**Today we cover the first two well. We do not yet cover the rest.** That gap is the difference between "useful infrastructure for engineering" and "universal observability for every AI invocation."

---

## Coverage matrix · today vs. target

| Surface | Today | What's missing | Effort to close |
|---|---|---|---|
| **Browser** (chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, huggingface.co) | ✅ Chrome MV3 extension covers all major consumer AI surfaces | Identity binding to corporate SSO · real-time PII block-before-send · mass-deploy via MDM | 2-4 weeks |
| **Cloud API from server code** (OpenAI SDK, Anthropic SDK, Bedrock SDK, Vertex SDK, fetch) | ✅ Adapters for 4 vendors + generic fetch for 11 vendors | Bedrock-specific adapter · Vertex adapter · Cohere SDK adapter | 1-2 weeks |
| **AI gateway** (Portkey, LiteLLM, Helicone, Vercel AI Gateway) | ✅ Generic fetch interceptor catches all of these | Native integrations contributed upstream to each gateway | 2-4 weeks per gateway |
| **Cursor / Windsurf / Continue / GitHub Copilot in IDE** | ❌ Not covered today | Desktop capture agent or IDE extension | 4-6 weeks |
| **Claude Desktop / ChatGPT Desktop App / Microsoft Copilot M365 (desktop)** | ❌ Not covered today | Desktop capture agent (Tauri / Electron-based or native) hooking system network or DNS | 6-8 weeks |
| **Microsoft 365 Copilot (audit log)** | ❌ Not covered today | M365 audit log connector · pulls AI events from Microsoft Purview | 2-3 weeks |
| **Google Workspace Gemini** | ❌ Not covered today | Workspace audit log connector · OAuth-scoped read of admin audit events | 2-3 weeks |
| **Slack AI** | ❌ Not covered today | Slack Admin API connector · pulls AI assistant events | 1-2 weeks |
| **Notion AI** | ❌ Not covered today | Notion Admin API connector | 2 weeks |
| **Salesforce Einstein / Agentforce** | ❌ Not covered today | Salesforce Event Monitoring connector | 2-3 weeks |
| **Mobile AI** (ChatGPT iOS/Android, Claude mobile, Gemini in Android, Apple Intelligence) | ❌ Not covered today | iOS MDM profile + Android MDM config · or a dedicated mobile companion app | 6-8 weeks |
| **MCP servers / Tool calls** | ✅ LangChain handler + adapter pattern · MCP server adapter ships with the SDK | Native MCP capture extension | 2 weeks |
| **Agent frameworks** (LangChain, LangGraph, AutoGen, CrewAI, Letta, OpenAI Agents SDK) | ✅ LangChain handler + generic adapter pattern | Native integration for LangGraph, AutoGen, CrewAI | 1-2 weeks per framework |

---

## Priority order · biggest gap to smallest

The list below maximizes coverage-per-engineering-week. Build top-down.

### Phase 1 · close the desktop and SaaS gaps (8-12 weeks)

1. **Microsoft 365 Copilot connector** · ~50% of enterprise AI today, all flows through Microsoft Purview audit · easiest connector to build, biggest payoff
2. **Cursor / Windsurf / Continue IDE extensions** · all editor-extension-based · we ship our extension pattern as a starting kit
3. **Desktop capture agent (macOS first)** · catches Claude Desktop, ChatGPT Desktop, Cursor's local traffic · cross-platform later
4. **Google Workspace Gemini connector** · second-largest enterprise AI surface
5. **Slack AI + Notion AI connectors** · top SaaS AI surfaces

### Phase 2 · mobile (8 weeks)

6. **iOS MDM profile** that installs a per-user VPN-on-demand routing AI vendor traffic through a capture proxy
7. **Android MDM equivalent**
8. **Optional: dedicated mobile companion app** for individuals not on managed devices

### Phase 3 · everything else (6 weeks)

9. **Salesforce Einstein** connector
10. **CrewAI / LangGraph / AutoGen / OpenAI Agents SDK** native integrations
11. **Cohere / Mistral / Together / Groq / Bedrock** dedicated SDK adapters (we already cover via generic fetch but native is cleaner)

---

## Why this ordering

| Decision | Justification |
|---|---|
| M365 Copilot first | Half of all enterprise AI runs here today. Audit log connector takes 2-3 weeks. Single biggest unlock for "admin sees everything." |
| Desktop agent before mobile | Most regulated companies care about laptops more than phones. Mobile is also harder (OS-level restrictions). |
| MacOS first for desktop agent | Largest install base among technical knowledge workers · Cursor / Claude Desktop heavy users · earliest signal we'll get for product-market fit |
| SaaS connectors are admin-API-based, not user-installed | Mass deployment via admin click rather than per-user opt-in |
| Mobile last | Smallest share of traffic, hardest engineering, lowest CISO priority right now |

---

## Architecture for each surface

### Browser extension (have)
- Manifest V3 · content script intercepts submit events · service worker signs receipts locally · optional corporate ingest
- **Add:** OIDC identity binding · real-time PII block-before-send · MDM-deployable config

### Desktop agent (need)
- Tauri (Rust + WebView) or Electron base · cross-platform
- macOS Network Extension framework / Windows WFP filter / Linux nftables for OS-level traffic capture
- Detects AI vendor traffic, signs receipts locally
- Local-only by default · optional corporate ingest
- Tray app showing live receipts (same UX pattern as 1Password)

### SaaS connectors (need)
- Admin-installed OAuth apps requesting read-only audit-log scopes
- Polls or webhooks for AI events
- Maps to receipt schema and signs with platform key
- Each connector is a small server-side worker

### Mobile (need)
- iOS: MDM-deployed VPN profile routes AI vendor traffic to capture proxy
- Android: MDM-deployed VPN equivalent
- Dedicated companion app for unmanaged personal devices

### Cloud API (have)
- SDK adapters · wrap the official client · no change to app code

### Agent frameworks (have)
- Callback / hook patterns into the framework
- LangChain has handler; pattern generalizes to LangGraph, AutoGen, CrewAI

---

## The universal admin promise

For *every* surface above, the admin in the hosted Console eventually sees:

| What the admin sees | When all surfaces are covered |
|---|---|
| Every AI invocation across browser, desktop, mobile, SaaS apps | Single dashboard |
| Per-user filter | "Show me what Maryam asked any AI today" |
| Per-team rollup | "Show me Marketing's AI spend this month" |
| Per-vendor filter | "Show me everything sent to OpenAI" |
| Per-data-class filter | "Show me every prompt classified PII" |
| Safety findings | "Show me every prompt-injection attempt" |
| Compliance citations | "Show me what satisfies CBUAE this quarter" |
| Cost attribution | "Show me $$ per team per AI vendor" |
| Real-time alerting | "Tell me when someone leaks PII to ChatGPT.com" |

**This is the universal admin experience that turns AskLedger from "infrastructure" into "must-have for every CISO."**

---

## Honest scope statement

To deliver true universality across every surface above:

| Resource | Estimate |
|---|---|
| Engineering | 5-8 engineers for 6-9 months |
| Calendar time | 9 months earliest |
| Funding | $3M-7M of the seed round |
| Customer validation | First 3 enterprise design partners need to commit to using each surface for us to know the engineering targets are right |

This is not weekend work. It is the second product chapter — and it is exactly the kind of thing the seed/Series A round funds.

---

## Where to start

If we had to pick **one** new surface to build first, it would be:

> **Microsoft 365 Copilot audit log connector.**

Why: ~50% of enterprise AI usage runs through Microsoft Copilot in M365 today. The Purview audit log already records every AI invocation. A 2-3 week connector pulls those events, maps them to the receipt schema, signs them, and writes to the customer's tenant. **Single biggest unlock for "admin sees everything in their company."**

After M365 Copilot is shipped, the next decision is Google Workspace Gemini vs. the macOS desktop agent. Pick based on the first paid customer's deployment.
