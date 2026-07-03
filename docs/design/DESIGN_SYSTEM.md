# AskLedger · Enterprise Design System

**Version:** 1.0
**Applies to:** Admin Console, Customer Console, Regulator Verifier UI, Documentation site, Marketing site
**Tokens:** CSS custom properties + Tailwind config
**Accessibility:** WCAG 2.2 Level AA enforced; AAA where reasonable

This is the contract every AskLedger UI surface must follow. A feature that does not follow it is not done.

---

## 1. Design principles

| Principle | What it means in practice |
|---|---|
| **Trustworthy** | Restrained color palette. No skeuomorphism. No animations on data-density screens. Every claim is backed by a verifiable artifact. |
| **Forensic** | Every receipt screen exposes the cryptographic primitives (hash, signature, kid) one click away. Information density over decoration. |
| **Auditor-friendly** | Tables sortable, exportable, time-ranged. Every action attributable. Print-friendly. |
| **Role-aware** | The same screen presents different affordances to a tenant admin, a regulator, a support engineer. |
| **Workflow-clear** | Approval state, policy decisions, plan gates always visible — never hidden behind tooltips. |
| **Internationalizable** | RTL support for MENA. All strings keyed; no inline literals in component code. |

---

## 2. Color tokens

All colors are defined as CSS custom properties (light + dark + high-contrast variants).

### 2.1 Brand

| Token | Light | Dark |
|---|---|---|
| `--pl-brand-navy-900` (primary) | `#0a1530` | `#0a1530` |
| `--pl-brand-navy-700` | `#172547` | `#1b2b54` |
| `--pl-brand-navy-500` | `#2e4480` | `#3a52a3` |
| `--pl-brand-gold-500` (accent) | `#c79b3c` | `#d6ad55` |
| `--pl-brand-gold-300` | `#e8c878` | `#e8c878` |

### 2.2 Semantic — status

| Token | Color | Use |
|---|---|---|
| `--pl-status-allow` | `#1b7f55` | Allowed receipts, approved actions |
| `--pl-status-block` | `#a32424` | Blocked receipts, rejected actions, tamper detected |
| `--pl-status-flag` | `#b97607` | Flagged for review |
| `--pl-status-pending` | `#4a5d8a` | Pending approvals, in-flight |
| `--pl-status-info` | `#1f5e9e` | Info banners |
| `--pl-status-revoked` | `#5a2a8c` | Revoked keys |

### 2.3 Surface

| Token | Light | Dark |
|---|---|---|
| `--pl-surface-0` (page background) | `#f6f7fb` | `#0b1024` |
| `--pl-surface-1` (cards) | `#ffffff` | `#121a3a` |
| `--pl-surface-2` (raised) | `#fafbfd` | `#19224b` |
| `--pl-border` | `#dde1ec` | `#27325f` |
| `--pl-text-primary` | `#101430` | `#eef1fa` |
| `--pl-text-secondary` | `#525a76` | `#a8b1cf` |
| `--pl-text-disabled` | `#a3a9bd` | `#5b6688` |

### 2.4 Contrast minimums

- Body text vs surface: ≥ 7:1 (AAA)
- UI components vs background: ≥ 3:1 (AA)
- Focus rings: ≥ 4.5:1 (custom token `--pl-focus`)

---

## 3. Typography

| Token | Family | Weight | Size | Line | Use |
|---|---|---|---|---|---|
| `--pl-font-sans` | "Inter", system-ui, sans-serif | — | — | — | Default UI |
| `--pl-font-mono` | "JetBrains Mono", "SFMono-Regular", monospace | — | — | — | Hashes, signatures, kids, JSON |
| `--pl-text-display` | sans | 700 | 32 / 40 | 1.15 | Page hero |
| `--pl-text-h1` | sans | 700 | 24 / 30 | 1.2 | Section title |
| `--pl-text-h2` | sans | 600 | 20 / 26 | 1.25 | Card title |
| `--pl-text-h3` | sans | 600 | 16 / 20 | 1.3 | Subsection |
| `--pl-text-body` | sans | 400 | 14 / 18 | 1.5 | Default |
| `--pl-text-body-strong` | sans | 600 | 14 / 18 | 1.5 | Emphasis |
| `--pl-text-caption` | sans | 400 | 12 / 16 | 1.4 | Metadata |
| `--pl-text-mono-sm` | mono | 400 | 12 / 16 | 1.4 | Hash/JSON values |

Numeric font features: `tnum` (tabular numerals) on for all tables — auditors compare columns.

---

## 4. Spacing

8-pixel base scale, exposed as tokens `--pl-space-1` (4px) through `--pl-space-12` (96px). Tables use `--pl-space-3` (12px) for default row padding; data-density tables use `--pl-space-2` (8px).

| Token | Pixels |
|---|---|
| `--pl-space-1` | 4 |
| `--pl-space-2` | 8 |
| `--pl-space-3` | 12 |
| `--pl-space-4` | 16 |
| `--pl-space-6` | 24 |
| `--pl-space-8` | 32 |
| `--pl-space-12` | 48 |
| `--pl-space-16` | 64 |
| `--pl-space-24` | 96 |

Cards: 24px internal padding default. Dashboards: 16px gap between cards.

---

## 5. Components

### 5.1 Button

Variants: `primary`, `secondary`, `ghost`, `danger`, `link`.
Sizes: `sm` (32h), `md` (40h, default), `lg` (48h).
All buttons MUST have `aria-label` when icon-only.
Loading state: spinner + disabled. Never a toast for non-completion.

### 5.2 Status badge

Variants: `allow`, `block`, `flag`, `pending`, `revoked`. Round-rect, 24h, semibold caption. Always paired with a glyph icon for color-blind users.

### 5.3 Table

- Sticky header with sort indicators
- Column resize on enterprise tables
- Row hover highlight
- Selection: checkbox column when bulk actions exist
- Empty state: prominent illustration + a single primary CTA
- Loading: skeleton rows (NOT spinners)
- Error: full-row error with retry
- Pagination: footer with page size selector + jump-to-page
- Data density: `comfortable` (default) and `compact` (auditor mode)
- Hash columns: always monospace + middle-truncate + click-to-copy

### 5.4 Form fields

- Label always visible (never placeholder-only)
- Helper text below
- Error text below in `--pl-status-block`
- Required marked with `*` + aria-required
- Async validation: debounced; loading dot on the right edge

### 5.5 Drawer & modal

- Drawers: right-side, 480px on desktop, full-width on mobile
- Modals: confirmation only; max 480px wide
- Destructive actions: confirmation modal mandatory, even for admins. Type tenant name to confirm for cross-tenant operations.

### 5.6 Tabs

- Underline style for content sections
- Pill style for filter sets
- Active tab is also the focus stop

### 5.7 Toast

- Top-right
- Dismissible
- Auto-dismiss only for `info` and `success`
- `error` and `warning` require explicit dismissal
- Stack of max 3; older queued

### 5.8 Code / hash display

Custom component `<HashCell>`. Shows first 8 + last 6 chars with ellipsis, click to copy, hover to reveal full. Always monospace.

### 5.9 Receipt detail panel

The canonical Receipt detail panel:

```
[ chain_height ]  [ status badge ]  [ timestamp ]
─────────────────────────────────────────────────
receipt_id              <HashCell>
tenant_id               <text>
event_type              <pill>
ai_vendor / ai_model    <pill / pill>
classification          <chip>
previous_receipt_hash   <HashCell>
receipt_hash            <HashCell>
signature.kid           <HashCell>
signature.sig           <HashCell>
─────────────────────────────────────────────────
[ Verify ] [ Download canonical JSON ] [ View raw ]
```

All hash values are click-to-copy. Verification is an inline operation that runs locally in the browser using the SDK and shows the result without round-tripping the server.

---

## 6. Patterns

### 6.1 Dashboard pattern

| Region | Content |
|---|---|
| Header | breadcrumb + title + action bar |
| KPI strip | 4 to 6 trust-related KPIs (signed today, blocked today, chain breaks, key health) |
| Primary chart | time series of signing rate by source_system |
| Secondary tables | recent receipts; pending approvals; recent admin actions |
| Side panel | quick actions + announcements |

### 6.2 Receipts Explorer pattern

Three-pane layout:
- Left: filters (date range, tenant, vendor, model, classification, decision, source_system)
- Middle: table with HashCell columns + sort + pagination
- Right: receipt detail (sticky)

### 6.3 Policy Editor pattern

Two-pane:
- Left: Rego source with syntax highlighting + lint
- Right: live decision sandbox (paste an input, see allow/block + reason codes)

Bundle save action runs OPA test suite first; refuses on test failure.

### 6.4 Key management pattern

Roster table of keys with status, last-used, age. Actions per row: rotate, retire, revoke. Rotation flow is a 3-step modal (review → confirm peer approval → execute).

### 6.5 Evidence pack builder pattern

Wizard: pick tenant → pick period → pick filters → preview selection → name + purpose → build & download. Build runs locally in browser using the SDK.

---

## 7. Accessibility (WCAG 2.2 AA enforced)

- All interactive elements reachable via keyboard
- Visible focus rings (4.5:1 contrast, 2px solid)
- Skip link first focus stop
- All form fields associated with labels via `for`/`id`
- All images / icons either decorative (`aria-hidden`) or labelled
- Color is never the sole indicator (always paired with glyph or text)
- Reduced motion: respect `prefers-reduced-motion`
- Live regions for async result announcements
- High-contrast theme available via `data-theme="hc"`

---

## 8. Internationalization

- All strings via i18n keys (no inline literals)
- RTL via `dir` attribute; icons flip-aware
- Date / number / currency via Intl APIs
- First-class languages: English (US), English (UK), Arabic (Saudi Arabia, UAE), Spanish, German, French, Japanese
- Translation memory shared with documentation

---

## 9. Performance budgets

| Metric | Budget |
|---|---|
| Initial JS payload (admin shell) | ≤ 180 KB gzipped |
| LCP (admin home) | ≤ 1.5s on 4G |
| INP (any interaction) | ≤ 100 ms |
| Receipts table render (1000 rows) | ≤ 100 ms client-side |
| Receipt verify (browser) | ≤ 50 ms |

---

## 10. Document maintenance

Updated on every release that adds a new component or token. Owned by the design lead; consumed by every feature team. Component reference implementations live in `console/src/components/`.
