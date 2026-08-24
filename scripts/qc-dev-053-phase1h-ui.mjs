#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const revisions = read("src/app/numbering/revisions/page.tsx");
const approvals = read("src/app/approvals/page.tsx");
const workbench = read("src/components/drawing-workbench.tsx");
const workbenchService = read("src/lib/drawing-workbench.ts");
const workbenchRepository = read("src/lib/repositories/drawing-workbench-async-repository.ts");
const numberingRepository = read("src/lib/repositories/numbering-async-repository.ts");

record("DEV053-H-UI-001 native submit keeps the user on the shared revision page",
  has(revisions, [
    "data-drawing-lifecycle-next",
    "等待審核；不需要另外到送審明細頁。",
    'lifecycleNext.primaryAction === "view_progress"',
    "查看進度"
  ]) && has(revisions, ["createdSubmissionId && !lifecycleNext", "/submissions/"]));

record("DEV053-H-UI-002 native next-state card exposes one primary action and an optional withdraw secondary",
  has(revisions, [
    '<a className="primary-button" href={lifecycleNext.canonicalHref}>',
    'secondaryActions.includes("withdraw_before_decision")',
    "撤回送審",
    "withdrawLifecycleReview"
  ]) && has(revisions, ["const canCreateRevisionSubmission", "!lifecycleNext"]));

record("DEV053-H-UI-003 lifecycle review is reduced to approve or return, with optional reason",
  has(approvals, [
    'detail.actionCode === "numbering.drawing_revision_lifecycle_review"',
    "退回說明（選填）",
    "退回修改",
    "核准",
    "allowedDecisionsForDetail(detail)"
  ]) && !approvals.includes("此流程必須填寫退回理由"));

record("DEV053-H-UI-004 lifecycle review hides trace and audit controls",
  has(approvals, [
    'detail.actionCode !== "numbering.drawing_revision_lifecycle_review" ? <details className="approval-trace-details">',
    "data-approval-audit-details"
  ]));

record("DEV053-H-UI-005 completed deep links carry drawing fallback and return to latest drawing",
  has(approvals, [
    'const drawing = readInitialTextParam("drawing")',
    "?drawing=${encodeURIComponent(drawing)}",
    "response.status === 410",
    "window.location.assign(body.canonicalHref)"
  ]));

record("DEV053-H-UI-006 drawing workbench uses the five agreed lifecycle labels",
  ["準備中", "送審中", "退回修改", "研發受控", "正式發布"].every((label) => workbenchService.includes(label)) &&
  has(workbenchRepository, ["lifecycle_state", "active_correction_reason", "drawing_revision_lifecycle_reviewers"]));

record("DEV053-H-UI-007 exact reviewer receives review CTA; others see progress",
  has(workbenchService, [
    "const exactReviewer = Boolean",
    'label: exactReviewer ? "前往審核" : "查看進度"',
    "href: exactReviewer ? drawing.pendingApproval?.workbenchHref ?? detailHref : detailHref",
    "drawing.lifecycle.reviewerIds.includes(actor.id)"
  ]));

record("DEV053-H-UI-008 withdrawal remains a compact drawer-header secondary action",
  has(workbenchService, [
    'kind: "withdraw_review"',
    'label: "撤回送審"',
    "drawing.lifecycle.submittedBy === actor.id || actor.canEditNonOwned",
    "drawing.lifecycle.decisionCount === 0"
  ]) && has(workbench, [
    "DrawingLifecycleSecondaryAction",
    "DrawingWorkspaceDrawer",
    "secondaryActions=",
    "Idempotency-Key"
  ]));

record("DEV053-H-UI-009 my tasks are projected and cannot be manually completed",
  has(numberingRepository, [
    "const lifecycleTasks =",
    "drawing_revision_lifecycle_reviewers",
    "reviewer.reviewer_id = :actorId",
    'taskType: "drawing_revision_lifecycle_review"'
  ]) && !fs.existsSync(path.join(root, "src/app/numbering/tasks/page.tsx")));

record("DEV053-H-UI-010 correction reason is visible on the shared workbench",
  has(revisions, [
    "submissionContext?.lifecycle?.state === \"correction_required\"",
    "data-drawing-correction-reason",
    "審核者說明：",
    "請修正後重新送審"
  ]));

record("DEV053-H-UI-011 cleanup retry is a separate, non-decision action",
  has(approvals, [
    "cleanupPending",
    "/cleanup",
    "重試流程整理",
    "不會重新審核或建立第二筆送審"
  ]));

record("DEV053-H-UI-012 approval deep-link first render is hydration-stable",
  has(approvals, [
    "const [statusFilter, setStatusFilter] = useState<StatusFilter>(\"active\")",
    "const [filtersReady, setFiltersReady] = useState(false)",
    "setFiltersReady(true)",
    "if (!filtersReady) return"
  ]));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
