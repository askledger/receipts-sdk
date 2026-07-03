import { withRoute } from "@/lib/route";
import { hrTeams } from "@/lib/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute("receipts.read", () => hrTeams);
