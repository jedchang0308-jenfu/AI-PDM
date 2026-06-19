import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { confirmNumberingImportBatchAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.import.confirm");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const { batchId } = await params;
  try {
    const result = await confirmNumberingImportBatchAsync({ companyId: companyResult.company.companyId, batchId, confirmedBy: auth.user.id });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm import batch";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NO_VALID") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
