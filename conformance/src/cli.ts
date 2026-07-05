#!/usr/bin/env node
import { runAll, type Adapter } from "./index.js";
import {
  canonicalize,
  signReceipt,
  generateKeyPair,
  type RawEvent,
} from "@askledger/receipts-sdk";

const adapter: Adapter = {
  async canonicalize(input) {
    return new TextEncoder().encode(canonicalize(input));
  },
  async sign(event) {
    const kp = generateKeyPair();
    return signReceipt({ event: event as RawEvent, keypair: kp });
  },
  async signChain(events) {
    const kp = generateKeyPair();
    return events.map((e) => signReceipt({ event: e as RawEvent, keypair: kp }));
  },
};

(async () => {
  const r = await runAll(adapter);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    badge: r.badge,
    cl1: { passed: r.cl1.passed, failed: r.cl1.failed, total: r.cl1.total },
    cl2: { passed: r.cl2.passed, failed: r.cl2.failed, total: r.cl2.total },
    cl3: { passed: r.cl3.passed, failed: r.cl3.failed, total: r.cl3.total },
  }, null, 2));
  process.exit(r.badge === "CL3" ? 0 : 1);
})();
