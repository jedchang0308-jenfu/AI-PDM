import { NextResponse } from "next/server";
import { createNumberingExportJob, listNumberingExportJobs } from "@/lib/db";
import { requireNumberingAction, requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.reports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return NextResponse.json({ jobs: listNumberingExportJobs({ limit }) });
}

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.export.create");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exportMode = String(body.exportMode ?? body.export_mode ?? "no_audit").trim();
  if (exportMode !== "no_audit" && exportMode !== "last_change_summary" && exportMode !== "full_change_summary") {
    return NextResponse.json({ error: "exportMode must be no_audit, last_change_summary, or full_change_summary" }, { status: 400 });
  }

  const result = createNumberingExportJob({ exportMode, generatedBy: auth.user.id });
  return NextResponse.json(result, { status: 201 });
}
