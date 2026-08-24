import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { listReplacementAttachmentCandidatesAsync } from "@/lib/replacement-part-attachments";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request)
  );
  if (companyResult.response) return companyResult.response;

  const { partNumber } = await params;
  const result = await listReplacementAttachmentCandidatesAsync({
    client: getAsyncDatabaseClient(),
    companyId: companyResult.company.companyId,
    sourcePartNumber: decodeURIComponent(partNumber)
  });
  if (!result) {
    return NextResponse.json({ error: "source_part_not_found" }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: { "cache-control": "private, no-store" }
  });
}
