import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";

/**
 * GET /api/receipts?from=&to=&vendor=&model=&classification=&decision=
 *
 * Lists receipts for the current tenant. Production wires this to the
 * Postgres ChainStateStore + receipts table; the stub returns demo data
 * so the UI works end-to-end during development.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  requirePermission(session, "receipts.read");

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 500);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  // Production: const rows = await db.query("SELECT ... WHERE tenant_id = $1 LIMIT $2 OFFSET $3", [session.tenantId, limit, offset]);
  const demoRows = Array.from({ length: limit }, (_, i) => ({
    receipt_id: `01J9X8VK${(2300 - offset - i).toString(16).toUpperCase().padStart(4, "0")}`,
    tenant_id: session.tenantId,
    captured_at: new Date(Date.now() - (offset + i) * 60_000).toISOString(),
    event_type: i % 3 === 0 ? "agent.tool_call" : "gateway.request",
    ai_vendor: i % 2 === 0 ? "anthropic" : "openai",
    ai_model: i % 2 === 0 ? "claude-sonnet-4-6" : "gpt-5",
    decision: i === 5 ? "block" : "allow",
    chain_height: 12487 - offset - i,
    receipt_hash: cryptoLikeHash(),
  }));

  return NextResponse.json(
    {
      items: demoRows,
      pagination: { limit, offset, has_more: offset + limit < 12487, total: 12487 },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function cryptoLikeHash() {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 64; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}
