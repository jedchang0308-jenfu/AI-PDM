import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { listPendingBomWorkbenchReviewsAsync } from "@/lib/bom-workbench-async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  return NextResponse.json({ reviews: await listPendingBomWorkbenchReviewsAsync() });
}
