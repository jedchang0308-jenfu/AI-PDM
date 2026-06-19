import { NextResponse } from "next/server";
import { linkPartNumberToDrawingAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.link_variant");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const drawingNumber = String(body.drawingNumber ?? body.drawing_number ?? "").trim();
  const partNumber = String(body.partNumber ?? body.part_number ?? "").trim();
  const variants = body.variants;

  const errors: string[] = [];
  if (!drawingNumber) errors.push("drawingNumber is required");
  if (!partNumber) errors.push("partNumber is required");
  if (variants !== undefined && typeof variants !== "object") errors.push("variants must be an object or array");
  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid numbering variant request", details: errors }, { status: 400 });
  }

  try {
    const result = await linkPartNumberToDrawingAsync({
      drawingNumber,
      partNumber,
      variants,
      createdBy: auth.user.id
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to link drawing and part";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("MISMATCH") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
