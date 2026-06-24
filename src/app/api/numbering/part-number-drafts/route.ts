import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import {
  listPartNumberDrafts,
  reservePartNumberDraft,
  type PartNumberDraftItemType,
  type PartNumberDraftStatus,
  type PartNumberDraftType
} from "@/lib/pdm-change-control";

export const runtime = "nodejs";

const draftTypes = new Set(["new_part", "replacement_part", "drawing_revision_generated"]);
const itemTypes = new Set(["self_made", "purchased", "standard"]);
const statuses = new Set(["draft", "pending_review", "released", "needs_reconfirmation", "voided", "all"]);

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.tasks");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "all";
  const rawDraftType = url.searchParams.get("draftType") ?? url.searchParams.get("draft_type") ?? "all";
  const status = statuses.has(rawStatus) ? (rawStatus as PartNumberDraftStatus | "all") : "all";
  const draftType = draftTypes.has(rawDraftType) ? (rawDraftType as PartNumberDraftType) : "all";
  const includeRecycled = url.searchParams.get("includeRecycled") === "1" || url.searchParams.get("include_recycled") === "1";
  const limit = Number(url.searchParams.get("limit") ?? 100);

  const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
  const drafts = await listPartNumberDrafts({ actor, status, draftType, includeRecycled, limit });
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: drafts.length,
      needsReconfirmation: drafts.filter((draft) => draft.status === "needs_reconfirmation").length,
      sameSourceWarnings: drafts.filter((draft) => draft.sameSourceUnfinishedDraftCount > 0).length,
      recyclableVoided: drafts.filter((draft) => draft.status === "voided" && !draft.recycledAt && !draft.controlled).length
    },
    drafts,
    pdmCompany: companyResult.company
  });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const reservedPartNumber = String(body.reservedPartNumber ?? body.reserved_part_number ?? "").trim();
  const draftType = normalizeEnum(body.draftType ?? body.draft_type, draftTypes) as PartNumberDraftType | undefined;
  const itemType = normalizeEnum(body.itemType ?? body.item_type, itemTypes) as PartNumberDraftItemType | undefined;
  const errors: string[] = [];
  if (!reservedPartNumber) errors.push("reservedPartNumber is required");
  if (!draftType) errors.push("draftType is required");
  if (!itemType) errors.push("itemType is required");
  if (errors.length > 0 || !draftType || !itemType) {
    return NextResponse.json({ error: "Invalid part-number draft request", details: errors }, { status: 400 });
  }

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const draft = await reservePartNumberDraft({
      reservedPartNumber,
      draftType,
      itemType,
      sourcePartNumberId: nullableText(body.sourcePartNumberId ?? body.source_part_number_id),
      sourceDrawingNumberId: nullableText(body.sourceDrawingNumberId ?? body.source_drawing_number_id),
      sourceRevision: nullableText(body.sourceRevision ?? body.source_revision),
      useType: nullableText(body.useType ?? body.use_type),
      departmentId: nullableText(body.departmentId ?? body.department_id),
      actor
    });
    return NextResponse.json({ draft, pdmCompany: companyResult.company }, { status: 201 });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to reserve part-number draft");
  }
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : undefined;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
