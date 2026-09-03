import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getStorageEvidenceDashboard } from "@/lib/storage-evidence-dashboard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin", "R&D Manager"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dashboard = await getStorageEvidenceDashboard();
  return NextResponse.json(dashboard);
}
