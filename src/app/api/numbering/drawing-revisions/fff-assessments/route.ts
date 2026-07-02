import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { submitDrawingRevisionFffAssessment, type DrawingRevisionFffState, type PartNumberDraftItemType } from "@/lib/pdm-change-control";
import { PdmChangeControlError } from "@/lib/pdm-change-control-domain";
import { requireResolvedDrawingRevisionContext } from "@/lib/drawing-revision-workbench";

export const runtime = "nodejs";

const fffStates = new Set(["no_impact", "suspected_impact", "confirmed_impact"]);
const itemTypes = new Set(["self_made", "purchased", "standard"]);

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const drawingNumberId = nullableText(body.drawingNumberId ?? body.drawing_number_id);
  const drawingNumber = nullableText(body.drawingNumber ?? body.drawing_number);
  const revision = String(body.revision ?? "").trim();
  const reasonCategory = String(body.reasonCategory ?? body.reason_category ?? "").trim();
  const formState = normalizeEnum(body.formState ?? body.form_state, fffStates) as DrawingRevisionFffState | undefined;
  const fitState = normalizeEnum(body.fitState ?? body.fit_state, fffStates) as DrawingRevisionFffState | undefined;
  const functionState = normalizeEnum(body.functionState ?? body.function_state, fffStates) as DrawingRevisionFffState | undefined;
  const errors: string[] = [];
  if (!drawingNumberId && !drawingNumber) errors.push("drawingNumber is required");
  if (!revision) errors.push("revision is required");
  if (!reasonCategory) errors.push("reasonCategory is required");
  if (!formState) errors.push("formState is required");
  if (!fitState) errors.push("fitState is required");
  if (!functionState) errors.push("functionState is required");
  if (errors.length > 0 || !formState || !fitState || !functionState) {
    return NextResponse.json({ error: "Invalid drawing revision FFF assessment", details: errors }, { status: 400 });
  }

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const resolved = await requireResolvedDrawingRevisionContext({
      companyId: companyResult.company.companyId,
      drawingNumberId,
      drawingNumber
    });
    const resolvedDrawing = resolved.drawing;
    if (!resolvedDrawing) throw new PdmChangeControlError("drawing_number_not_found");
    if (drawingNumber && resolvedDrawing.drawingNumber !== drawingNumber) {
      throw new PdmChangeControlError("drawing_number_mismatch", "Resolved drawing does not match requested drawing number", {
        expectedDrawingNumber: drawingNumber,
        actualDrawingNumber: resolvedDrawing.drawingNumber
      });
    }
    const outcome = [formState, fitState, functionState].includes("confirmed_impact")
      ? "confirmed_impact"
      : [formState, fitState, functionState].includes("suspected_impact")
        ? "suspected_impact"
        : "no_impact";
    const currentPartNumberId = nullableText(body.currentPartNumberId ?? body.current_part_number_id) ?? resolved.selectedPrimaryPart?.id ?? null;
    if (outcome === "confirmed_impact" && !currentPartNumberId && resolved.status === "multiple_primary_parts") {
      throw new PdmChangeControlError("primary_part_ambiguous", "Multiple primary manufacturing parts are linked to this drawing", {
        primaryParts: resolved.primaryParts.map((part) => part.partNumber)
      });
    }
    const result = await submitDrawingRevisionFffAssessment({
      drawingNumberId: resolvedDrawing.id,
      revision,
      formState,
      fitState,
      functionState,
      reasonCategory,
      note: nullableText(body.note),
      submissionId: nullableText(body.submissionId ?? body.submission_id),
      reviewPackageId: nullableText(body.reviewPackageId ?? body.review_package_id),
      currentPartNumberId,
      replacementReservedPartNumber: nullableText(body.replacementReservedPartNumber ?? body.replacement_reserved_part_number),
      replacementItemType: normalizeEnum(body.replacementItemType ?? body.replacement_item_type, itemTypes) as PartNumberDraftItemType | undefined,
      detectedPartNumber: nullableText(body.detectedPartNumber ?? body.detected_part_number),
      correctedPartNumber: nullableText(body.correctedPartNumber ?? body.corrected_part_number),
      actor
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: 201 });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to submit drawing revision FFF assessment");
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
