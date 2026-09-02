import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync, resolveBomOwnerAccessContextAsync } from "@/lib/bom-create-context";
import {
  BomCreateIdempotencyConflictError,
  BomRevisionConflictError,
  createCanonicalBomDraftAsync,
  createSharedBomDraftAsync,
  getBomWorkbenchDraftByIdAsync,
  listBomWorkbenchRecordsAsync
} from "@/lib/bom-workbench-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { validateRevisionCode } from "@/lib/revision-policy";
import { canonicalSha256, SharedBomError } from "@/lib/bom-shared-structure";
import { isBomReleasedOnlyRole } from "@/lib/permissions";

export const runtime = "nodejs";

type CreateBody = {
  contextPartNumberId?: unknown;
  applicableParentPartNumberIds?: unknown;
  baseReleaseSnapshotId?: unknown;
  ownerPartNumberId?: unknown;
  bomRevision?: unknown;
  source?: unknown;
  sourceSubmissionId?: unknown;
  sourceRevisionPackageId?: unknown;
  draftName?: unknown;
  idempotencyKey?: unknown;
  pdmCompanyCode?: unknown;
  bomPurpose?: unknown;
};

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const url = new URL(request.url);
  if (url.searchParams.get("surface") === "work_list") {
    const status = url.searchParams.get("status")?.trim() ?? "";
    if (url.searchParams.has("purpose")) return sharedError("BOM_PURPOSE_RETIRED", 400);
    const allowedStatuses = new Set(["", "Draft", "PendingReview", "Rejected", "Released", "Archived", "Obsolete"]);
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "BOM_WORK_LIST_STATUS_INVALID" }, { status: 422 });
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "120", 10) || 120, 1), 120);
    const cursor = decodeWorkListCursor(url.searchParams.get("cursor"));
    if (url.searchParams.has("cursor") && !cursor) return sharedError("BOM_WORK_LIST_CURSOR_INVALID", 422);
    const candidates = await listBomWorkbenchRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query")?.trim() ?? "",
      status: status as "" | "Draft" | "PendingReview" | "Rejected" | "Released" | "Archived" | "Obsolete",
      limit: limit + 1,
      cursor
    });
    const drafts: typeof candidates = [];
    for (const draft of candidates.slice(0, limit)) {
      if (await canReadBomDraftRecordAsync(auth.user, draft)) drafts.push(draft);
    }
    const last = candidates.length > limit ? candidates.at(limit - 1) ?? null : null;
    return NextResponse.json({
      drafts,
      nextCursor: last ? encodeWorkListCursor({
        updatedAt: String(last.updatedAt),
        definitionKey: String(last.definitionId ?? last.draftId),
        revisionNumber: Number.parseInt(last.bomRevision ?? "0", 10) || 0,
        draftId: String(last.draftId)
      }) : null
    }, { headers: { "cache-control": "private, no-store" } });
  }

  const idempotencyKey = url.searchParams.get("idempotencyKey")?.trim() ?? "";
  if (!idempotencyKey) return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });

  const effect = await getAsyncDatabaseClient().queryOne<{ draft_id: string }>(
    `SELECT draft_id FROM bom_create_effects WHERE company_id = :companyId AND actor_id = :actorId AND idempotency_key = :idempotencyKey`,
    { companyId: companyResult.company.companyId, actorId: auth.user.id, idempotencyKey }
  );
  if (!effect) return NextResponse.json({ error: "BOM_CREATE_EFFECT_NOT_FOUND" }, { status: 404 });
  const draft = await getBomWorkbenchDraftByIdAsync(effect.draft_id);
  if (!draft) return NextResponse.json({ error: "BOM_CREATE_EFFECT_DRAFT_NOT_FOUND" }, { status: 409 });
  return NextResponse.json({ draft, draftId: draft.id, replayed: true, workbenchUrl: `/bom/workbench/${encodeURIComponent(draft.id)}${draft.owner_part_number_id ? `?parentPartNumberId=${encodeURIComponent(draft.owner_part_number_id)}` : ""}` }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const companyResult = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request, body as Record<string, unknown>)
  );
  if (companyResult.response) return companyResult.response;

  if ("bomPurpose" in body) return sharedError("BOM_PURPOSE_RETIRED", 400);
  const sharedPayloadRequested = "contextPartNumberId" in body || "applicableParentPartNumberIds" in body || "baseReleaseSnapshotId" in body;
  if (sharedPayloadRequested) {
    if ("ownerPartNumberId" in body || "draftName" in body) {
      return sharedError("BOM_SHARED_PAYLOAD_REQUIRED", 422);
    }
    const contextPartNumberId = textValue(body.contextPartNumberId);
    const applicableParentPartNumberIds = Array.isArray(body.applicableParentPartNumberIds)
      ? body.applicableParentPartNumberIds.map(textValue).filter(Boolean)
      : [];
    const bomRevision = textValue(body.bomRevision);
    const source = body.source === "manual" ? "manual" : null;
    const baseReleaseSnapshotId = body.baseReleaseSnapshotId === null ? null : textValue(body.baseReleaseSnapshotId) || null;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || textValue(body.idempotencyKey);
    const selectionEtag = request.headers.get("if-match")?.trim() ?? "";
    if (!contextPartNumberId || !applicableParentPartNumberIds.length || !bomRevision || !source || !idempotencyKey || !selectionEtag) {
      return sharedError("BOM_CREATE_FIELDS_REQUIRED", 422);
    }
    if (isBomReleasedOnlyRole(auth.user)) return sharedError("BOM_CREATE_FORBIDDEN", 403);
    const contextAccess = await resolveBomOwnerAccessContextAsync({
      user: auth.user,
      companyId: companyResult.company.companyId,
      ownerPartNumberId: contextPartNumberId
    });
    if (!contextAccess) {
      const sameCompanyPart = await getAsyncDatabaseClient().queryOne<{ id: string }>(
        "SELECT id FROM part_numbers WHERE id = :partNumberId AND company_id = :companyId",
        { partNumberId: contextPartNumberId, companyId: companyResult.company.companyId }
      );
      return sameCompanyPart
        ? sharedError("BOM_CREATE_FORBIDDEN", 403)
        : sharedError("BOM_RESOURCE_NOT_FOUND", 404);
    }
    const sortedParentIds = [...new Set(applicableParentPartNumberIds)].sort((left, right) => left.localeCompare(right, "en"));
    const requestFingerprint = canonicalSha256({
      contextPartNumberId,
      applicableParentPartNumberIds: sortedParentIds,
      bomRevision,
      source,
      baseReleaseSnapshotId,
      selectionEtag
    }).hash;
    try {
      const result = await createSharedBomDraftAsync({
        companyId: companyResult.company.companyId,
        contextPartNumberId,
        applicableParentPartNumberIds: sortedParentIds,
        bomRevision,
        source,
        baseReleaseSnapshotId,
        actorId: auth.user.id,
        idempotencyKey,
        requestFingerprint,
        selectionEtag
      });
      return NextResponse.json({
        ...result,
        draftId: result.draft.id,
        definitionId: result.definitionId,
        bomRevision: result.draft.bom_revision,
        applicableParents: result.applicableParents,
        receipt: { idempotencyKey, replayed: result.replayed },
        workbenchUrl: `/bom/workbench/${encodeURIComponent(result.draft.id)}?parentPartNumberId=${encodeURIComponent(contextPartNumberId)}`
      }, { status: result.replayed ? 200 : 201 });
    } catch (error) {
      if (error instanceof SharedBomError) return sharedError(error.code, error.status, error.details);
      if (error instanceof BomCreateIdempotencyConflictError) return sharedError(error.message, 409);
      return sharedError("BOM_CREATE_FAILED", 500);
    }
  }

  const ownerPartNumberId = textValue(body.ownerPartNumberId);
  const bomRevision = textValue(body.bomRevision);
  const source = body.source === "manual" ? "manual" : null;
  const sourceSubmissionId = textValue(body.sourceSubmissionId) || null;
  const sourceRevisionPackageId = textValue(body.sourceRevisionPackageId) || null;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || textValue(body.idempotencyKey);
  if (!ownerPartNumberId || !bomRevision || !source || !idempotencyKey) {
    return NextResponse.json({ error: "BOM_CREATE_FIELDS_REQUIRED" }, { status: 422 });
  }
  const revisionError = validateRevisionCode(bomRevision, { lifecycleStage: "release_area" });
  if (revisionError) return NextResponse.json({ error: revisionError }, { status: 422 });
  if (sourceSubmissionId || sourceRevisionPackageId) {
    return NextResponse.json({ error: "BOM_MANUAL_SOURCE_SUBMISSION_FORBIDDEN" }, { status: 422 });
  }
  const accessInput = {
    user: auth.user,
    companyId: companyResult.company.companyId,
    ownerPartNumberId
  };
  const owner = await resolveBomOwnerAccessContextAsync(accessInput);
  if (!owner) return NextResponse.json({ error: "BOM_CREATE_FORBIDDEN" }, { status: 403 });

  const requestFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        ownerPartNumberId,
        bomRevision,
        source,
        draftName: textValue(body.draftName)
      })
    )
    .digest("hex");
  try {
    const result = await createCanonicalBomDraftAsync({
      companyId: owner.companyId,
      ownerPartNumberId: owner.ownerPartNumberId,
      ownerPartNumber: owner.partNumber,
      legacyItemId: owner.legacyItemId,
      bomRevision,
      source,
      actorId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      draftName: textValue(body.draftName) || undefined
    });
    return NextResponse.json(
      {
        ...result,
        draftId: result.draft.id,
        ownerPartNumberId: result.draft.owner_part_number_id,
        bomRevision: result.draft.bom_revision,
        source: result.draft.source,
        receipt: { idempotencyKey, replayed: result.replayed },
        workbenchUrl: `/bom/workbench/${encodeURIComponent(result.draft.id)}`
      },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof BomCreateIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BomRevisionConflictError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_CREATE_FAILED" }, { status: 400 });
  }
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type WorkListCursor = { updatedAt: string; definitionKey: string; revisionNumber: number; draftId: string };

function encodeWorkListCursor(cursor: WorkListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeWorkListCursor(value: string | null): WorkListCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<WorkListCursor>;
    if (typeof parsed.updatedAt !== "string" || !parsed.updatedAt
      || typeof parsed.definitionKey !== "string" || !parsed.definitionKey
      || typeof parsed.draftId !== "string" || !parsed.draftId
      || typeof parsed.revisionNumber !== "number" || !Number.isInteger(parsed.revisionNumber)) return null;
    return { updatedAt: parsed.updatedAt, definitionKey: parsed.definitionKey, revisionNumber: parsed.revisionNumber, draftId: parsed.draftId };
  } catch {
    return null;
  }
}

function sharedError(code: string, status: number, details: Record<string, unknown> = {}) {
  const messages: Record<string, string> = {
    BOM_SHARED_STRUCTURE_DISABLED: "共用 BOM 功能尚未啟用",
    BOM_SHARED_PAYLOAD_REQUIRED: "請從組立件料號工作臺建立 BOM",
    BOM_CREATE_FIELDS_REQUIRED: "建立 BOM 的必要欄位不完整",
    BOM_CREATE_FORBIDDEN: "沒有建立此 BOM 的權限",
    BOM_APPLICABILITY_STALE: "適用料號已變更，請重新選擇",
    BOM_APPLICABILITY_CONFLICT: "適用料號已屬於其他 BOM",
    BOM_OPEN_REVISION_EXISTS: "已有未完成的 BOM 版次",
    BOM_PARENT_REMOVAL_NOT_SUPPORTED: "下一版不可移除既有適用料號",
    BOM_DEFINITION_REVISION_CONFLICT: "BOM 版次已變更，請重新載入",
    BOM_PURPOSE_INVALID: "BOM 用途無效",
    BOM_PURPOSE_RETIRED: "BOM 不再區分用途。",
    BOM_PURPOSE_STRUCTURE_MISMATCH: "此料號尚未設定為有下階結構",
    BOM_DEFINITION_PURPOSE_CONFLICT: "此料號已有不同用途的 BOM",
    BOM_SALES_KIT_DISABLED: "非製造 BOM 功能尚未啟用",
    BOM_SALES_KIT_MIGRATION_BLOCKED: "非製造 BOM 資料結構尚未就緒"
  };
  return NextResponse.json({
    error: code,
    message: messages[code] ?? "建立 BOM 失敗",
    details,
    correlationId: crypto.randomUUID()
  }, { status });
}
