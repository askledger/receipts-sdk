/**
 * Example 05 — Express middleware
 *
 * Drop-in middleware that emits a signed receipt for every AI-gateway
 * request flowing through an Express server. This is the pattern most
 * SMB and mid-market deployments will use to get cryptographic evidence
 * with zero application code changes.
 *
 * Usage:
 *
 *   import express from "express";
 *   import { receiptsMiddleware } from "./05-express-middleware";
 *
 *   const app = express();
 *   app.use(express.json());
 *   app.use(receiptsMiddleware({
 *     tenantId: "acme-corp",
 *     keypair: generateKeyPair(),
 *     sourceSystem: "ai-gateway-prod",
 *   }));
 *
 * Note: This example file is illustrative — it does not require express
 * as a dependency. The signature shows the integration shape.
 */

import {
  signReceipt,
  type RawEvent,
  type KeyPair,
  type SignedReceipt,
} from "../src/index.js";

interface MiddlewareOptions {
  tenantId: string;
  keypair: KeyPair;
  sourceSystem: string;
  onReceipt?: (receipt: SignedReceipt) => Promise<void> | void;
}

/**
 * Reference Express middleware. Treat as a starting point — production
 * deployments will wire onReceipt to ship the receipt to durable storage
 * (Postgres, S3, Kafka, the AskLedger cloud, etc.).
 */
export function receiptsMiddleware(opts: MiddlewareOptions) {
  return function (req: any, res: any, next: any) {
    const startedAt = new Date().toISOString();
    const origJson = res.json.bind(res);

    res.json = function (body: unknown) {
      try {
        const event: RawEvent = {
          schema_version: "1.0",
          tenant_id: opts.tenantId,
          event_type: `gateway.${req.method.toLowerCase()}`,
          source_system: opts.sourceSystem,
          event_id: `${req.method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          captured_at: startedAt,
          context: {
            user_id: req.user?.id ?? req.headers["x-user-id"],
            session_id: req.sessionID,
            environment: process.env.NODE_ENV === "production" ? "production" : "development",
            correlation_id:
              req.headers["traceparent"] ?? req.headers["x-correlation-id"],
          },
          subject: {
            ai_vendor: req.headers["x-ai-vendor"] ?? "unknown",
            ai_model: req.headers["x-ai-model"] ?? "unknown",
            ai_capability: req.headers["x-ai-capability"] ?? "text-generation",
          },
          payload: {
            input_classification: "internal",
            output_classification: "internal",
            input_size_bytes: JSON.stringify(req.body ?? {}).length,
            metadata: {
              status_code: res.statusCode,
              completed_at: new Date().toISOString(),
            },
          },
        };

        const receipt = signReceipt({ event, keypair: opts.keypair });
        if (opts.onReceipt) {
          Promise.resolve(opts.onReceipt(receipt)).catch((e) =>
            console.error("[receipts-middleware] onReceipt failed:", e)
          );
        }
        res.setHeader("x-ledger-receipt-id", receipt.receipt.receipt_id);
      } catch (e) {
        // Receipts MUST NOT take down the gateway. Log and continue.
        console.error("[receipts-middleware] sign failed:", e);
      }
      return origJson(body);
    };

    next();
  };
}
