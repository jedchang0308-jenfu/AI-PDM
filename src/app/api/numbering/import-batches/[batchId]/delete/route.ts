import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { deleteNumberingImportBatchAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildNumberingImportBatchLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.import.stage");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const { batchId } = await params;
  try {
    const batch = await deleteNumberingImportBatchAsync({ companyId: companyResult.company.companyId, batchId, deletedBy: auth.user.id });
    const policy = buildNumberingImportBatchLifecyclePolicy({ batchId: batch.id, status: batch.status });
    return NextResponse.json({ batch, policy, pdmCompany: companyResult.company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete import batch";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("ALREADY") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
