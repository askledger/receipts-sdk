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
| `08-four-layers-end-to-end.ts` | **All four layers in one run:** guardian (L4) blocks a bad wire, the run is hash-chained (L1) and traced as a DAG (L2), and the decision is rule-checked and graded (L3) |

## Running an example

```bash
npm install
npx tsx examples/01-basic-sign-verify.ts
```

The four-layer walkthrough has its own shortcut:

```bash
npm install
npm run demo:layers        # runs 08-four-layers-end-to-end.ts
```

It prints a per-layer pass/fail report and exits non-zero if anything fails to
verify, so it doubles as an integration smoke test.
