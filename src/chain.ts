/**
 * Per-tenant append-only hash chain.
 *
 * Each tenant has a monotonically increasing chain. Each receipt's
 * `previous_receipt_hash` is the SHA-256 of the canonical bytes of the
 * receipt immediately before it in the same tenant's chain. The first
 * receipt in a tenant's chain points to GENESIS_HASH (all zeros).
 *
 * State is persisted in .ledger/chains/{tenant_id}.json. In production,
 * this lives in PostgreSQL with strict row-level security per tenant.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { type ChainState, GENESIS_HASH } from "./types.js";

const STATE_DIR = ".ledger/chains";

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

/** The pre-0.12.6 filename. Read-only, for one-time adoption of existing state. */
function legacyPathFor(tenantId: string): string {
  return path.join(STATE_DIR, `${tenantId.replace(/[^a-zA-Z0-9-]/g, "_")}.json`);
}

function pathFor(tenantId: string): string {
  // The sanitized name is for human readability only. It is NOT injective:
  // "acme.corp", "acme/corp" and "acme_corp" all collapse to "acme_corp", so
  // two tenants shared one state file and therefore one hash chain. Tenant
  // isolation is the property this module exists to provide, and a shared
  // chain breaks it silently, with each tenant's receipts landing in the
  // other's chain. A digest of the RAW id disambiguates; the readable prefix
  // is capped so long ids cannot blow the filesystem name limit.
  const safe = tenantId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 64);
  const digest = createHash("sha256").update(tenantId, "utf8").digest("hex").slice(0, 16);
  return path.join(STATE_DIR, `${safe}-${digest}.json`);
}

/**
 * Load the chain state for a tenant, creating a genesis state if none exists.
 */
export function loadChainState(tenantId: string): ChainState {
  const filepath = pathFor(tenantId);
  if (!fs.existsSync(filepath)) {
    // Adopt state written under the old, collision-prone filename, but ONLY
    // when the file's recorded tenant_id matches exactly. If it belongs to a
    // tenant that merely sanitized to the same name, we must not inherit its
    // chain; that tenant keeps the legacy file and this one starts at genesis.
    const legacy = legacyPathFor(tenantId);
    if (fs.existsSync(legacy)) {
      const prior = JSON.parse(fs.readFileSync(legacy, "utf-8")) as ChainState;
      if (prior.tenant_id === tenantId) return prior;
    }
    return {
      tenant_id: tenantId,
      chain_height: 0,
      previous_receipt_hash: GENESIS_HASH,
      updated_at: new Date().toISOString(),
    };
  }
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as ChainState;
}

/**
 * Persist updated chain state for a tenant.
 */
export function saveChainState(state: ChainState): void {
  ensureDir(STATE_DIR);
  fs.writeFileSync(pathFor(state.tenant_id), JSON.stringify(state, null, 2));
}

/**
 * Advance the chain: compute the next state given the previous state and the
 * hash of the new receipt.
 */
export function advanceChain(
  previousState: ChainState,
  newReceiptHash: string,
  newReceiptId: string
): ChainState {
  return {
    tenant_id: previousState.tenant_id,
    chain_height: previousState.chain_height + 1,
    previous_receipt_hash: newReceiptHash,
    last_receipt_id: newReceiptId,
    updated_at: new Date().toISOString(),
  };
}
