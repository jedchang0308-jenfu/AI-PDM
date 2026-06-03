import { NextResponse } from "next/server";
import { updateDraftNumberingRecord } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = requireNumberingAction(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = updateDraftNumberingRecord({
      rootCode: decodeURIComponent(rootCode),
      coreName: optionalString(body.coreName ?? body.core_name),
      partNumber: optionalString(body.partNumber ?? body.part_number),
      partName: optionalString(body.partName ?? body.part_name),
      customSpecification: optionalString(body.customSpecification ?? body.custom_specification),
      universalReason: optionalString(body.universalReason ?? body.universal_reason),
      drawingNumber: optionalString(body.drawingNumber ?? body.drawing_number),
      drawingPurposeDescription: optionalString(body.drawingPurposeDescription ?? body.drawing_purpose_description),
      updatedBy: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update draft numbering record";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NOT_DRAFT") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
