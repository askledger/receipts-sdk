import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";

/**
 * POST /api/receipts/verify
 *
 * Body: { signed: SignedReceipt, publicKeys: Record<kid, base64>, previous?: SignedReceipt }
 *
 * Performs server-side independent verification using the SDK. Mirrors
 * what the public verifier does client-side, but is RBAC-gated for the
 * console use case.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  requirePermission(session, "receipts.read");

  let body: { signed: unknown; publicKeys: Record<string, string>; previous?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Dynamic import so the SDK is only resolved when the route is hit
  const { verifyReceipt } = await import("@askledger/receipts-sdk");
  try {
    const result = verifyReceipt(
      body.signed as Parameters<typeof verifyReceipt>[0],
      {
        publicKeys: body.publicKeys,
        previousReceipt: body.previous as Parameters<typeof verifyReceipt>[1]["previousReceipt"],
      }
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
