import { NextResponse } from "next/server";
import { withPrincipalIdentityOnlyShareRoute } from "@/lib/principal-readonly-share";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  await params;
  return withPrincipalIdentityOnlyShareRoute(request,
    "src/app/api/public/shares/[token]/responses/route.ts", async () =>
      NextResponse.json({
        code: "supplier_reply_policy_unavailable",
        availability: "DEFERRED_DEV122_POLICY_NOT_RETIRED"
      }, { status: 503, headers: { "cache-control": "no-store" } }));
}
