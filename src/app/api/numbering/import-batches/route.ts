import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { createNumberingImportBatchAsync, listNumberingImportBatchesAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { buildNumberingImportBatchLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.imports");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const surface = url.searchParams.get("surface") ?? "work_list";
  if (surface === "deleted_data") {
    const batches = await listNumberingImportBatchesAsync({ companyId: companyResult.company.companyId, status: "rejected", limit });
    return NextResponse.json({
      surface: "deleted_data",
      batches: batches.map((batch) => ({
        batch,
        policy: buildNumberingImportBatchLifecyclePolicy({ batchId: batch.id, status: batch.status })
      })),
      pdmCompany: companyResult.company
    });
  }
  const batches = await listNumberingImportBatchesAsync({ companyId: companyResult.company.companyId, limit });
  return NextResponse.json({ batches: batches.filter((batch) => batch.status !== "rejected"), pdmCompany: companyResult.company });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.import.stage");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "rows is required" }, { status: 400 });
  }

  try {
    const result = await createNumberingImportBatchAsync({
      companyId: companyResult.company.companyId,
      sourceFilename: String(body.sourceFilename ?? body.source_filename ?? "").trim(),
      sourceHash: String(body.sourceHash ?? body.source_hash ?? "").trim() || null,
      rows,
      importedBy: auth.user.id
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create import batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
