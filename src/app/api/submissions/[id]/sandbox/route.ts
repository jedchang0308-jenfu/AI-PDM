import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { createSandboxBranchAsync, listSandboxBranchesForSubmissionAsync } from "@/lib/sandbox-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const branches = await listSandboxBranchesForSubmissionAsync(id);
  return NextResponse.json({
    branches,
    current_branch: branches.find((branch) => branch.sandbox_submission_id === id) ?? null
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const result = await createSandboxBranchAsync({
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

