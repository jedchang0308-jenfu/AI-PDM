import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { FormalObsoleteImpactError, getFormalObsoleteImpactAsync } from "@/lib/numbering-obsolete-impact";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response?.status === 403) auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") as "drawing_number" | "part_number" | null;
  if (entityType !== "drawing_number" && entityType !== "part_number") return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return company.response;
  try {
    const impact = await getFormalObsoleteImpactAsync({
      companyId: company.company.companyId,
      entityType,
      entityId: url.searchParams.get("entityId"),
      entityCode: url.searchParams.get("entityCode")
    });
    if (impact.recordStatus !== "Active" && impact.recordStatus !== "Released") {
      return NextResponse.json(
        { error: "LIFE_OBSOLETE_NOT_FORMAL", message: "此資料尚未正式發行，不能申請作廢。" },
        { status: 409, headers: { "cache-control": "private, no-store" } }
      );
    }
    return NextResponse.json({ impact, pdmCompany: company.company }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof FormalObsoleteImpactError) {
      const status = error.code === "LIFE_ENTITY_NOT_FOUND" ? 404 : error.code === "LIFE_ENTITY_IDENTITY_MISMATCH" ? 409 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ error: "LIFE_OBSOLETE_IMPACT_READ_FAILED" }, { status: 500 });
  }
}
