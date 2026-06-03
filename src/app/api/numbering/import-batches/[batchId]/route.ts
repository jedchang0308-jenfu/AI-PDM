import { NextResponse } from "next/server";
import { getNumberingImportBatch } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = requireNumberingPage(request, "numbering.imports");
  if (auth.response) return auth.response;

  const { batchId } = await params;
  const batch = getNumberingImportBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}
