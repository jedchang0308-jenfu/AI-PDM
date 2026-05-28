import type { DbUser } from "@/lib/db";
import type { SubmissionSummary } from "@/lib/types";

export function scopedSubmittedBy(user: DbUser) {
  return user.role === "Engineer" ? user.id : undefined;
}

export function canReadSubmission(user: DbUser, submission: SubmissionSummary) {
  return user.role !== "Engineer" || submission.submitted_by === user.id;
}
