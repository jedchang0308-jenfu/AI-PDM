import { NextResponse } from "next/server";
import { requireAuthAsync, forbidden } from "@/lib/auth-async";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }

  const canReadFullSubmission = await canReadSubmissionAsync(auth.user, submission);
  if (!canReadFullSubmission && !(await canReadSubmissionCompanySummary(auth.user.id, auth.user.company_id, submission.company_id))) {
    return forbidden();
  }

  return NextResponse.json({
    access: canReadFullSubmission ? "full" : "restricted",
    message: canReadFullSubmission
      ? "可讀取完整送審資料。"
      : "你可以查看同公司既有送審摘要；完整附件與審核內容需由送審建立者、主管或管理員查看。",
    summary: {
      id: submission.id,
      drawing_number: submission.drawing_number,
      part_number: submission.part_number,
      part_name: submission.part_name,
      revision: submission.revision,
      status: submission.status,
      submitted_by_name: submission.submitted_by_name,
      created_at: submission.created_at,
      updated_at: submission.updated_at,
      file_count: submission.files.length,
      file_roles: submission.files.map((file) => file.file_role)
    }
  });
}

async function canReadSubmissionCompanySummary(userId: string, userCompanyId: string | null | undefined, submissionCompanyId: string | null | undefined) {
  if (!submissionCompanyId) return true;
  if (userCompanyId === submissionCompanyId) return true;
  const companies = await getUserCompanyAccessAsync(userId);
  return companies.some((company) => company.companyId === submissionCompanyId);
}
