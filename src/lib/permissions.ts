import type { DbUser } from "@/lib/db";
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

export function canReadBomDraft(user: DbUser, submission: SubmissionSummary) {
  return !isBomReleasedOnlyRole(user) && canReadSubmission(user, submission);
}

export function canReadBomReleasedSnapshot(user: DbUser, submission: SubmissionSummary) {
  if (isBomReleasedOnlyRole(user)) return true;
  return canReadSubmission(user, submission);
}
