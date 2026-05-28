import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { scopedSubmittedBy } from "@/lib/permissions";
import { searchSubmissions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? undefined;
  const filters = {
    productLine: url.searchParams.get("productLine") ?? undefined,
    customer: url.searchParams.get("customer") ?? undefined,
    projectCode: url.searchParams.get("projectCode") ?? url.searchParams.get("project") ?? undefined,
    processName: url.searchParams.get("processName") ?? url.searchParams.get("process") ?? undefined,
    machine: url.searchParams.get("machine") ?? undefined,
    material: url.searchParams.get("material") ?? undefined,
    surfaceFinish: url.searchParams.get("surfaceFinish") ?? undefined,
    parentDrawing: url.searchParams.get("parentDrawing") ?? undefined,
    childDrawingNumber: url.searchParams.get("childDrawingNumber") ?? undefined,
    childPartNumber: url.searchParams.get("childPartNumber") ?? undefined,
    bomIssue: url.searchParams.get("bomIssue") ?? undefined,
    status
  };
  const hasFilters = Object.values(filters).some((value) => value?.trim());
  const submittedBy = scopedSubmittedBy(auth.user);

  if (query.length < 2 && !hasFilters) {
    return NextResponse.json({ submissions: [] });
  }

  return NextResponse.json({
    submissions: searchSubmissions({ query: query.length >= 2 ? query : "", status, filters, submittedBy })
  });
}
