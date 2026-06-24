import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { updatePartNumberDraft, type PartNumberDraftItemType } from "@/lib/pdm-change-control";

export const runtime = "nodejs";

const itemTypes = new Set(["self_made", "purchased", "standard"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const expectedVersion = Number(body.version ?? body.expectedVersion ?? body.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    return NextResponse.json({ error: "version is required for optimistic locking" }, { status: 400 });
  }

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const draft = await updatePartNumberDraft({
      draftId,
      expectedVersion,
      itemType: normalizeEnum(body.itemType ?? body.item_type, itemTypes) as PartNumberDraftItemType | undefined,
      sourcePartNumberId: body.sourcePartNumberId !== undefined || body.source_part_number_id !== undefined
        ? nullableText(body.sourcePartNumberId ?? body.source_part_number_id)
        : undefined,
      sourceDrawingNumberId: body.sourceDrawingNumberId !== undefined || body.source_drawing_number_id !== undefined
        ? nullableText(body.sourceDrawingNumberId ?? body.source_drawing_number_id)
        : undefined,
      sourceRevision: body.sourceRevision !== undefined || body.source_revision !== undefined ? nullableText(body.sourceRevision ?? body.source_revision) : undefined,
      useType: body.useType !== undefined || body.use_type !== undefined ? nullableText(body.useType ?? body.use_type) : undefined,
      actor
    });
    return NextResponse.json({ draft, pdmCompany: companyResult.company });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to update part-number draft");
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
