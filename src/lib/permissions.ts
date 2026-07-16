import type { DbUser } from "@/lib/db";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import type { SubmissionSummary } from "@/lib/types";

export function isBomReleasedOnlyRole(user: Pick<DbUser, "role">) {
  return user.role === "Manufacturing" || user.role === "Procurement";
}

export function scopedSubmittedBy(user: DbUser) {
  return user.role === "Engineer" ? user.id : undefined;
}

export function canReadSubmission(user: DbUser, submission: SubmissionSummary) {
  if (isBomReleasedOnlyRole(user)) return submission.status === "Released";
  return user.role !== "Engineer" || submission.submitted_by === user.id;
}

export async function canReadSubmissionAsync(user: DbUser, submission: SubmissionSummary) {
  if (!(await canAccessSubmissionCompanyAsync(user, submission))) return false;
  return canReadSubmission(user, submission);
}

export function canReadBomDraft(user: DbUser, submission: SubmissionSummary) {
  return !isBomReleasedOnlyRole(user) && canReadSubmission(user, submission);
}

export async function canReadBomDraftAsync(user: DbUser, submission: SubmissionSummary) {
  if (!(await canAccessSubmissionCompanyAsync(user, submission))) return false;
  return canReadBomDraft(user, submission);
}

export function canReadBomReleasedSnapshot(user: DbUser, submission: SubmissionSummary) {
  if (isBomReleasedOnlyRole(user)) return true;
  return canReadSubmission(user, submission);
}

export async function canReadBomReleasedSnapshotAsync(user: DbUser, submission: SubmissionSummary) {
  if (!(await canAccessSubmissionCompanyAsync(user, submission))) return false;
  return canReadBomReleasedSnapshot(user, submission);
}

async function canAccessSubmissionCompanyAsync(user: DbUser, submission: SubmissionSummary) {
  if (!submission.company_id) return true;
  const companies = await getUserCompanyAccessAsync(user.id);
  if (companies.some((company) => company.companyId === submission.company_id)) return true;
  return user.company_id === submission.company_id;
}
