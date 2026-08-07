import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import { resolveLegacyDrawingLifecycleNavigation } from "@/lib/approval-workbench-legacy-redirect";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const lifecycle = await resolveLegacyDrawingLifecycleNavigation({
    submissionId: id,
    actorId: auth.user.id,
    companyId: auth.user.company_id
  });
  if (lifecycle) {
    return NextResponse.json(
      {
        error: "DRAWING_LIFECYCLE_LEGACY_VIEW_DISABLED",
        code: "DRAWING_LIFECYCLE_LEGACY_VIEW_DISABLED",
        canonicalHref: lifecycle.canonicalHref
      },
      { status: 410 }
    );
  }
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) {
    return forbidden();
  }
  return NextResponse.json({ submission });
}

