import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { scopedSubmittedBy } from "@/lib/permissions";
import { searchSubmissionsAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? undefined;
  const includeHistory = status === "Obsolete";
  const filters = {
    productLine: url.searchParams.get("productLine") ?? undefined,
    customer: url.searchParams.get("customer") ?? undefined,
    projectCode: url.searchParams.get("projectCode") ?? url.searchParams.get("project") ?? undefined,
    processName: url.searchParams.get("processName") ?? url.searchParams.get("process") ?? undefined,
    machine: url.searchParams.get("machine") ?? undefined,
    material: url.searchParams.get("material") ?? undefined,
    surfaceFinish: url.searchParams.get("surfaceFinish") ?? undefined,
    parentDrawing: url.searchParams.get("parentDrawing") ?? undefined,
    childDrawingNumber: url.searchParams.get("childDrawingNumber") ?? undefined,
    childPartNumber: url.searchParams.get("childPartNumber") ?? undefined,
    status
  };
  const hasFilters = Object.values(filters).some((value) => value?.trim());
  const submittedBy = scopedSubmittedBy(auth.user);

  if (query.length < 2 && !hasFilters) {
    return NextResponse.json({ pdmCompany: companyResult.company, submissions: [] });
  }

  return NextResponse.json({
    pdmCompany: companyResult.company,
    submissions: await searchSubmissionsAsync({
      query: query.length >= 2 ? query : "",
      status,
      filters,
      submittedBy,
      companyId: companyResult.company.companyId,
      includeHistory
    })
  });
}
