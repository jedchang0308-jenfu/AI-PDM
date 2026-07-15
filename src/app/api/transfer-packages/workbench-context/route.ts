import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { getTransferPackageWorkbenchContext } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireTransferPackageAccessAsync(request, undefined, "transfer.package.create");
  if (access.response) return access.response;
  const url = new URL(request.url);
  try {
    const context = await getTransferPackageWorkbenchContext({
      companyId: access.company.companyId,
      sourceType: url.searchParams.get("sourceType"),
      sourceId: url.searchParams.get("sourceId"),
      caseType: url.searchParams.get("caseType")
    });
    return numberStateFlowJson({ context, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包建立脈絡讀取失敗。");
  }
}
