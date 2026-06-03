import { NextResponse } from "next/server";
import { getNumberingExportJob } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = requireNumberingPage(request, "numbering.reports");
  if (auth.response) return auth.response;

  const { jobId } = await params;
  const job = getNumberingExportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Export job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
