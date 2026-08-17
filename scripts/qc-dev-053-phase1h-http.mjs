#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const submit = read("src/app/api/numbering/drawing-revisions/submissions/route.ts");
const decision = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const detail = read("src/app/api/approvals/requests/[requestId]/route.ts");
const cleanup = read("src/app/api/approvals/requests/[requestId]/cleanup/route.ts");
const withdraw = read("src/app/api/approvals/requests/[requestId]/withdraw/route.ts");
const legacyRedirect = read("src/lib/approval-workbench-legacy-redirect.ts");
const legacyRoutes = ["approve", "reject", "cancel", "return-for-correction"]
  .map((action) => read(`src/app/api/submissions/[id]/${action}/route.ts`));
const lifecycle = read("src/lib/drawing-revision-lifecycle.ts");
const lifecycleRepository = read("src/lib/repositories/drawing-revision-lifecycle-async-repository.ts");
const approvalRepository = read("src/lib/repositories/approval-platform-async-repository.ts");

record("DEV053-H-HTTP-001 enforced submission uses only the native lifecycle command",
  has(submit, [
    "isDrawingRevisionLifecycleEnforced()",
    "submitDrawingRevisionLifecycle({",
    'request.headers.get("idempotency-key")',
    "submissionId: null",
    "lifecycle: true"
  ]) && submit.indexOf("submitDrawingRevisionLifecycle({") < submit.indexOf("createDrawingSourceSubmission({"));

record("DEV053-H-HTTP-002 native decision exposes all three human decisions",
  has(decision, [
    'detail.actionCode === "numbering.drawing_revision_lifecycle_review"',
    'decision === "needs_info"',
    'decision === "approved" ? "approved" : decision === "needs_info" ? "needs_info" : "returned_for_correction"',
    'requireRoleAsync(request, ["R&D Manager", "Admin"])',
    "drawingRevisionLifecycleErrorPayload(error)"
  ]) && has(lifecycleRepository, [
    'decision: "approved" | "returned_for_correction" | "needs_info"',
    'input.decision === "needs_info" ? "needs_info" : "rejected"'
  ]));

record("DEV053-H-HTTP-003 request detail is company-scoped and exact-reviewer-scoped",
  has(detail, [
    "detail.companyId !== auth.user.company_id",
    "isDrawingRevisionLifecycleReviewer(detail.id, auth.user.id)",
    "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED"
  ]));

record("DEV053-H-HTTP-004 cleaned review link returns 410 with latest drawing navigation",
  has(detail, [
    'searchParams.get("drawing")',
    "drawingRevisionLifecycleLatestHref",
    "APPROVAL_REQUEST_GONE",
    "status: 410"
  ]) && has(lifecycle, ["drawingRevisionLifecycleLatestHref", 'params.set("detail", `drawing:${input.drawingNumberId}`)']));

record("DEV053-H-HTTP-005 only the original submitter can withdraw before a decision",
  has(withdraw, [
    "withdrawDrawingRevisionLifecycle({",
    "actorId: auth.user.id",
    'request.headers.get("idempotency-key")',
    "APPROVAL_REQUEST_GONE"
  ]) && has(lifecycleRepository, [
    "DRAWING_LIFECYCLE_WITHDRAW_FORBIDDEN",
    "DRAWING_LIFECYCLE_DECISION_ALREADY_STARTED",
    "workflow.submitted_by !== input.actorId"
  ]));

record("DEV053-H-HTTP-006 all four legacy mutations are read-only redirects for adopted cases",
  legacyRoutes.every((route) => has(route, [
    "resolveLegacyDrawingLifecycleNavigation",
    "DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED",
    "status: 410",
    "canonicalHref"
  ])) && has(legacyRedirect, [
    "workflow.legacy_submission_id = :submissionId",
    "reviewer_match",
    "drawingRevisionLifecycleLatestHref"
  ]));

const terminalCleanup = lifecycleRepository.slice(
  lifecycleRepository.indexOf("async cleanupTerminalWorkflow"),
  lifecycleRepository.indexOf("async purgeExpiredTokens")
);
record("DEV053-H-HTTP-007 terminal cleanup deletes transient approval graph but retains durable package data",
  has(terminalCleanup, [
    "cleanupTerminalWorkflow",
    "DELETE FROM approval_platform_decisions",
    "DELETE FROM approval_platform_events",
    "DELETE FROM approval_platform_requests",
    "DELETE FROM drawing_revision_lifecycle_reviewers",
    "DELETE FROM drawing_revision_lifecycle_workflows"
  ]) && !/DELETE FROM drawing_revision_package_(files|part_scopes)/u.test(terminalCleanup));

record("DEV053-H-HTTP-008 exact assigned reviewer drives the native inbox",
  has(approvalRepository, [
    "input.actorId",
    "drawing_revision_lifecycle_reviewers",
    "reviewer.reviewer_id = :actorId",
    "r.action_code <> 'numbering.drawing_revision_lifecycle_review'"
  ]));

record("DEV053-H-HTTP-009 fresh native flow writes no permanent legacy task, notification, audit or submission",
  !lifecycleRepository.includes("INSERT INTO submissions") &&
  !lifecycleRepository.includes("INSERT INTO numbering_task_items") &&
  !lifecycleRepository.includes("INSERT INTO numbering_notifications") &&
  !lifecycleRepository.includes("INSERT INTO audit_logs"));

record("DEV053-H-HTTP-010 cleanup retry is request-scoped and reviewer-authorized",
  has(cleanup, [
    "requireRoleAsync(request, [\"R&D Manager\", \"Admin\"])",
    "validateNumberStateMutationRequest",
    "idempotency-key",
    "getApprovalPlatformRequestDetailForCompanyAsync",
    "retryDrawingRevisionLifecycleCleanupForRequest",
    "numbering.drawing_revision_lifecycle_review"
  ]) && has(lifecycle, [
    "getCleanupPendingByRequest",
    "getLifecycleCommandToken",
    "cleanup:key",
    "retryDrawingRevisionLifecycleCleanupForRequest",
    "isAssignedReviewer(input.requestId, input.actorId)"
  ]) && has(detail, ["getDrawingRevisionLifecycleCleanupStateByRequest", "cleanupPending"]));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
