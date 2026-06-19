import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import { createChangeRequestAsync, listChangeRequestsAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { ChangeRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  return NextResponse.json({ changes: await listChangeRequestsAsync(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind ?? "").trim().toUpperCase();
  const parsedKind = isChangeKind(kind) ? kind : null;
  const title = String(body.title ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const impact = String(body.impact ?? "").trim();
  const errors: string[] = [];
  if (!parsedKind) {
    return NextResponse.json({ error: "Validation failed", details: ["kind must be ECR, ECO, or ECN"] }, { status: 400 });
  }
  if (title.length < 3 || title.length > 120) errors.push("title must be 3 to 120 characters");
  if (reason.length < 3 || reason.length > 1000) errors.push("reason must be 3 to 1000 characters");
  if (impact.length < 3 || impact.length > 1000) errors.push("impact must be 3 to 1000 characters");
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const change = await createChangeRequestAsync({
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
