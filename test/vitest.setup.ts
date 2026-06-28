// Vitest setup — runs before any test module is loaded.
//
// Ensures globalThis.crypto is available everywhere. @noble/ed25519 v2 (and
// other libraries) check `crypto.getRandomValues` at module-import time.
// Node 19+ sets globalThis.crypto automatically; Node 18 and certain vitest
// worker contexts on Linux do not, which causes
// "Cannot read properties of undefined (reading 'getRandomValues')" failures.
//
// This file is registered via `setupFiles` in vitest.config.ts so the polyfill
// is applied before user modules — including @noble/ed25519 — are imported.

import { webcrypto } from "node:crypto";

if (typeof globalThis.crypto === "undefined") {
  (globalThis as unknown as { crypto: typeof webcrypto }).crypto = webcrypto;
}
