import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import {
  getSandboxBranchByIdAsync,
  getSandboxMergePreviewAsync,
  mergeSandboxBranchAsync,
  updateSandboxBranchStatusAsync
} from "@/lib/sandbox-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; branchId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, branchId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const branch = await getSandboxBranchByIdAsync(branchId);
  if (!branch || (branch.source_submission_id !== id && branch.sandbox_submission_id !== id)) {
    return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });
  }

  return NextResponse.json({ branch, merge_preview: await getSandboxMergePreviewAsync(branchId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; branchId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id, branchId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const branch = await getSandboxBranchByIdAsync(branchId);
  if (!branch || (branch.source_submission_id !== id && branch.sandbox_submission_id !== id)) {
    return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });
  }
  if (!(["pdm_admin", "system_admin"] as const).includes(auth.authorizationRoleCode as "pdm_admin" | "system_admin") && branch.created_by !== auth.user.id) {
    return forbidden();
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  if (action !== "promote" && action !== "merge" && action !== "close") {
    return NextResponse.json({ error: "??敹??箏?蝝?雿菜???" }, { status: 400 });
  }
  const terminalReadOnly = submission.release_actionability?.code.startsWith("SUBMISSION_RELEASE_TERMINAL_") ?? false;
  if ((action !== "close" || terminalReadOnly) && submission.release_actionability && !submission.release_actionability.allowed) {
    return NextResponse.json(
      {
        error: submission.release_actionability.code,
        code: submission.release_actionability.code,
        message: submission.release_actionability.message,
        recoveryHref: submission.release_actionability.recovery_href
      },
      { status: 409 }
    );
  }

  if (action === "merge") {
    const result = await mergeSandboxBranchAsync({ branchId, userId: auth.user.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ branch: result.branch, merge_preview: result.preview });
  }

  const result = await updateSandboxBranchStatusAsync({
    branchId,
    userId: auth.user.id,
    status: action === "promote" ? "promoted" : "closed"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ branch: result.branch });
}

