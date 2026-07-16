import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { suggestRevisionCode, type RevisionLifecycleStage } from "@/lib/revision-policy";
import { listSubmissionRevisionsByDrawingAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

const lifecycleStages = new Set<RevisionLifecycleStage>(["rd_workspace", "release_area", "design_change_workspace"]);

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const drawingNumber = String(url.searchParams.get("drawingNumber") ?? url.searchParams.get("drawing_number") ?? "").trim();
  if (!drawingNumber) {
    return NextResponse.json({ error: "drawing_number_required" }, { status: 400 });
  }

  const requestedStage = String(url.searchParams.get("lifecycleStage") ?? url.searchParams.get("lifecycle_stage") ?? "release_area");
  const lifecycleStage: RevisionLifecycleStage = lifecycleStages.has(requestedStage as RevisionLifecycleStage)
    ? (requestedStage as RevisionLifecycleStage)
    : "release_area";

  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const revisions = await listSubmissionRevisionsByDrawingAsync({
    companyId: companyResult.company.companyId,
    drawingNumber
  });

  return NextResponse.json({
    drawingNumber,
    lifecycleStage,
    suggestedRevisionCode: suggestRevisionCode(revisions, lifecycleStage),
    revisionCount: revisions.length,
    policy: {
      format: "numeric-major-or-minor",
      examples: ["1", "2", "0.1", "1.1"],
      allowVPrefix: false,
      editable: true
    }
  });
}
