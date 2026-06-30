import { NextResponse } from "next/server";
import { requestNumberingObsoleteApprovalAsync } from "@/lib/numbering-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildNumberingFormalRecordLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import type { RequestNumberingObsoleteApprovalInput } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const entityTypeMap = new Map<string, RequestNumberingObsoleteApprovalInput["entityType"]>([
  ["part_number", "part_number"],
  ["numbering_part_number", "part_number"],
  ["drawing_number", "drawing_number"],
  ["numbering_drawing_number", "drawing_number"]
]);

function obsoleteActionCode(entityType: RequestNumberingObsoleteApprovalInput["entityType"]) {
  return entityType === "part_number" ? "obsolete_part_number" : "obsolete_ma_drawing";
}

function errorStatus(message: string) {
  if (message.includes("PERMISSION")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (
    message.includes("LIFE_OBSOLETE_ALREADY_REQUESTED") ||
    message.includes("LIFE_OBSOLETE_ALREADY_APPROVED") ||
    message.includes("LIFE_OBSOLETE_NOT_FORMAL") ||
    message.includes("MISMATCH")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const entityTypeText = String(body.entityType ?? body.entity_type ?? "").trim();
  const entityType = entityTypeMap.get(entityTypeText);
  const reason = String(body.reason ?? "").trim();

  if (!entityType) {
    return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const actionCode = obsoleteActionCode(entityType);
  const auth = await requireNumberingActionAsync(request, actionCode, { actionCode });
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    const result = await requestNumberingObsoleteApprovalAsync({
      companyId: companyResult.company.companyId,
      entityType,
      entityId: String(body.entityId ?? body.entity_id ?? "").trim() || undefined,
      entityCode: String(body.entityCode ?? body.entity_code ?? body.partNumber ?? body.part_number ?? body.drawingNumber ?? body.drawing_number ?? "").trim() || undefined,
      reason,
      requestedBy: auth.user.id,
      projectCode: String(body.projectCode ?? body.project_code ?? "").trim() || undefined
    });
    const policy = buildNumberingFormalRecordLifecyclePolicy({
      entityType: result.entity.entityType === "part_number" ? "numbering_part_number" : "numbering_drawing_number",
      entityId: result.entity.entityId,
      recordStatus: result.entity.recordStatus,
      pendingObsoleteRequest: true,
      canRequestObsolete: true
    });

    return NextResponse.json(
      {
        approvalRequest: result.approvalRequest,
        approvalBatch: result.approvalBatch,
        entity: result.entity,
        policy,
        pdmCompany: companyResult.company
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request lifecycle obsolete approval";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
