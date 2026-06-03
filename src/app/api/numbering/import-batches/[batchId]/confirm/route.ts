import { NextResponse } from "next/server";
import { confirmNumberingImportBatch } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = requireNumberingAction(request, "numbering.import.confirm");
  if (auth.response) return auth.response;

  const { batchId } = await params;
  try {
    const result = confirmNumberingImportBatch({ batchId, confirmedBy: auth.user.id });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm import batch";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NO_VALID") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
