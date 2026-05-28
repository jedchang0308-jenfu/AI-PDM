import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { findActiveItemLockForSubmissionIdentifiers } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const drawingNumber = String(body.drawing_number ?? body.drawingNumber ?? "").trim();
  const partNumber = String(body.part_number ?? body.partNumber ?? "").trim();

  if (!drawingNumber && !partNumber) {
    return NextResponse.json({ error: "圖號或料號為必填" }, { status: 400 });
  }

  const lock = findActiveItemLockForSubmissionIdentifiers({
    drawingNumber,
    partNumber
  });

  return NextResponse.json({
    locked: Boolean(lock),
    lockedByCurrentUser: Boolean(lock && lock.locked_by === auth.user.id),
    matchedBy: lock ? { drawing_number: drawingNumber || null, part_number: partNumber || null } : null,
    lock
  });
}
