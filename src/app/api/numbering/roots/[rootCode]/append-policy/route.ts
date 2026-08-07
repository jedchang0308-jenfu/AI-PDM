import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync } from "@/lib/numbering-async";
import {
  formatDrawingNumberForRule,
  formatDrawingSequenceForRule,
  formatPartNumberForRule,
  formatPartSequenceForRule
} from "@/lib/numbering-identity";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const detail = await getNumberingRootDetailAsync(decodeURIComponent(rootCode), companyResult.company.companyId);
  if (!detail) return NextResponse.json({ error: "PART_ROOT_NOT_FOUND" }, { status: 404 });

  const ruleVersionId = detail.root.ruleVersionId;
  const nextPartSequence = nextSequence(detail.partNumbers.map((part) => part.sequenceNo));
  const nextMSequence = nextSequence(detail.drawingNumbers.filter((drawing) => drawing.purposeCode === "M").map((drawing) => drawing.sequenceNo));
  const nextRSequence = nextSequence(detail.drawingNumbers.filter((drawing) => drawing.purposeCode === "R").map((drawing) => drawing.sequenceNo));
  const reasonRequired = [detail.root.recordStatus, ...detail.partNumbers.map((part) => part.recordStatus), ...detail.drawingNumbers.map((drawing) => drawing.recordStatus)].some(
    (status) => status === "Active" || status === "Released" || status === "MainDrawingInvalid"
  );
  const locked = ["Obsolete", "Merged"].includes(detail.root.recordStatus);

  return NextResponse.json({
    root: detail.root,
    counts: detail.summary,
    locked,
    reasonRequired,
    nextNumbers: {
      part: formatPartNumberForRule(detail.root.rootCode, formatPartSequenceForRule(nextPartSequence, ruleVersionId), ruleVersionId),
      drawingM: formatDrawingNumberForRule(detail.root.rootCode, "M", formatDrawingSequenceForRule(nextMSequence, ruleVersionId), ruleVersionId),
      drawingR: formatDrawingNumberForRule(detail.root.rootCode, "R", formatDrawingSequenceForRule(nextRSequence, ruleVersionId), ruleVersionId)
    },
    pdmCompany: companyResult.company
  });
}

function nextSequence(values: number[]) {
  return values.length === 0 ? 1 : Math.max(...values) + 1;
}
