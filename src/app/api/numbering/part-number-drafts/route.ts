import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import {
  listDeletedPartNumberDrafts,
  listPartNumberDrafts,
  reservePartNumberDraft,
  type PartNumberDraftItemType,
  type PartNumberDraftStatus,
  type PartNumberDraftType
} from "@/lib/pdm-change-control";
import {
  parseReplacementAttachmentCommand,
  prepareReplacementAttachmentCommand,
  replacementAttachmentSnapshotFromBody
} from "@/lib/replacement-part-attachments";

export const runtime = "nodejs";

const draftTypes = new Set(["new_part", "replacement_part", "drawing_revision_generated"]);
const itemTypes = new Set(["self_made", "purchased"]);
const statuses = new Set(["draft", "pending_review", "released", "needs_reconfirmation", "voided", "all"]);

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.tasks");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const surface = url.searchParams.get("surface") ?? "work_list";
  const rawStatus = url.searchParams.get("status") ?? "all";
  const rawDraftType = url.searchParams.get("draftType") ?? url.searchParams.get("draft_type") ?? "all";
  const status = statuses.has(rawStatus) ? (rawStatus as PartNumberDraftStatus | "all") : "all";
  const draftType = draftTypes.has(rawDraftType) ? (rawDraftType as PartNumberDraftType) : "all";
  const includeRecycled = url.searchParams.get("includeRecycled") === "1" || url.searchParams.get("include_recycled") === "1";
  const limit = Number(url.searchParams.get("limit") ?? 100);

  const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
  if (surface === "deleted_data") {
    const deletedDrafts = await listDeletedPartNumberDrafts({ actor, draftType, includeRecycled: false, limit });
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      surface: "deleted_data",
      drafts: deletedDrafts,
      pdmCompany: companyResult.company
    });
  }

  const listedDrafts = await listPartNumberDrafts({ actor, status, draftType, includeRecycled, limit });
  const drafts = status === "all" ? listedDrafts.filter((draft) => draft.status !== "voided") : listedDrafts;
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
  const preliminaryAuth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (preliminaryAuth.response) return preliminaryAuth.response;

  let parsed;
  try {
    parsed = await parseReplacementAttachmentCommand(request);
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Invalid replacement attachment command");
  }
  const body = parsed.body;
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.draft.update", body });
  if (access.response) return access.response;

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
    const prepared = await prepareReplacementAttachmentCommand(parsed, access.company.companyCode);
    const attachmentSnapshot = replacementAttachmentSnapshotFromBody(body, prepared.preparedNewAttachments);
    const actor = {
      userId: access.actor.pdmUserId,
      companyId: access.actor.organizationId,
      role: access.auth.user.role,
      roleCodes: access.actor.roles
    };
    const draft = await reservePartNumberDraft({
      reservedPartNumber,
      draftType,
      itemType,
      sourcePartNumberId: nullableText(body.sourcePartNumberId ?? body.source_part_number_id),
      sourceDrawingNumberId: nullableText(body.sourceDrawingNumberId ?? body.source_drawing_number_id),
      sourceRevision: nullableText(body.sourceRevision ?? body.source_revision),
      useType: nullableText(body.useType ?? body.use_type),
      departmentId: nullableText(body.departmentId ?? body.department_id),
      attachmentSnapshot,
      actor
    }, access.metadata);
    return NextResponse.json({ draft, pdmCompany: access.company }, { status: 201 });
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
