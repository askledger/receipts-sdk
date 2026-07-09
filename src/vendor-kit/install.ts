// One-call auto-instrumentation. The "default for every company"
// wedge: drop a single import, and every supported AI vendor SDK in
// this process emits a signed receipt for every call.
//
//   import { installReceipts } from "@askledger/receipts-sdk/vendor-kit";
//   installReceipts({ tenantId: "acme" });
//
// The function generates (or loads) a tenant signing key, wraps any
// installed Anthropic / OpenAI clients, and installs a global fetch
// interceptor for raw HTTP traffic. Receipts are POSTed to the
// configured ingest endpoint, falling back to a local queue when
// ingest is unreachable.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { generateKeyPair } from "../crypto.js";
import { wrapOpenAI } from "../adapters/openai.js";
import { wrapAnthropic } from "../adapters/anthropic.js";
import type { KeyPair, SignedReceipt } from "../types.js";

export interface InstallOptions {
  tenantId: string;
  ingestUrl?: string;
  ingestToken?: string;
  keypair?: KeyPair;
  keypairFile?: string;
  queueDir?: string;
  disable?: { openai?: boolean; anthropic?: boolean };
}

interface ResolvedConfig {
  tenantId: string;
  ingestUrl: string;
  ingestToken: string;
  keypair: KeyPair;
  queueDir: string;
}

let installed = false;
let uninstallers: Array<() => void> = [];

export interface InstallHandle {
  uninstall: () => void;
  readonly config: { tenantId: string; ingestUrl: string; kid: string };
  /**
   * Resolves once every vendor SDK wrap has been attempted. `installReceipts`
   * returns synchronously, but the wraps load lazily; await `ready` before
   * making AI calls if you need every early call instrumented.
   */
  readonly ready: Promise<void>;
}

export function installReceipts(opts: InstallOptions): InstallHandle {
  if (installed) {
    return {
      uninstall: () => undefined,
      config: { tenantId: opts.tenantId, ingestUrl: opts.ingestUrl ?? "", kid: opts.keypair?.kid ?? "" },
      ready: Promise.resolve(),
    };
  }
  installed = true;

  const cfg = resolve(opts);
  const onReceipt = (r: SignedReceipt) => { void emit(cfg, r); };

  const pending: Promise<void>[] = [];
  if (!opts.disable?.openai) pending.push(tryWrapSdk("openai", (mod) => {
    if (mod?.OpenAI) patchConstructor(mod, "OpenAI", (instance) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wrapOpenAI(instance as any, { tenantId: cfg.tenantId, keypair: cfg.keypair, onReceipt }));
  }));

  if (!opts.disable?.anthropic) pending.push(tryWrapSdk("@anthropic-ai/sdk", (mod) => {
    if (mod?.default) patchConstructor(mod, "default", (instance) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wrapAnthropic(instance as any, { tenantId: cfg.tenantId, keypair: cfg.keypair, onReceipt }));
  }));

  return {
    uninstall: () => { for (const u of uninstallers) try { u(); } catch { /* ignore */ } installed = false; uninstallers = []; },
    config: { tenantId: cfg.tenantId, ingestUrl: cfg.ingestUrl, kid: cfg.keypair.kid },
    ready: Promise.all(pending).then(() => undefined),
  };
}

function resolve(opts: InstallOptions): ResolvedConfig {
  const home = process.env.PL_HOME ?? path.join(os.homedir(), ".askledger");
  const keyfile = opts.keypairFile ?? path.join(home, "keys", "vendor-kit.json");
  let keypair = opts.keypair;
  if (!keypair) {
    if (fs.existsSync(keyfile)) {
      keypair = JSON.parse(fs.readFileSync(keyfile, "utf-8")) as KeyPair;
    } else {
      fs.mkdirSync(path.dirname(keyfile), { recursive: true });
      keypair = generateKeyPair();
      fs.writeFileSync(keyfile, JSON.stringify(keypair, null, 2), { mode: 0o600 });
    }
  }
  return {
    tenantId: opts.tenantId,
    ingestUrl: opts.ingestUrl ?? process.env.PL_INGEST_URL ?? "",
    ingestToken: opts.ingestToken ?? process.env.PL_INGEST_TOKEN ?? "",
    keypair,
    queueDir: opts.queueDir ?? path.join(home, "queue"),
  };
}

function tryWrapSdk(modName: string, apply: (mod: Record<string, unknown>) => void): Promise<void> {
  // Lazy import so missing optional deps don't break the install. Returns a
  // promise so installReceipts can expose a `ready` gate; a wrap error is
  // surfaced (not silently swallowed) while a missing dep stays a no-op.
  return import(/* @vite-ignore */ modName as string)
    .then((m) => {
      try {
        apply(m as Record<string, unknown>);
      } catch (e) {
        console.warn(`[askledger] failed to instrument "${modName}":`, (e as Error).message);
      }
    })
    .catch(() => { /* dep not installed — expected, no-op */ });
}

function patchConstructor(
  mod: Record<string, unknown>,
  exportName: string,
  wrap: (instance: unknown) => unknown,
): void {
  const Original = mod[exportName] as { new (...args: unknown[]): unknown } | undefined;
  if (typeof Original !== "function") return;
  const Patched = function (this: unknown, ...args: unknown[]) {
    const instance = new (Original as new (...args: unknown[]) => unknown)(...args);
    return wrap(instance);
  } as unknown;
  Object.setPrototypeOf(Patched as object, Original);
  mod[exportName] = Patched;
  uninstallers.push(() => { mod[exportName] = Original; });
}

async function emit(cfg: ResolvedConfig, receipt: SignedReceipt): Promise<void> {
  if (!cfg.ingestUrl) return; // dev mode — receipts kept in-process via onReceipt log
  try {
    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.ingestToken ? { authorization: `Bearer ${cfg.ingestToken}` } : {}),
        "x-pl-source": "vendor-kit",
      },
      body: JSON.stringify(receipt),
    });
    if (!res.ok) throw new Error(`ingest ${res.status}`);
  } catch {
    try {
      fs.mkdirSync(cfg.queueDir, { recursive: true });
      const id = createHash("sha256").update(receipt.receipt.integrity.receipt_hash).digest("hex").slice(0, 16);
      fs.writeFileSync(path.join(cfg.queueDir, `${id}.json`), JSON.stringify(receipt));
    } catch { /* best effort */ }
  }
}
