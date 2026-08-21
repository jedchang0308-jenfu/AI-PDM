#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  createHumanStatus,
  HUMAN_STATUS_FILTER_OPTIONS
} from "../src/lib/human-status-projection.ts";
import {
  projectWorkStatusPresentation,
  WORK_STATUS_FILTER_OPTIONS,
  normalizeWorkStatusQuery,
  workStatusMatchesFilter
} from "../src/lib/work-status-presentation.ts";
import {
  projectResponsibilityStatusPair,
  projectRoleResponsibilityStatusPair,
  responsibilityStatusMatchesFilter
} from "../src/lib/responsibility-status-projection.ts";
import { projectPdmDetailStatusPair } from "../src/lib/pdm-detail-status-actionability.ts";
import { projectDrawingRecordAvailability } from "../src/lib/availability-scope.ts";

const results = [];
function check(id, actual, expected) {
  assert.deepEqual(actual, expected, `${id}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  results.push({ id, passed: true });
}

const action = (kind, label = "開啟明細處理", enabled = true) => ({ kind, label, enabled, disabledReason: enabled ? null : "目前條件尚未滿足。", href: "/detail" });
const ownerStatus = createHumanStatus("preparing", "waiting", "準備中", "info", "clock");
const reviewStatus = createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
const finalizingStatus = createHumanStatus("finalizing", "waiting", "發布中", "info", "clock");
const recoveryStatus = createHumanStatus("formalization_failed", "action_required", "正式化失敗", "danger", "alert");
const usableStatus = createHumanStatus("released", "usable", "已發布", "success", "check");
const terminalStatus = createHumanStatus("cancelled", "terminal", "已取消", "neutral", "archive");

const rd = { canEdit: true, canManageRelations: true, canReview: false, canPublish: false, canRestoreMainDrawing: true, canSubmit: true };
const supervisor = { ...rd, canReview: true, canPublish: true };
const otherRd = { ...rd, canEdit: false, canSubmit: false };

const ownerA = projectResponsibilityStatusPair({ status: ownerStatus, actorId: "rd-a", ownerId: "rd-a", hasOwnerResponsibilityAction: true, responsibilityActions: [action("edit")] });
const ownerB = projectResponsibilityStatusPair({ status: ownerStatus, actorId: "rd-b", ownerId: "rd-a", hasOwnerResponsibilityAction: true, responsibilityActions: [action("edit", "開啟明細處理", false)] });
check("RS-01/02-stable-responsibility", ownerA.responsibilityStatus, ownerB.responsibilityStatus);
check("RS-01-owner-mine", ownerA.viewerActionability.isMine, true);
check("RS-02-owner-not-mine", ownerB.viewerActionability.isMine, false);
check("RS-03-edit-review-does-not-change-owner", projectRoleResponsibilityStatusPair({ status: ownerStatus, actorId: "supervisor", capabilities: supervisor, href: "/detail" }).responsibilityStatus.category, "owner");

const reviewExact = projectResponsibilityStatusPair({ status: reviewStatus, actorId: "reviewer-a", reviewerIds: ["reviewer-a"], hasActiveReviewWorkItem: true, responsibilityActions: [action("view_review", "前往審核")] });
const reviewOther = projectResponsibilityStatusPair({ status: reviewStatus, actorId: "rd-a", reviewerIds: ["reviewer-a"], hasActiveReviewWorkItem: true, responsibilityActions: [action("view_review", "前往審核")] });
const reviewQueue = projectResponsibilityStatusPair({ status: reviewStatus, actorId: "supervisor", reviewQueueEligible: true, hasActiveReviewWorkItem: true, responsibilityActions: [action("approve", "前往審核")] });
check("RS-04-review-stable", reviewExact.responsibilityStatus, reviewOther.responsibilityStatus);
check("RS-04-exact-reviewer", reviewExact.viewerActionability.isMine, true);
check("RS-04-other-reviewer", reviewOther.viewerActionability.isMine, false);
check("RS-04-candidate-role-queue", reviewQueue.viewerActionability.isMine, true);
check("RS-05-review-precedes-owner", projectResponsibilityStatusPair({ status: ownerStatus, hasActiveReviewWorkItem: true, responsibilityActions: [action("edit")] }).responsibilityStatus.category, "review_owner");
check("RS-06-returned-owner", projectResponsibilityStatusPair({ status: createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert"), hasOwnerResponsibilityAction: true, responsibilityActions: [action("edit")] }).responsibilityStatus.category, "owner");
check("RS-07-orphan-review", projectResponsibilityStatusPair({ status: reviewStatus, hasActiveReviewWorkItem: false, responsibilityActions: [] }).responsibilityStatus.category, "unknown");
check("RS-07-detail-orphan-review", projectPdmDetailStatusPair({
  objectiveStatus: reviewStatus,
  stateFamily: "in_review",
  actorId: "rd-b",
  ownerId: "rd-a",
  reviewRequestId: null,
  actionBar: { primary: action("view_review", "查看審核", false), secondary: [] }
}).responsibilityStatus.category, "unknown");

const system = projectResponsibilityStatusPair({ status: finalizingStatus, systemFinalizing: true, responsibilityActions: [] });
const admin = projectResponsibilityStatusPair({ status: recoveryStatus, hasSystemAdminRecoveryAction: true, systemAdminQueueEligible: true, responsibilityActions: [action("retry_apply", "重試正式化")] });
const recoveryWithoutAction = projectResponsibilityStatusPair({ status: recoveryStatus, hasSystemAdminRecoveryAction: false, responsibilityActions: [] });
check("RS-08-system", system.responsibilityStatus.category, "system");
check("RS-09-delay-stays-system", projectResponsibilityStatusPair({ status: finalizingStatus, responsibilityActions: [] }).responsibilityStatus.category, "system");
check("RS-10-system-admin", admin.responsibilityStatus.category, "system_admin");
check("RS-10-admin-can-act", admin.viewerActionability.canAct, true);
check("RS-11-no-recovery-action", recoveryWithoutAction.responsibilityStatus.category, "unknown");
check("RS-11-role-no-recovery-action", projectRoleResponsibilityStatusPair({ status: recoveryStatus, actorId: "supervisor", capabilities: supervisor, href: "/detail" }).responsibilityStatus.category, "unknown");
check("RS-12-usable", projectResponsibilityStatusPair({ status: usableStatus, hasOwnerResponsibilityAction: true, responsibilityActions: [action("edit")] }).responsibilityStatus.category, "usable");
check("RS-14-terminal", projectResponsibilityStatusPair({ status: terminalStatus, hasOwnerResponsibilityAction: true, responsibilityActions: [action("edit")] }).responsibilityStatus.category, "terminal");
check("RS-15-no-evidence", projectResponsibilityStatusPair({ status: ownerStatus, responsibilityActions: [] }).responsibilityStatus.category, "unknown");

check("FILTER-owner", responsibilityStatusMatchesFilter(ownerA.responsibilityStatus, ownerA.viewerActionability, ownerStatus, "owner"), true);
check("FILTER-mine-separate", responsibilityStatusMatchesFilter(ownerA.responsibilityStatus, ownerA.viewerActionability, ownerStatus, "needs_action"), true);
check("FILTER-other-separate", responsibilityStatusMatchesFilter(ownerB.responsibilityStatus, ownerB.viewerActionability, ownerStatus, "waiting"), true);
check("FILTER-system-admin", responsibilityStatusMatchesFilter(admin.responsibilityStatus, admin.viewerActionability, recoveryStatus, "system_admin"), true);
check("FILTER-visible-vocabulary", HUMAN_STATUS_FILTER_OPTIONS.map((option) => option.value).includes("needs_action"), false);

const ownerPresentation = projectWorkStatusPresentation({ status: ownerStatus, responsibilityStatus: ownerA.responsibilityStatus });
const reviewPresentation = projectWorkStatusPresentation({ status: reviewStatus, responsibilityStatus: reviewExact.responsibilityStatus });
const systemPresentation = projectWorkStatusPresentation({ status: finalizingStatus, responsibilityStatus: system.responsibilityStatus });
const adminPresentation = projectWorkStatusPresentation({ status: recoveryStatus, responsibilityStatus: admin.responsibilityStatus });
const unknownPresentation = projectWorkStatusPresentation({ status: ownerStatus, responsibilityStatus: recoveryWithoutAction.responsibilityStatus });
const rdPresentation = projectWorkStatusPresentation({ status: usableStatus, responsibilityStatus: projectResponsibilityStatusPair({ status: usableStatus }).responsibilityStatus, availabilityScope: projectDrawingRecordAvailability({ recordStatus: "Active" }) });
const productionPresentation = projectWorkStatusPresentation({ status: usableStatus, responsibilityStatus: projectResponsibilityStatusPair({ status: usableStatus }).responsibilityStatus, availabilityScope: projectDrawingRecordAvailability({ recordStatus: "Released" }) });
const terminalPresentation = projectWorkStatusPresentation({ status: terminalStatus, responsibilityStatus: projectResponsibilityStatusPair({ status: terminalStatus }).responsibilityStatus });
check("P2-owner-label", ownerPresentation?.label, "編輯中");
check("P2-review-label", reviewPresentation?.label, "審核中");
check("P2-system-label", systemPresentation?.label, "審核中");
check("P2-system-copy", systemPresentation?.description, "審核已完成，系統正在自動發布，不需人工操作。");
check("P2-admin-label", adminPresentation?.label, "待確認");
check("P2-unknown-label", unknownPresentation?.label, "待確認");
check("P2-rd-label", rdPresentation?.label, "研發版可使用");
check("P2-production-label", productionPresentation?.label, "量產版可使用");
check("P2-terminal-kind", terminalPresentation?.kind, "terminal_result");
check("P2-terminal-label", terminalPresentation?.label, "已取消");
check("P2-visible-options", WORK_STATUS_FILTER_OPTIONS.map((option) => option.label), ["全部", "編輯中", "審核中", "待確認", "研發版可使用", "量產版可使用"]);
check("P2-legacy-history", normalizeWorkStatusQuery("history", null, null).includeHistory, true);
check("P2-legacy-waiting", normalizeWorkStatusQuery("waiting", null, "all", { supportsMineView: true }).filter, "all");
check("P2-filter-reviewing", workStatusMatchesFilter(system.responsibilityStatus, system.viewerActionability, "reviewing", null), true);
check("P2-filter-availability", workStatusMatchesFilter(projectResponsibilityStatusPair({ status: usableStatus }).responsibilityStatus, projectResponsibilityStatusPair({ status: usableStatus }).viewerActionability, "rd_available", projectDrawingRecordAvailability({ recordStatus: "Active" })), true);
check("P2-viewer-independent-copy", projectWorkStatusPresentation({ status: ownerStatus, responsibilityStatus: ownerA.responsibilityStatus })?.description, projectWorkStatusPresentation({ status: ownerStatus, responsibilityStatus: ownerB.responsibilityStatus })?.description);

console.log(JSON.stringify({ suite: "DEV-078 responsibility status projection", passed: results.length, failed: 0, results }, null, 2));
