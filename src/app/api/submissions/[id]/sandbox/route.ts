import { NextResponse } from "next/server";
import { forbidden, requireAuth, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createSandboxBranch, getSubmission, listSandboxBranchesForSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const branches = listSandboxBranchesForSubmission(id);
  return NextResponse.json({
    branches,
    current_branch: branches.find((branch) => branch.sandbox_submission_id === id) ?? null
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const result = createSandboxBranch({
    sourceSubmissionId: id,
    userId: auth.user.id,
    branchName: String(body.branchName ?? body.branch_name ?? "").trim(),
    reason: String(body.reason ?? "").trim()
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ branch: result.branch, submissionId: result.submissionId }, { status: 201 });
}
