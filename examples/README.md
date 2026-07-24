# Examples

Concrete usage patterns showing how to integrate the Receipts SDK into real systems.

## Files in this folder

| File | What it shows |
|---|---|
| `event.json` | A minimal valid event for the CLI demo |
| `01-basic-sign-verify.ts` | The simplest possible end-to-end flow |
| `02-multiple-receipts-chain.ts` | Signing 5 receipts and verifying the chain |
| `03-tamper-detection.ts` | Demonstrating that tampering is caught |
| `04-multi-tenant.ts` | Two tenants with independent chains |
| `05-express-middleware.ts` | Wrapping an Express endpoint to emit a receipt per request |
| `06-healthcare-cds.ts` | A clinical decision support call, receipted |
| `07-government-eligibility.ts` | An eligibility determination, receipted |
| `08-five-layers-end-to-end.ts` | **All five layers in one run:** the guardian (L1) blocks a bad wire, every step is hash-chained (L2) and traced as a DAG (L3), the decision is rule-checked and graded (L4), and it all rolls up into governance and verified ROI (L5) |
| `09-prove-the-savings.ts` | **Prove the savings, don't claim them:** sign a baseline, prove an efficiency-normalized saving against it, verify independently, and watch a forged number get rejected |
| `10-nextjs-route.ts` | Next.js (App Router) route handler that receipts an AI decision — same shape works in the Pages API |
| `11-fastapi.py` | FastAPI endpoint using the wire-compatible Python SDK; receipts cross-verify with the TypeScript SDK |

## Running an example

```bash
npm install
npx tsx examples/01-basic-sign-verify.ts
```

The five-layer walkthrough has its own shortcut:

```bash
npm install
npm run demo:layers        # runs 08-five-layers-end-to-end.ts
npm run demo:savings       # runs 09-prove-the-savings.ts
```

Both print a pass/fail report and exit non-zero if anything fails to verify, so
they double as integration smoke tests.
