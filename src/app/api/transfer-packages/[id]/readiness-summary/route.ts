import { NextResponse } from "next/server";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { buildTransferPackageReadinessSummary, getTransferPackageWorkbench } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireTransferPackageAccessAsync(request);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await getTransferPackageWorkbench(id, access.company.companyId);
    return NextResponse.json({ readiness: buildTransferPackageReadinessSummary(workbench), pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包阻擋摘要讀取失敗。");
  }
}
