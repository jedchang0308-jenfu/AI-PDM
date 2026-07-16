import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { deleteDraftNumberingRecordAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.obsolete");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.confirmDelete !== true && body.confirm_delete !== true) {
    return NextResponse.json({ error: "confirmDelete is required" }, { status: 400 });
  }

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    const result = await deleteDraftNumberingRecordAsync({
      companyId: companyResult.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      reason: String(body.reason ?? "").trim(),
      deletedBy: auth.user.id
    });
    return NextResponse.json({ result, pdmCompany: companyResult.company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete draft numbering record";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

function errorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("NOT_DRAFT") || message.includes("CONTROLLED_REFERENCES")) return 409;
  if (message.includes("REQUIRED")) return 400;
  return 422;
}
