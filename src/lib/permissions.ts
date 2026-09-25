import type { NumberingUserScope } from "@/lib/db";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import type { SubmissionSummary } from "@/lib/types";

export function isReleasedSubmissionOnlyRole(user: Pick<NumberingUserScope, "role">) {
  return user.role === "Manufacturing" || user.role === "Procurement";
}

export function scopedSubmittedBy(user: NumberingUserScope) {
  return user.authorizationActor?.sessionSchemaVersion === 2 || user.role === "Engineer" ? user.id : undefined;
}

export function canReadSubmission(user: NumberingUserScope, submission: SubmissionSummary) {
  if (user.authorizationActor?.sessionSchemaVersion === 2) {
    return Boolean(submission.company_id &&
      submission.company_id === user.authorizationActor.companyId &&
      user.authorizationActor.localPrincipalId === user.id &&
      submission.submitted_by === user.id);
  }
  if (isReleasedSubmissionOnlyRole(user)) return submission.status === "Released";
  return user.role !== "Engineer" || submission.submitted_by === user.id;
}

export async function canReadSubmissionAsync(user: NumberingUserScope, submission: SubmissionSummary) {
  if (!(await canAccessSubmissionCompanyAsync(user, submission))) return false;
  return canReadSubmission(user, submission);
}

export async function canAccessSubmissionCompanyAsync(user: NumberingUserScope, submission: SubmissionSummary) {
  if (user.authorizationActor?.sessionSchemaVersion === 2) {
    return Boolean(submission.company_id &&
      submission.company_id === user.authorizationActor.companyId &&
      user.authorizationActor.localPrincipalId === user.id);
  }
  if (!submission.company_id) return true;
  const companies = await getUserCompanyAccessAsync(user.id);
  if (companies.some((company) => company.companyId === submission.company_id)) return true;
  return user.company_id === submission.company_id;
}
