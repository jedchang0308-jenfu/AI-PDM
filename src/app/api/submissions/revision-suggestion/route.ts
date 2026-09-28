import { NextResponse } from "next/server";
import { parsePdmCompanyRequest, requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { AsyncSubmissionWriteRepository } from "@/lib/repositories/submission-write-async-repository";
import {
  createRevisionSuggestion,
  isUnsupportedPhase1RevisionWorkflowIntent,
  normalizeRevisionWorkflowIntent,
  type RevisionWorkflowIntent
} from "@/lib/revision-policy-engine";

export const runtime = "nodejs";

const routePath = "src/app/api/submissions/revision-suggestion/route.ts";
const noStore = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  return handleRevisionSuggestionRequest(request, "POST");
}

export async function GET(request: Request) {
  return handleRevisionSuggestionRequest(request, "GET");
}

async function handleRevisionSuggestionRequest(request: Request, method: "GET" | "POST") {
  const policy = resolveJenfuRoutePolicy(routePath, method,
    { expectedPermissionCode: "submission.create" });
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "submission company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: noStore });
  }
  const response = await withPrincipalCompanyRead(request,
    requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "submission.create" }],
    async (snapshot, company) => {
      const input = method === "GET"
        ? Object.fromEntries(new URL(request.url).searchParams.entries())
        : await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return NextResponse.json({ code: "revision_suggestion_input_invalid" },
          { status: 400, headers: noStore });
      }
      const body = input as Record<string, unknown>;
      const bodyCompany = parsePdmCompanyRequest(body.pdm_company_code ?? body.pdmCompanyCode);
      if (bodyCompany.state === "invalid" ||
          (bodyCompany.state === "valid" && bodyCompany.companyCode !== company.companyCode)) {
        return NextResponse.json({ code: "entitlement_scope_mismatch" },
          { status: 403, headers: noStore });
      }
      const drawingNumber = String(body.drawingNumber ?? body.drawing_number ?? "").trim();
      if (!drawingNumber) {
        return NextResponse.json({ error: "drawing_number_required" },
          { status: 400, headers: noStore });
      }
      const requestedWorkflowIntent = String(body.workflowIntent ?? body.workflow_intent ??
        body.lifecycleStage ?? body.lifecycle_stage ?? "release_area");
      if (isUnsupportedPhase1RevisionWorkflowIntent(requestedWorkflowIntent)) {
        return NextResponse.json({
          error: "conditional_use_not_supported_in_phase_1",
          code: "conditional_use_not_supported_in_phase_1",
          message: "Phase 1 尚未開放緊急使用版次，請使用研發版次或正式整數版次。"
        }, { status: 400, headers: noStore });
      }
      const workflowIntent: RevisionWorkflowIntent = normalizeRevisionWorkflowIntent(
        requestedWorkflowIntent, "release_area");
      const revisions = await new AsyncSubmissionWriteRepository(snapshot)
        .listSubmissionRevisionsByDrawing({ companyId: company.companyId, drawingNumber });
      const suggestion = createRevisionSuggestion({
        companyId: company.companyId, drawingNumber, workflowIntent, revisions
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
      }, { headers: noStore });
    });
  return response ?? NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: noStore });
}
