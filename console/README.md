# AskLedger · Admin Console

Enterprise-grade admin console for AskLedger. Next.js 14 (App Router), TypeScript strict, Tailwind, full WCAG 2.2 AA.

```bash
cd console
npm install
npm run dev          # http://localhost:3000
```

## Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard — trust posture KPIs, recent receipts, pending approvals, key health, system posture |
| `/receipts` | Receipts Explorer — filter, sort, verify, export |
| `/policies` | Policy editor + live decision sandbox |
| `/keys` | Key roster: rotate, retire, revoke; transition log |
| `/workflows` | End-to-end workflow visibility |
| `/evidence` | Evidence pack builder + history |
| `/tenants` | Tenant provisioning + lifecycle |
| `/audit` | Admin audit log — every action is itself a signed receipt |
| `/settings` | Security posture, identity, data residency, branding |

## Design system

Implements [`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md). Components are reusable across the customer console and regulator verifier UIs.

## Security

- All client-side verifications run via the bundled `@askledger/receipts-sdk`
- No raw private keys ever sent to the browser
- mTLS to backing services via reverse proxy
- Receipts and policy decisions verified independently in-browser

License: Apache-2.0
