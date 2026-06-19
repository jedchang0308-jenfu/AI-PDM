import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { checkNumberingDuplicatesAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.duplicate_check");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const input = {
    companyId: companyResult.company.companyId,
    rootCode: optionalString(body.rootCode ?? body.root_code),
    coreName: optionalString(body.coreName ?? body.core_name),
    partNumber: optionalString(body.partNumber ?? body.part_number),
    partName: optionalString(body.partName ?? body.part_name),
    drawingNumber: optionalString(body.drawingNumber ?? body.drawing_number),
    createdBy: auth.user.id
  };

  if (!input.rootCode && !input.coreName && !input.partNumber && !input.partName && !input.drawingNumber) {
    return NextResponse.json({ error: "At least one numbering check field is required" }, { status: 400 });
  }

  try {
    return NextResponse.json({ ...(await checkNumberingDuplicatesAsync(input)), pdmCompany: companyResult.company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check numbering duplicates";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
