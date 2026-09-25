import { NextResponse } from "next/server";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { previewNewBundleNumbersAsync } from "@/lib/numbering-preview";
import type { NumberPreviewPurposeCode } from "@/lib/numbering-preview";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const principalResponse = await withPrincipalNumberingCompanyRead(request,
    [{ permissionKind: "action", permissionCode: "numbering.create" }],
    async (snapshot, company) => previewResponse(request, snapshot, company));
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  return previewResponse(request, getAsyncDatabaseClient(), companyResult.company);
}

async function previewResponse(request: Request, client: AsyncDatabaseClient, company: PdmCompanyContext) {
  const url = new URL(request.url);
  const content = url.searchParams.get("content") === "drawing_part" ? "drawing_part" : url.searchParams.get("content") === "part" ? "part" : "";
  const purpose = url.searchParams.get("purposeCode");
  const purposeCode: NumberPreviewPurposeCode = purpose === "R" ? "R" : "M";
  const rawStructureType = url.searchParams.get("structureType");
  const structureType = parseNumberingStructureType(rawStructureType);
  const effectiveStructureType = structureType ?? "unclassified";
  if (!content) return NextResponse.json({ error: "content must be part or drawing_part" }, { status: 400 });
  if (rawStructureType !== null && !structureType) return NextResponse.json({ error: "structureType must be single_part or assembly" }, { status: 422 });
  try {
    const result = await previewNewBundleNumbersAsync(client, company.companyId, purposeCode);
    return NextResponse.json({
      estimated: true,
      observedAt: new Date().toISOString(),
      content,
      structureType: effectiveStructureType,
      effectiveStructureType,
      structureInitializationSource: "deferred_default",
      purposeCode: content === "part" ? null : purposeCode,
      nextNumbers: {
        root: result.root,
        part: result.part,
        drawing: content === "part" ? null : result.drawing,
      },
      pdmCompany: company,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to preview numbering";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
