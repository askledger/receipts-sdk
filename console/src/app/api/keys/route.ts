import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";

/**
 * GET /api/keys
 * Lists keys via the SDK's KeyRegistry persistence layer.
 */
export async function GET() {
  const session = await getSession();
  requirePermission(session, "keys.read");

  const { KeyRegistry } = await import("@askledger/receipts-sdk");
  // Production: hydrate from durable store, e.g. JSON in encrypted S3 / Postgres
  const reg = new KeyRegistry();
  return NextResponse.json(
    { items: reg.list() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
