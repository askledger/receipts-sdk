import { withRoute } from "@/lib/route";
import { complianceGaps } from "@/lib/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute("evidence.read", () => complianceGaps);
