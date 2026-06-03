import { NextResponse } from "next/server";
import { analyzeMainDrawingObsolescence } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const drawingNumber = String(body.drawingNumber ?? body.drawing_number ?? "").trim();
  const applyInvalidation = Boolean(body.applyInvalidation ?? body.apply_invalidation);
  const auth = requireNumberingAction(request, applyInvalidation ? "numbering.impact.apply" : "numbering.impact.analyze");
  if (auth.response) return auth.response;

  if (!drawingNumber) {
    return NextResponse.json({ error: "drawingNumber is required" }, { status: 400 });
  }
  if (applyInvalidation && auth.user.role === "Engineer") {
    return NextResponse.json({ error: "Admin or R&D Manager approval is required to apply invalidation" }, { status: 403 });
  }

  try {
    const result = analyzeMainDrawingObsolescence({
      drawingNumber,
      reason: String(body.reason ?? "").trim(),
      applyInvalidation,
      createdBy: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze main drawing impact";
    const status = message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
