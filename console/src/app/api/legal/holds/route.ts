import { withRoute } from "@/lib/route";
import { legalHolds } from "@/lib/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute("audit.read", () => legalHolds);
