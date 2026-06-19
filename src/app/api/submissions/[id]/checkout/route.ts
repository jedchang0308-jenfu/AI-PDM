import { NextResponse } from "next/server";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { createItemLockAsync, releaseItemLockAsync } from "@/lib/item-locks-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "Edit reservation").trim();
  const hours = Number.parseInt(String(body.hours ?? "8"), 10);
  if (reason.length < 3 || reason.length > 120) {
    return NextResponse.json({ error: "?????3 ??120 ??" }, { status: 400 });
  }

  const result = await createItemLockAsync({
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
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const result = await releaseItemLockAsync({
    submissionId: id,
    userId: auth.user.id,
    force: auth.user.role === "Admin"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, lock: result.lock ?? null }, { status: result.status });
  }

  return NextResponse.json({ released: result.released });
}

