import { NextResponse } from "next/server";
import { forbidden, requireAuth, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createChangeRequest, getSubmission, listChangeRequests } from "@/lib/db";
import type { ChangeRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({ changes: listChangeRequests(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind ?? "").trim().toUpperCase();
  const parsedKind = isChangeKind(kind) ? kind : null;
  const title = String(body.title ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const impact = String(body.impact ?? "").trim();
  const errors: string[] = [];
  if (!parsedKind) {
    return NextResponse.json({ error: "驗證失敗", details: ["類型必須為 ECR、ECO 或 ECN"] }, { status: 400 });
  }
  if (title.length < 3 || title.length > 120) errors.push("標題需為 3 到 120 個字");
  if (reason.length < 3 || reason.length > 1000) errors.push("原因需為 3 到 1000 個字");
  if (impact.length < 3 || impact.length > 1000) errors.push("影響需為 3 到 1000 個字");
  if (errors.length > 0) {
    return NextResponse.json({ error: "驗證失敗", details: errors }, { status: 400 });
  }

  const change = createChangeRequest({
    submissionId: id,
    requestedBy: auth.user.id,
    kind: parsedKind,
    title,
    reason,
    impact
  });

  return NextResponse.json({ change }, { status: 201 });
}

function isChangeKind(value: string): value is ChangeRequest["kind"] {
  return value === "ECR" || value === "ECO" || value === "ECN";
}
