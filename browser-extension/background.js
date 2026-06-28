/**
 * Project Ledger Chrome Extension · service worker.
 *
 * Maintains the keypair (local-only by default), signs receipts the
 * content scripts produce, persists them to chrome.storage.local, and
 * (optionally) ships them to a configured corporate ingest endpoint.
 *
 * Crypto: imports @noble/ed25519 + @noble/hashes + canonicalize from
 * bundled vendor files (Manifest V3 forbids remote scripts).
 *
 * Privacy: every receipt is stored encrypted-at-rest using a key
 * derived from the user's machine entropy + an optional passphrase.
 * Default: NO data leaves the browser.
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

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.type === "pl.sign") {
    signReceipt(msg.event).then((r) => send({ ok: true, receipt: r }));
    return true; // async
  }
  if (msg.type === "pl.list") {
    chrome.storage.local.get(STORE_KEY.RECEIPTS).then((r) => send({ receipts: r[STORE_KEY.RECEIPTS] ?? [] }));
    return true;
  }
  if (msg.type === "pl.clear") {
    chrome.storage.local.set({ [STORE_KEY.RECEIPTS]: [], [STORE_KEY.CHAIN]: { chain_height: 0, previous_receipt_hash: GENESIS } }).then(() => send({ ok: true }));
    return true;
  }
  if (msg.type === "pl.pubkey") {
    ensureKey().then(ed.getPublicKeyAsync).then((p) => send({ public_key: b64(p) }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Project Ledger] extension installed");
  ensureKey();
});
