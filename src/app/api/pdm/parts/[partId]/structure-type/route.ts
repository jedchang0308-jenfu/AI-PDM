import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";
import { getPartStructureClassificationAsync, classifyPartStructureAsync } from "@/lib/part-structure-classification";
import { resolveRelationMatrixActor } from "@/lib/pdm-dev087-route";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const access = await resolveRelationMatrixActor(request);
  if (access.response || !access.actor) return access.response;
  const { partId } = await params;
  const client = getAsyncDatabaseClient();
  const data = await getPartStructureClassificationAsync({
    client,
    companyId: access.actor.companyId,
    partNumberId: decodeURIComponent(partId),
    canMutate: access.actor.canEditMatrix
  });
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "料號不存在" } }, { status: 404 });
  return NextResponse.json({
    data,
    meta: {
      contractToken: await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id })
    }
  }, { headers: { "cache-control": "private, no-store", etag: data.etag } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.workspace.update", body });
  if (access.response || !access.actor || !access.company || !access.metadata) return access.response;
  const client = getAsyncDatabaseClient();
  try {
    await verifyCanonicalWorkbenchCommandContract(client, {
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      token: request.headers.get("x-pdm-workbench-contract")
    });
    const { partId } = await params;
    const targetPartNumberIds = Array.isArray(body.targetPartNumberIds ?? body.target_part_number_ids)
      ? (body.targetPartNumberIds ?? body.target_part_number_ids) as unknown[]
      : [decodeURIComponent(partId)];
    const structureType = parseNumberingStructureType(body.structureType ?? body.structure_type);
    if (!structureType) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "結構型態必須是單一零件或組立件" } }, { status: 422 });
    const result = await classifyPartStructureAsync({
      client,
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      metadata: access.metadata,
      partNumberId: decodeURIComponent(partId),
      targetPartNumberIds: targetPartNumberIds.map((id) => String(id)),
      structureType,
      reason: String(body.reason ?? ""),
      ifMatch: request.headers.get("if-match") ?? ""
    });
    return NextResponse.json({ data: result.result, meta: { contractToken: await issueCanonicalWorkbenchContract(client, { companyId: access.company.companyId, actorId: access.actor.pdmUserId }) } }, {
      headers: { "cache-control": "private, no-store", etag: result.result.etag }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PART_STRUCTURE_CLASSIFICATION_FAILED";
    const status = message.includes("NOT_FOUND") || message.includes("SCOPE_INVALID") ? 404
      : message.includes("FORBIDDEN") || message.includes("NOT_ACTIVE") ? 403
        : message.includes("STALE") ? 412
          : message.includes("BOM_CONFLICT") || message.includes("INACTIVE") || message.includes("ROOT_MISMATCH") || message.includes("IN_PROGRESS") ? 409
          : message.includes("REQUIRED") || message.includes("LIMIT") || message.includes("VALIDATION") ? 422 : 400;
    return NextResponse.json({ error: { code: message, message: classificationErrorMessage(message) } }, { status, headers: { "cache-control": "private, no-store" } });
  }
}

function classificationErrorMessage(code: string) {
  if (code === "PART_STRUCTURE_STALE_ETAG") return "資料已更新，請重新載入後再試。";
  if (code === "PART_STRUCTURE_BOM_CONFLICT") return "已有目前、開啟中或已發布的 BOM，不能改為單一零件。";
  if (code === "PART_STRUCTURE_REASON_REQUIRED") return "批次分類或既有分類變更必須填寫原因。";
  if (code === "PART_STRUCTURE_TARGET_ROOT_MISMATCH") return "只能複選同一圖料根號下的料號。";
  if (code === "PART_STRUCTURE_TARGET_INACTIVE") return "包含不可修改的料號。";
  return code;
}
