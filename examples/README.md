# Examples

Five concrete usage patterns showing how to integrate the Receipts SDK into real systems.

## Files in this folder

| File | What it shows |
|---|---|
| `event.json` | A minimal valid event for the CLI demo |
| `01-basic-sign-verify.ts` | The simplest possible end-to-end flow |
| `02-multiple-receipts-chain.ts` | Signing 5 receipts and verifying the chain |
| `03-tamper-detection.ts` | Demonstrating that tampering is caught |
| `04-multi-tenant.ts` | Two tenants with independent chains |
| `05-express-middleware.ts` | Wrapping an Express endpoint to emit a receipt per request |

## Running an example

```bash
npm install
npm run build
node --loader tsx examples/01-basic-sign-verify.ts
```

(Or compile examples manually if you do not have `tsx`.)
