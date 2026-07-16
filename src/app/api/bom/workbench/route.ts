import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getBomWorkbenchBySubmissionIdAsync, listDeletedBomWorkbenchDraftsBySubmissionIdAsync } from "@/lib/bom-workbench-async";
import { buildBomWorkbenchDraftLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { canReadBomDraftAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim();
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = await getSubmissionAsync(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadBomDraftAsync(auth.user, submission))) return forbidden();

  if (url.searchParams.get("surface") === "deleted_data") {
    const drafts = await listDeletedBomWorkbenchDraftsBySubmissionIdAsync(submissionId);
    return NextResponse.json({
      surface: "deleted_data",
      drafts: drafts.map((draft) => ({
        draft,
        policy: buildBomWorkbenchDraftLifecyclePolicy({ draftId: draft.id, status: draft.status })
      }))
    });
  }

  return NextResponse.json({
    workbench: await getBomWorkbenchBySubmissionIdAsync(submissionId)
  });
}
