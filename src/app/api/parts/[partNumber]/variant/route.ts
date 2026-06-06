import { NextResponse } from "next/server";
import { upsertPartVariantAttributes } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = requireNumberingAction(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const part = upsertPartVariantAttributes({
      partNumber: decodeURIComponent(partNumber),
      materialCode: stringOrNull(body.materialCode ?? body.material_code),
      materialLabel: stringOrNull(body.materialLabel ?? body.material_label),
      colorCode: stringOrNull(body.colorCode ?? body.color_code),
      colorLabel: stringOrNull(body.colorLabel ?? body.color_label),
      surfaceTreatment: stringOrNull(body.surfaceTreatment ?? body.surface_treatment),
      variantNote: stringOrNull(body.variantNote ?? body.variant_note),
      updatedBy: auth.user.id
    });
    return NextResponse.json({ part });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PART_VARIANT_UPDATE_FAILED" }, { status: 400 });
  }
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}
