import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { resolvePartCostAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts } from "@/lib/part-cost-visibility";
import type { PartCostType } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const costTypes = new Set(["outsourced", "in_house", "purchase", "trial", "other"]);

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { partNumber } = await params;
  const url = new URL(request.url);
  const quantity = Number(url.searchParams.get("quantity") ?? "1");
  const costTypeParam = url.searchParams.get("costType");
  const costType = costTypeParam && costTypes.has(costTypeParam) ? (costTypeParam as PartCostType) : undefined;

  try {
    const resolution = await resolvePartCostAsync({
      companyId: companyResult.company.companyId,
      partNumber: decodeURIComponent(partNumber),
      quantity,
      costType,
      asOf: url.searchParams.get("asOf")
    });
    if (!canViewPartCostAmounts(auth)) {
      return NextResponse.json({
        resolution: {
          ...resolution,
          unitCost: null,
          setupCost: null,
          extendedCost: null,
          tier: { ...resolution.tier, unitCost: null, setupCost: null }
        }
      });
    }
    return NextResponse.json({ resolution });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PART_COST_RESOLUTION_FAILED" }, { status: 400 });
  }
}
