import { NextResponse } from "next/server";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";
import { getStorageEvidenceDashboard } from "@/lib/storage-evidence-dashboard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/storage/evidence/route.ts", "settings.storage_evidence.view");
  if (authorization instanceof Response) return authorization;

  const dashboard = await getStorageEvidenceDashboard();
  return NextResponse.json(dashboard, { headers: { "cache-control": "private, no-store" } });
}
