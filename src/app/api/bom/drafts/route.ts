import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { canCreateBomDraftAsync, canReadBomDraftRecordAsync, resolveBomOwnerAccessContextAsync } from "@/lib/bom-create-context";
import {
  BomCreateIdempotencyConflictError,
  BomRevisionConflictError,
  createCanonicalBomDraftAsync,
  getBomWorkbenchDraftByIdAsync,
  listBomWorkbenchRecordsAsync
} from "@/lib/bom-workbench-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { validateRevisionCode } from "@/lib/revision-policy";

export const runtime = "nodejs";

type CreateBody = {
  ownerPartNumberId?: unknown;
  bomRevision?: unknown;
  source?: unknown;
  sourceSubmissionId?: unknown;
  sourceRevisionPackageId?: unknown;
  draftName?: unknown;
  idempotencyKey?: unknown;
  pdmCompanyCode?: unknown;
};

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const url = new URL(request.url);
  if (url.searchParams.get("surface") === "work_list") {
    const status = url.searchParams.get("status")?.trim() ?? "";
    const allowedStatuses = new Set(["", "Draft", "PendingReview", "Rejected", "Released", "Obsolete"]);
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "BOM_WORK_LIST_STATUS_INVALID" }, { status: 422 });
    const candidates = await listBomWorkbenchRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query")?.trim() ?? "",
      status: status as "" | "Draft" | "PendingReview" | "Rejected" | "Released" | "Obsolete",
      limit: 120
    });
    const drafts: typeof candidates = [];
    for (const draft of candidates) {
      if (await canReadBomDraftRecordAsync(auth.user, draft)) drafts.push(draft);
    }
    return NextResponse.json({ drafts }, { headers: { "cache-control": "private, no-store" } });
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
  return NextResponse.json({ draft, replayed: true }, { headers: { "cache-control": "private, no-store" } });
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

  const ownerPartNumberId = textValue(body.ownerPartNumberId);
  const bomRevision = textValue(body.bomRevision);
  const source = body.source === "cad_reference" ? "cad_reference" : body.source === "manual" ? "manual" : null;
  const sourceSubmissionId = textValue(body.sourceSubmissionId) || null;
  const sourceRevisionPackageId = textValue(body.sourceRevisionPackageId) || null;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || textValue(body.idempotencyKey);
  if (!ownerPartNumberId || !bomRevision || !source || !idempotencyKey) {
    return NextResponse.json({ error: "BOM_CREATE_FIELDS_REQUIRED" }, { status: 422 });
  }
  const revisionError = validateRevisionCode(bomRevision, { lifecycleStage: "release_area" });
  if (revisionError) return NextResponse.json({ error: revisionError }, { status: 422 });
  if (source === "cad_reference" && !sourceSubmissionId && !sourceRevisionPackageId) {
    return NextResponse.json({ error: "BOM_CAD_SOURCE_SUBMISSION_REQUIRED" }, { status: 422 });
  }
  if (source === "cad_reference" && sourceSubmissionId && sourceRevisionPackageId) {
    return NextResponse.json({ error: "BOM_CAD_SOURCE_AMBIGUOUS" }, { status: 422 });
  }
  if (source === "manual" && (sourceSubmissionId || sourceRevisionPackageId)) {
    return NextResponse.json({ error: "BOM_MANUAL_SOURCE_SUBMISSION_FORBIDDEN" }, { status: 422 });
  }
  const accessInput = {
    user: auth.user,
    companyId: companyResult.company.companyId,
    ownerPartNumberId,
    sourceSubmissionId,
    sourceRevisionPackageId
  };
  const owner = await resolveBomOwnerAccessContextAsync(accessInput);
  if (!owner) return NextResponse.json({ error: "BOM_CREATE_FORBIDDEN" }, { status: 403 });
  if (source === "cad_reference" && !(await canCreateBomDraftAsync(accessInput))) {
    return NextResponse.json({ error: "BOM_OWNER_SOURCE_MISMATCH" }, { status: 409 });
  }

  const requestFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        ownerPartNumberId,
        bomRevision,
        source,
        sourceSubmissionId,
        sourceRevisionPackageId,
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
      sourceSubmissionId,
      sourceRevisionPackageId,
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
