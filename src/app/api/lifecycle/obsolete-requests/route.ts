import { NextResponse } from "next/server";
import { requestNumberingObsoleteApprovalAsync, requestRootObsoleteApprovalAsync } from "@/lib/numbering-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildNumberingFormalRecordLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { isProductionNumberingLifecycleGateOpen, productionSliceDeniedPayload, isProductionSliceEnforced } from "@/lib/production-slice";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import type { RequestNumberingObsoleteApprovalInput } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const entityTypeMap = new Map<string, RequestNumberingObsoleteApprovalInput["entityType"]>([
  ["part_number", "part_number"],
  ["numbering_part_number", "part_number"],
  ["drawing_number", "drawing_number"],
  ["numbering_drawing_number", "drawing_number"]
]);

type ObsoleteEntityType = RequestNumberingObsoleteApprovalInput["entityType"] | "part_root";

const extendedEntityTypeMap = new Map<string, ObsoleteEntityType>([
  ...entityTypeMap,
  ["part_root", "part_root"],
  ["numbering_part_root", "part_root"]
]);

function obsoleteActionCode(entityType: ObsoleteEntityType) {
  if (entityType === "part_root") return "obsolete_part_root";
  return entityType === "part_number" ? "obsolete_part_number" : "obsolete_ma_drawing";
}

function errorStatus(message: string) {
  if (message.includes("PERMISSION")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (
    message.includes("LIFE_OBSOLETE_ALREADY_REQUESTED") ||
    message.includes("LIFE_OBSOLETE_ALREADY_APPROVED") ||
    message.includes("LIFE_OBSOLETE_NOT_FORMAL") ||
    message.includes("LIFE_OBSOLETE_NOT_ELIGIBLE") ||
    message.includes("LIFE_ROOT_MIXED_OR_TERMINAL") ||
    message.includes("ROOT_OBSOLETE_SNAPSHOT_STALE") ||
    message.includes("MISMATCH")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  if (isProductionSliceEnforced() && !isProductionNumberingLifecycleGateOpen("formal-obsolete")) {
    return NextResponse.json(productionSliceDeniedPayload("lifecycle.obsolete-requests"), { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const entityTypeText = String(body.entityType ?? body.entity_type ?? "").trim();
  const entityType = extendedEntityTypeMap.get(entityTypeText);
  const reason = String(body.reason ?? "").trim();

  if (!entityType) {
    return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "OBSOLETE_REASON_REQUIRED", message: "請填寫作廢原因。" }, { status: 400 });
  }

  const actionCode = obsoleteActionCode(entityType);
  const auth = await requireNumberingActionAsync(request, actionCode, { actionCode });
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    if (entityType === "part_root") {
      const result = await requestRootObsoleteApprovalAsync({
        companyId: companyResult.company.companyId,
        rootId: String(body.entityId ?? body.entity_id ?? "").trim() || undefined,
        rootCode: String(body.entityCode ?? body.entity_code ?? body.rootCode ?? body.root_code ?? "").trim() || undefined,
        reason,
        requestedBy: auth.user.id,
        projectCode: String(body.projectCode ?? body.project_code ?? "").trim() || undefined,
        idempotencyKey: idempotencyKey?.trim()
      });
      return NextResponse.json(
        {
          approvalRequest: result.approvalRequest,
          approvalBatch: result.approvalBatch,
          impact: result.impact,
          policy: {
            entityType: "numbering_part_root",
            entityId: result.impact.root.id,
            action: "obsolete",
            requiresApproval: true,
            pendingObsoleteRequest: true
          },
          pdmCompany: companyResult.company
        },
        { status: 201 }
      );
    }

    const result = await requestNumberingObsoleteApprovalAsync({
      companyId: companyResult.company.companyId,
      entityType,
      entityId: String(body.entityId ?? body.entity_id ?? "").trim() || undefined,
      entityCode: String(body.entityCode ?? body.entity_code ?? body.partNumber ?? body.part_number ?? body.drawingNumber ?? body.drawing_number ?? "").trim() || undefined,
      reason,
      requestedBy: auth.user.id,
      projectCode: String(body.projectCode ?? body.project_code ?? "").trim() || undefined,
      idempotencyKey: idempotencyKey?.trim()
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
