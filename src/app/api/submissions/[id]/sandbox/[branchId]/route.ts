import { NextResponse } from "next/server";
import { forbidden, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getSandboxBranchById, getSandboxMergePreview, getSubmission, mergeSandboxBranch, updateSandboxBranchStatus } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; branchId: string }> }) {
  const auth = requireRole(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, branchId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const branch = getSandboxBranchById(branchId);
  if (!branch || (branch.source_submission_id !== id && branch.sandbox_submission_id !== id)) {
    return NextResponse.json({ error: "找不到試作分支" }, { status: 404 });
  }

  return NextResponse.json({ branch, merge_preview: getSandboxMergePreview(branchId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; branchId: string }> }) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id, branchId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const branch = getSandboxBranchById(branchId);
  if (!branch || (branch.source_submission_id !== id && branch.sandbox_submission_id !== id)) {
    return NextResponse.json({ error: "找不到試作分支" }, { status: 404 });
  }
  if (auth.user.role !== "Admin" && branch.created_by !== auth.user.id) {
    return forbidden();
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  if (action !== "promote" && action !== "merge" && action !== "close") {
    return NextResponse.json({ error: "動作必須為升級、合併或關閉" }, { status: 400 });
  }

  if (action === "merge") {
    const result = mergeSandboxBranch({ branchId, userId: auth.user.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ branch: result.branch, merge_preview: result.preview });
  }

  const result = updateSandboxBranchStatus({
    branchId,
    userId: auth.user.id,
    status: action === "promote" ? "promoted" : "closed"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ branch: result.branch });
}
