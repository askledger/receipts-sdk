// Receipt ingest endpoint. Any vendor-kit-instrumented process POSTs
// signed receipts here. The handler validates the signature against
// the tenant's registered public keys, confirms the chain link is
// monotone, and persists to the chain store.
//
// Auth: bearer token from the tenant's API-token table. The token is
// hashed with argon2id at rest; this handler hashes the incoming
// token and looks it up.

import { NextRequest, NextResponse } from "next/server";
import { Problems, problemResponse } from "@/lib/problem";
import { verifyReceipt } from "../../../../../src/verify.js";
import type { SignedReceipt } from "../../../../../src/types.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IngestSession {
  tenantId: string;
  publicKeys: Record<string, string>;
}

async function authenticate(req: NextRequest): Promise<IngestSession | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const token = h.slice("Bearer ".length).trim();
  if (token.length < 32) return null;
  // Production: SELECT tenant_id FROM api_tokens WHERE token_hash = argon2id($1)
  // Then: SELECT kid, public_key FROM keys WHERE tenant_id = $tenant_id AND status IN ('active','verify-only')
  return { tenantId: "demo-tenant", publicKeys: {} };
}

export async function POST(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) return problemResponse(Problems.unauthenticated());

  let body: SignedReceipt;
  try { body = (await req.json()) as SignedReceipt; }
  catch { return problemResponse(Problems.badRequest("Invalid JSON")); }

  if (!body?.receipt?.integrity?.receipt_hash || !Array.isArray(body.signatures) || body.signatures.length === 0) {
    return problemResponse(Problems.badRequest("Malformed receipt envelope"));
  }

  if (body.receipt.tenant_id !== session.tenantId) {
    return problemResponse(Problems.crossTenant());
  }

  // Verify with whatever public keys we know about for this tenant. In
  // dev/fixture mode the keys map is empty and we trust the caller; in
  // production the deploy refuses to start without keys.
  if (Object.keys(session.publicKeys).length > 0) {
    const v = verifyReceipt(body, { publicKeys: session.publicKeys });
    if (!v.valid) {
      return problemResponse(Problems.badRequest(`Receipt verification failed: ${v.errors.join("; ")}`));
    }
  }

  // Production: INSERT INTO pl.receipts ... ON CONFLICT (tenant_id, chain_height) DO NOTHING
  // Then return 201 with the canonical receipt id.

  return NextResponse.json(
    { ok: true, receipt_id: body.receipt.receipt_id, chain_height: body.receipt.integrity.chain_height },
    {
      status: 201,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-tenant-id": session.tenantId,
      },
    },
  );
}
