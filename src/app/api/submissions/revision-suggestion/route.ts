import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import {
  createRevisionSuggestion,
  isUnsupportedPhase1RevisionWorkflowIntent,
  normalizeRevisionWorkflowIntent,
  type RevisionWorkflowIntent
} from "@/lib/revision-policy-engine";
import { listSubmissionRevisionsByDrawingAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return handleRevisionSuggestionRequest(request, body);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleRevisionSuggestionRequest(request, {
    drawingNumber: url.searchParams.get("drawingNumber") ?? url.searchParams.get("drawing_number"),
    workflowIntent: url.searchParams.get("workflowIntent") ?? url.searchParams.get("workflow_intent"),
    lifecycleStage: url.searchParams.get("lifecycleStage") ?? url.searchParams.get("lifecycle_stage")
  });
}

async function handleRevisionSuggestionRequest(request: Request, input: Record<string, unknown>) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const drawingNumber = String(input.drawingNumber ?? input.drawing_number ?? "").trim();
  if (!drawingNumber) {
    return NextResponse.json({ error: "drawing_number_required" }, { status: 400 });
  }

  const requestedWorkflowIntent = String(input.workflowIntent ?? input.workflow_intent ?? input.lifecycleStage ?? input.lifecycle_stage ?? "release_area");
  if (isUnsupportedPhase1RevisionWorkflowIntent(requestedWorkflowIntent)) {
    return NextResponse.json(
      {
        error: "conditional_use_not_supported_in_phase_1",
        code: "conditional_use_not_supported_in_phase_1",
        message: "Phase 1 尚未開放緊急使用版次，請使用研發版次或正式整數版次。"
      },
      { status: 400 }
    );
  }
  const workflowIntent: RevisionWorkflowIntent = normalizeRevisionWorkflowIntent(requestedWorkflowIntent, "release_area");

  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const revisions = await listSubmissionRevisionsByDrawingAsync({
    companyId: companyResult.company.companyId,
    drawingNumber
  });
  const suggestion = createRevisionSuggestion({
    companyId: companyResult.company.companyId,
    drawingNumber,
    workflowIntent,
    revisions
  });

  return NextResponse.json({
    drawingNumber,
    workflowIntent,
    lifecycleStage: workflowIntent,
    suggestedRevision: suggestion.suggestedRevision,
    suggestedRevisionCode: suggestion.suggestedRevision,
    policyVersion: suggestion.policyVersion,
    basisHash: suggestion.basisHash,
    reasonCodes: suggestion.reasonCodes,
    generatedAt: suggestion.generatedAt,
    revisionCount: revisions.length,
    revisionPolicySuggestion: suggestion,
    policy: {
      format: "numeric-major-or-minor",
      examples: ["1", "2", "0.1", "1.1"],
      allowVPrefix: false,
      editable: true,
      version: suggestion.policyVersion
    }
  });
}
