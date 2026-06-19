import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getPartModuleDetailAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts, redactPartDetailCosts } from "@/lib/part-cost-visibility";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { partNumber } = await params;
  const part = await getPartModuleDetailAsync(decodeURIComponent(partNumber), companyResult.company.companyId);
  if (!part) {
    return NextResponse.json({ error: "Part number not found" }, { status: 404 });
  }
  return NextResponse.json({ part: redactPartDetailCosts(part, canViewPartCostAmounts(auth)) });
}
