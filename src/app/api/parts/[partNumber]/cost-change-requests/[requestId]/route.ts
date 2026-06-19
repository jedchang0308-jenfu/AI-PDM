import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { decidePartCostChangeRequestAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts, redactPartDetailCosts } from "@/lib/part-cost-visibility";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ partNumber: string; requestId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.approval.batch.decide");
  if (auth.response) return auth.response;

  const { partNumber, requestId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const decision = String(body.decision ?? "").trim();
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  }

  try {
    const part = await decidePartCostChangeRequestAsync({
      companyId: companyResult.company.companyId,
      partNumber: decodeURIComponent(partNumber),
      requestId: decodeURIComponent(requestId),
      decision,
      reviewedBy: auth.user.id,
      reviewComment: stringOrNull(body.reviewComment ?? body.review_comment),
      basisQty: numberOrUndefined(body.basisQty ?? body.basis_qty)
    });
    if (!part) return NextResponse.json({ error: "Part number not found" }, { status: 404 });
    return NextResponse.json({ part: redactPartDetailCosts(part, canViewPartCostAmounts(auth)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PART_COST_CHANGE_REQUEST_DECISION_FAILED" }, { status: 400 });
  }
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return Number(value);
}
