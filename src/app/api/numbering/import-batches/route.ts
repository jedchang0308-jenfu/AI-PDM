import { NextResponse } from "next/server";
import { createNumberingImportBatch, listNumberingImportBatches } from "@/lib/db";
import { requireNumberingAction, requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.imports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return NextResponse.json({ batches: listNumberingImportBatches({ limit }) });
}

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.import.stage");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "rows is required" }, { status: 400 });
  }

  try {
    const result = createNumberingImportBatch({
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
