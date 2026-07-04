/**
 * AskLedger Chrome Extension · service worker.
 *
 * Maintains the keypair (local-only by default), signs receipts the
 * content scripts produce, persists them to chrome.storage.local, and
 * (optionally) ships them to a configured corporate ingest endpoint.
 *
 * Crypto: imports @noble/ed25519 + @noble/hashes + canonicalize from
 * bundled vendor files (Manifest V3 forbids remote scripts).
 *
 * Privacy: the signing key and receipts are held in chrome.storage.local —
 * the browser's per-extension sandboxed store, not readable by web pages or
 * other extensions. They are NOT additionally app-encrypted at rest today
 * (an optional passphrase-wrapped key is a planned enhancement). By default
 * NO data leaves the browser.
 */

import { sha256 } from "./vendor/noble-hashes-sha256.js";
import { sha512 } from "./vendor/noble-hashes-sha512.js";
import * as ed from "./vendor/noble-ed25519.js";
import canonicalize from "./vendor/canonicalize.js";

function concatBytes(...arrs) {
  let n = 0; for (const a of arrs) n += a.length;
  const out = new Uint8Array(n); let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));

const GENESIS = "0".repeat(64);
const STORE_KEY = { PRIVATE: "pl.priv", CHAIN: "pl.chain", RECEIPTS: "pl.receipts", SETTINGS: "pl.settings" };

function hex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join(""); }
function b64(b) { return btoa(String.fromCharCode(...b)); }
function b64dec(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function canonicalBytes(v) { return new TextEncoder().encode(canonicalize(v)); }

async function ensureKey() {
  const stored = await chrome.storage.local.get(STORE_KEY.PRIVATE);
  if (stored[STORE_KEY.PRIVATE]) return b64dec(stored[STORE_KEY.PRIVATE]);
  const priv = ed.utils.randomPrivateKey();
  await chrome.storage.local.set({ [STORE_KEY.PRIVATE]: b64(priv) });
  return priv;
}

async function loadChain() {
  const r = await chrome.storage.local.get(STORE_KEY.CHAIN);
  return r[STORE_KEY.CHAIN] ?? { chain_height: 0, previous_receipt_hash: GENESIS };
}

async function saveChain(state) {
  await chrome.storage.local.set({ [STORE_KEY.CHAIN]: state });
}

async function appendReceipt(receipt) {
  const r = await chrome.storage.local.get(STORE_KEY.RECEIPTS);
  const list = r[STORE_KEY.RECEIPTS] ?? [];
  list.unshift(receipt);
  if (list.length > 1000) list.length = 1000;       // cap local storage
  await chrome.storage.local.set({ [STORE_KEY.RECEIPTS]: list });
}

async function signReceipt(event) {
  const priv = await ensureKey();
  const pub = await ed.getPublicKeyAsync(priv);
  const prev = await loadChain();

  const receipt = {
    schema_version: "1.0",
    receipt_id: "ext-" + crypto.randomUUID(),
    tenant_id: event.tenant_id,
    issued_at: new Date().toISOString(),
    event,
    integrity: {
      previous_receipt_hash: prev.previous_receipt_hash,
      receipt_hash: "",
      chain_height: prev.chain_height + 1,
    },
  };
  const canonForHash = canonicalBytes(receipt);
  const rhash = hex(sha256(canonForHash));
  receipt.integrity.receipt_hash = rhash;
  const canonSig = canonicalBytes(receipt);
  const sig = await ed.signAsync(canonSig, priv);

  const signed = {
    receipt,
    signatures: [{ alg: "EdDSA", kid: "extension-" + hex(pub).slice(0, 8), sig: b64(sig) }],
    public_key: b64(pub),
  };
  await saveChain({ chain_height: prev.chain_height + 1, previous_receipt_hash: rhash });
  await appendReceipt(signed);

  // Optional: ship to corporate ingest if configured
  const s = (await chrome.storage.local.get(STORE_KEY.SETTINGS))[STORE_KEY.SETTINGS] ?? {};
  if (s.corporate_ingest_url && s.consent_to_ship) {
    fetch(s.corporate_ingest_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    }).catch(() => {});
  }
  return signed;
}

// Message trust boundary. There is no `externally_connectable`, so onMessage
// only ever receives from THIS extension's own contexts: content scripts
// (which carry sender.tab) or our own extension pages — popup/options (no
// sender.tab). Content scripts may only sign / read the public key. Reading
// or clearing the stored receipt history is restricted to our own extension
// pages, so a compromised or malicious in-page context on a matched site
// cannot exfiltrate the prompt-hash history or wipe the chain.
function fromOwnExtension(sender) {
  return sender != null && sender.id === chrome.runtime.id;
}
function fromExtensionPage(sender) {
  return (
    fromOwnExtension(sender) &&
    !sender.tab &&
    typeof sender.url === "string" &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  // Anything not from our own extension is refused outright.
  if (!fromOwnExtension(sender)) {
    send({ ok: false, error: "unauthorized sender" });
    return false;
  }

  switch (msg && msg.type) {
    case "pl.sign": // content scripts + extension pages
      signReceipt(msg.event).then((r) => send({ ok: true, receipt: r }));
      return true; // async

    case "pl.pubkey": // public data — any own-extension context
      ensureKey().then(ed.getPublicKeyAsync).then((p) => send({ public_key: b64(p) }));
      return true;

    case "pl.list": // sensitive: full receipt history — extension pages only
      if (!fromExtensionPage(sender)) { send({ ok: false, error: "forbidden" }); return false; }
      chrome.storage.local.get(STORE_KEY.RECEIPTS).then((r) => send({ receipts: r[STORE_KEY.RECEIPTS] ?? [] }));
      return true;

    case "pl.clear": // destructive: wipes the chain — extension pages only
      if (!fromExtensionPage(sender)) { send({ ok: false, error: "forbidden" }); return false; }
      chrome.storage.local
        .set({ [STORE_KEY.RECEIPTS]: [], [STORE_KEY.CHAIN]: { chain_height: 0, previous_receipt_hash: GENESIS } })
        .then(() => send({ ok: true }));
      return true;

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[AskLedger] extension installed");
  ensureKey();
});
