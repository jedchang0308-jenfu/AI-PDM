import { NextResponse } from "next/server";
import { checkNumberingDuplicates } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.duplicate_check");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const input = {
    rootCode: optionalString(body.rootCode ?? body.root_code),
    coreName: optionalString(body.coreName ?? body.core_name),
    partNumber: optionalString(body.partNumber ?? body.part_number),
    partName: optionalString(body.partName ?? body.part_name),
    drawingNumber: optionalString(body.drawingNumber ?? body.drawing_number),
    createdBy: auth.user.id
  };

  if (!input.rootCode && !input.coreName && !input.partNumber && !input.partName && !input.drawingNumber) {
    return NextResponse.json({ error: "At least one numbering check field is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(checkNumberingDuplicates(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check numbering duplicates";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
