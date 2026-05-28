import { NextResponse } from "next/server";
import { forbidden, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createItemLock, getSubmission, releaseItemLock } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "Edit reservation").trim();
  const hours = Number.parseInt(String(body.hours ?? "8"), 10);
  if (reason.length < 3 || reason.length > 120) {
    return NextResponse.json({ error: "原因需為 3 到 120 個字" }, { status: 400 });
  }

  const result = createItemLock({
    submissionId: id,
    userId: auth.user.id,
    reason,
    hours: Number.isFinite(hours) && hours > 0 && hours <= 72 ? hours : 8
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, lock: result.lock ?? null }, { status: result.status });
  }

  return NextResponse.json({ lock: result.lock, reused: result.reused });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission) && auth.user.role !== "Admin") return forbidden();

  const result = releaseItemLock({
    submissionId: id,
    userId: auth.user.id,
    force: auth.user.role === "Admin"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, lock: result.lock ?? null }, { status: result.status });
  }

  return NextResponse.json({ released: result.released });
}
