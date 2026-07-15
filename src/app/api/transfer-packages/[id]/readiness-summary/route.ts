import { NextResponse } from "next/server";
import { requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { buildTransferPackageReadiness } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireNumberStateReadAccessAsync(request, "transfer.package.view");
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const readiness = await buildTransferPackageReadiness(id, access.company.companyId);
    return NextResponse.json({ readiness, pdmCompany: access.company }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return transferPhase1dErrorResponse(error, "readiness");
  }
}
