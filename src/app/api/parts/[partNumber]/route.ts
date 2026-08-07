import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getPartModuleDetailAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts, redactPartDetailCosts } from "@/lib/part-cost-visibility";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectRoleViewerHumanStatus } from "@/lib/human-status-projection";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { projectPartAvailability } from "@/lib/availability-scope";

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
  const redactedPart = redactPartDetailCosts(part, canViewPartCostAmounts(auth));
  const humanStatus = projectPartHumanStatus(redactedPart);
  const viewerCapabilities = await resolveHumanStatusRoleCapabilitiesAsync(auth.user);
  return NextResponse.json({ part: {
    ...redactedPart,
    humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
    availabilityScope: projectPartAvailability(redactedPart)
  } }, {
    headers: { "cache-control": "private, no-store" }
  });
}
