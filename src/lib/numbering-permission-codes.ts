export const NUMBERING_PAGE_PERMISSION_CODES = [
  "numbering.request",
  "numbering.search",
  "numbering.drawings.view",
  "numbering.tasks",
  "numbering.reports"
] as const;

export const NUMBERING_ACTION_PERMISSION_CODES = [
  "numbering.workspace.view",
  "numbering.workspace.create",
  "numbering.workspace.update",
  "numbering.workspace.cancel",
  "numbering.candidate.acquire",
  "numbering.candidate.recycle",
  "numbering.candidate.review.submit",
  "numbering.candidate.review.withdraw",
  "numbering.candidate.review.decide",
  "numbering.publish",
  "transfer.package.view",
  "transfer.package.create",
  "transfer.package.update",
  "transfer.package.review.submit",
  "transfer.package.review.withdraw",
  "transfer.package.review.decide",
  "transfer.package.publish",
  "handoff.published.view",
  "numbering.create",
  "numbering.draft.update",
  "numbering.draft.obsolete",
  "numbering.draft.admin_confirm",
  "numbering.duplicate_check",
  "numbering.link_variant",
  "numbering.approval.request",
  "numbering.approval.batch.create",
  "numbering.approval.batch.decide",
  "numbering.approval.batch.resubmit",
  "numbering.export.create",
  "numbering.audit_report.generate",
  "numbering.task.update",
  "numbering.notification.update",
  "numbering.attachments.manage",
  "numbering.recognition.run",
  "numbering.recognition.review",
  "numbering.recognition.formalize",
  "pdm.comment.create",
  "pdm.advice.create",
  "settings.admin_matrix",
  "approval.inbox.view",
  "update_name",
  "update_spec",
  "obsolete_part_number",
  "obsolete_ma_drawing",
  "obsolete_part_root",
  "merge_part_number",
  "release_missing_ma_confirm",
  "release",
  "post_release_change",
  "same_drawing_variant_after_release",
  "main_drawing_restore"
] as const;

export type NumberingPermissionRequirement = { kind: "page" | "action"; code: string };
export type NumberingPermissionResponse = { pages: Record<string, boolean>; actions: Record<string, boolean> };

export const NUMBERING_NAV_PERMISSION_BY_PATH: Record<string, NumberingPermissionRequirement> = {
  "/numbering/request": { kind: "page", code: "numbering.request" },
  "/numbering/search": { kind: "page", code: "numbering.search" },
  "/numbering/drawings": { kind: "page", code: "numbering.drawings.view" },
  "/numbering/part-drafts": { kind: "page", code: "numbering.tasks" },
  "/parts": { kind: "page", code: "numbering.search" },
  "/approvals": { kind: "action", code: "approval.inbox.view" },
  "/numbering/approvals": { kind: "action", code: "approval.inbox.view" },
  "/numbering/change-reviews": { kind: "action", code: "approval.inbox.view" },
  "/settings/accounts": { kind: "action", code: "settings.admin_matrix" },
  "/settings/account-invitations": { kind: "action", code: "settings.admin_matrix" },
  "/settings": { kind: "action", code: "settings.admin_matrix" }
};

export function permitsNumberingNavigation(permissions: NumberingPermissionResponse | null, requirement: NumberingPermissionRequirement) {
  return permissions?.[requirement.kind === "page" ? "pages" : "actions"]?.[requirement.code] === true;
}
