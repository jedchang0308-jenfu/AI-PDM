import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingImportBatchAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.imports");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { batchId } = await params;
  const batch = await getNumberingImportBatchAsync(batchId, companyResult.company.companyId);
  if (!batch) {
    return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}
