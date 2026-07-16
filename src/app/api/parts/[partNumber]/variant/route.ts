import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { upsertPartVariantAttributesAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  try {
    const part = await upsertPartVariantAttributesAsync({
      companyId: companyResult.company.companyId,
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
