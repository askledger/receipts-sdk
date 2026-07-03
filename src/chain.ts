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
import { type ChainState, GENESIS_HASH } from "./types.js";

const STATE_DIR = ".ledger/chains";

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function pathFor(tenantId: string): string {
  // Sanitize: only allow alphanumerics + dashes
  const safe = tenantId.replace(/[^a-zA-Z0-9-]/g, "_");
  return path.join(STATE_DIR, `${safe}.json`);
}

/**
 * Load the chain state for a tenant, creating a genesis state if none exists.
 */
export function loadChainState(tenantId: string): ChainState {
  const filepath = pathFor(tenantId);
  if (!fs.existsSync(filepath)) {
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
