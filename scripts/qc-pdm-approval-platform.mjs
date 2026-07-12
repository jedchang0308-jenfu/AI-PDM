#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(name) {
  checks.push({ name, pass: true });
}

function assert(condition, name) {
  if (!condition) throw new Error(name);
  pass(name);
}

function assertIncludes(source, needle, name) {
  assert(source.includes(needle), name);
}

function assertNotIncludes(source, needle, name) {
  assert(!source.includes(needle), name);
}

function assertThrows(fn, expectedText, name) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedText), name);
    return;
  }
  throw new Error(name);
}

const schema = read("db/schema.sql");
const postgresInitial = read("db/postgres/001_initial_schema.sql");
const rlsPlan = read("db/postgres/002_supabase_rls_plan.sql");
const adr = read(".ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md");
const repositorySource = read("src/lib/repositories/approval-platform-async-repository.ts");
const serviceSource = read("src/lib/approval-platform.ts");
const sidebarSource = read("src/components/sidebar-nav.tsx");
const approvalPageSource = read("src/app/approvals/page.tsx");
const approvalInboxRouteSource = read("src/app/api/approvals/inbox/route.ts");
const numberingAsyncRepositorySource = read("src/lib/repositories/numbering-async-repository.ts");
const numberingDrawingsRouteSource = read("src/app/api/numbering/drawings/route.ts");
const numberingDrawingsPageSource = read("src/app/numbering/drawings/page.tsx");
const numberingSearchPageSource = read("src/app/numbering/search/page.tsx");
const masterAttachmentPanelSource = read("src/components/master-attachment-panel.tsx");
const globalsSource = read("src/app/globals.css");
const numberingApprovalsPageSource = read("src/app/numbering/approvals/page.tsx");
const bomReviewsPageSource = read("src/app/bom/reviews/page.tsx");
const numberingChangeReviewsPageSource = read("src/app/numbering/change-reviews/page.tsx");
const reviewActionHandlerSource = read("src/app/api/numbering/reviews/_review-action-handler.ts");
const legacyRedirectSource = read("src/lib/approval-workbench-legacy-redirect.ts");
const packageJson = JSON.parse(read("package.json"));
const migrationScript = read("scripts/generate-pdm-approval-platform-migration-dry-run.mjs");
const legacyDecisionRoutes = [
  {
    route: "src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts",
    required: "decideApprovalPlatformLegacySubmissionAsync",
    forbidden: ["approveSubmissionObsoleteReviewAsync"]
  },
  {
    route: "src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts",
    required: "decideApprovalPlatformLegacySubmissionAsync",
    forbidden: ["rejectSubmissionObsoleteReviewAsync"]
  },
  {
    route: "src/app/api/bom/reviews/[reviewId]/approve/route.ts",
    required: "decideApprovalPlatformLegacyBomAsync",
    forbidden: ["approveBomWorkbenchReviewAsync"]
  },
  {
    route: "src/app/api/bom/reviews/[reviewId]/reject/route.ts",
    required: "decideApprovalPlatformLegacyBomAsync",
    forbidden: ["rejectBomWorkbenchReviewAsync"]
  },
  {
    route: "src/app/api/numbering/approval-decisions/route.ts",
    required: "decideApprovalPlatformLegacyNumberingAsync",
    forbidden: ["decideNumberingApprovalAsync"]
  },
  {
    route: "src/app/api/numbering/approval-batches/[batchId]/route.ts",
    required: "decideApprovalPlatformLegacyNumberingBatchAsync",
    forbidden: ["decideNumberingApprovalBatchAsync"]
  },
  {
    route: "src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts",
    required: "decideApprovalPlatformLegacyPartCostAsync",
    forbidden: ["decidePartCostChangeRequestAsync"]
  },
  {
    route: "src/app/api/numbering/drawing-revision-packages/supplements/[supplementId]/decision/route.ts",
    required: "decideApprovalPlatformLegacyDrawingPackageSupplementAsync",
    forbidden: ["decideDrawingRevisionPackageSupplementAsync"]
  }
];

for (const table of [
  "approval_platform_actions",
  "approval_platform_packages",
  "approval_platform_requests",
  "approval_platform_targets",
  "approval_platform_impact_snapshots",
  "approval_platform_decisions",
  "approval_platform_events",
  "approval_platform_legacy_links",
  "approval_platform_package_items"
]) {
  assertIncludes(schema, `CREATE TABLE IF NOT EXISTS ${table}`, `SQLite schema creates ${table}`);
  assertIncludes(postgresInitial, `CREATE TABLE IF NOT EXISTS ${table}`, `Postgres initial schema creates ${table}`);
  assertIncludes(rlsPlan, `'${table}'`, `RLS plan includes ${table}`);
}

for (const route of [
  "src/app/api/approvals/actions/route.ts",
  "src/app/api/approvals/inbox/route.ts",
  "src/app/api/approvals/requests/route.ts",
  "src/app/api/approvals/requests/[requestId]/route.ts",
  "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
  "src/app/api/approvals/requests/[requestId]/apply/route.ts"
]) {
  assert(fs.existsSync(path.join(root, route)), `API route exists: ${route}`);
}

assertIncludes(adr, "Use additive `approval_platform_*` v2 tables", "Phase 1A ADR records v2 table decision");
assertIncludes(serviceSource, "APPROVAL_HANDLER_NOT_REGISTERED", "Handler dispatch fails closed when handler is missing");
assertIncludes(serviceSource, "platform.fake", "Fake QC handler is registered");
assertIncludes(serviceSource, "decideLegacyApprovalWithResult", "Legacy decision adapter is present");
assertIncludes(serviceSource, "decideApprovalPlatformLegacyNumberingBatchAsync", "Legacy numbering batch adapter is routed through platform service");
assertIncludes(migrationScript, "PDM_APPROVAL_PLATFORM_MIGRATION_APPLY", "Migration apply path requires explicit environment approval");
assertIncludes(migrationScript, "runApplySelfTest", "Migration QC includes guarded apply self-test");
assert(
  packageJson.scripts["pdm:approval-platform:migration-apply"]?.includes("--confirm-local-approval-platform-migration"),
  "Guarded migration apply script is registered"
);
assertIncludes(repositorySource, "decodeLegacyApprovalId", "Legacy approval IDs are explicitly decoded");
assertIncludes(repositorySource, "listLegacyNumberingInbox", "Numbering adapter participates in unified inbox");
assertIncludes(repositorySource, "listLegacySubmissionInbox", "Submission adapter participates in unified inbox");
assertIncludes(repositorySource, "listLegacyBomInbox", "BOM adapter participates in unified inbox");
assertIncludes(repositorySource, "listLegacyPartCostInbox", "Part cost adapter participates in unified inbox");
assertIncludes(repositorySource, "listLegacyDrawingPackageInbox", "Drawing package adapter participates in unified inbox");
assertIncludes(repositorySource, "legacy_drawing_revision_review", "Drawing revision review adapter participates in unified inbox");
assertIncludes(repositorySource, "listLegacyDrawingRevisionReviewInbox", "Drawing revision review inbox adapter is present");
assertIncludes(numberingAsyncRepositorySource, "listDrawingModulePendingApprovalSummaries", "Phase 1C-C drawing module projects pending drawing revision approvals");
assertIncludes(numberingAsyncRepositorySource, "drawing_revision_fff_assessments", "Phase 1C-C pending approval projection reads FFF assessments");
assertIncludes(numberingAsyncRepositorySource, "review_confirmation_events", "Phase 1C-C pending approval projection excludes confirmed reviews");
assertIncludes(numberingAsyncRepositorySource, "legacy:legacy_drawing_revision_review", "Phase 1C-C drawing projection deep-links to approval workbench detail");
assertIncludes(numberingDrawingsRouteSource, "approvalProjection", "Phase 1C-C drawing API returns approval projection context");
assertIncludes(numberingDrawingsRouteSource, 'canReview: auth.user.role === "R&D Manager" || auth.user.role === "Admin"', "Phase 1C-C drawing API distinguishes reviewer CTA context");
assertIncludes(sidebarSource, 'label: "審核工作台"', "Phase 1C sidebar exposes one primary approval workbench entry");
assertIncludes(sidebarSource, 'badge: "approvalPending"', "Phase 1C approval workbench has pending-review badge");
assertIncludes(sidebarSource, "/api/approvals/inbox?status=pending&limit=100", "Phase 1C sidebar badge reads pending inbox count");
assertIncludes(sidebarSource, "approval-inbox-changed", "Phase 1C sidebar badge refreshes after approval decisions");
assert(!sidebarSource.includes('label: "BOM 審核"'), "Phase 1C removes BOM review from primary sidebar");
assert(!sidebarSource.includes('label: "發行審核"'), "Phase 1C removes release review from primary sidebar");
assert(!sidebarSource.includes('label: "圖面進版影響審核"'), "Phase 1C removes drawing revision impact review from primary sidebar");
assertIncludes(approvalPageSource, "<h1>審核工作台</h1>", "Phase 1C workbench page is labeled as approval workbench");
assertIncludes(approvalPageSource, "const domainFilters", "Phase 1C workbench provides domain filters");
assertIncludes(approvalPageSource, "const actionFilters", "Phase 1C workbench provides action filters");
assertIncludes(approvalPageSource, "numbering.drawing_revision_impact_review", "Phase 1C-B workbench exposes drawing revision impact review filter");
assertIncludes(approvalPageSource, "buildInboxUrl", "Phase 1C workbench applies filters through inbox API query");
assertIncludes(approvalPageSource, "syncFilterQuery", "Phase 1C workbench supports filter deep links");
assertIncludes(approvalPageSource, "legacyRedirectMessages", "Phase 1C-B workbench explains legacy route redirects");
assertIncludes(approvalPageSource, "allowedDecisionsForDetail", "Phase 1C-B workbench hides unsupported legacy decisions");
assertIncludes(numberingDrawingsPageSource, "PendingApprovalBadge", "Phase 1C-C drawing list shows compact pending approval badge");
assertNotIncludes(numberingDrawingsPageSource, "PendingApprovalPanel", "Phase 1C-C drawing detail does not duplicate a pending approval focus panel");
assertNotIncludes(numberingDrawingsPageSource, "待審焦點", "Phase 1C-C drawing detail removes the pending approval focus block");
assertIncludes(numberingDrawingsPageSource, "pendingRevisionReviews", "Phase 1C-C drawing detail passes pending revisions to attachment history");
assertIncludes(numberingDrawingsPageSource, "canReviewApprovals", "Phase 1C-C drawing detail role-scopes review CTA");
assertIncludes(numberingSearchPageSource, "approvalProjection", "Phase 1C-C relation drawer keeps reviewer context from drawing owner API");
assertIncludes(numberingSearchPageSource, "pendingRevisionReviews", "Phase 1C-C relation drawer passes pending revisions to attachment history");
assertIncludes(numberingSearchPageSource, "進版審核", "Phase 1C-C relation drawer surfaces compact drawing pending state");
assertIncludes(masterAttachmentPanelSource, "pendingRevisionReviews", "Phase 1C-C attachment history accepts pending revision projection");
assertIncludes(masterAttachmentPanelSource, "approval-pending", "Phase 1C-C attachment history marks pending approval revisions");
assertIncludes(approvalInboxRouteSource, '"pending"', "Phase 1C inbox API accepts pending status filter");
assertIncludes(approvalInboxRouteSource, "domainCode", "Phase 1C inbox API accepts domain filter");
assertIncludes(approvalInboxRouteSource, "actionCode", "Phase 1C inbox API accepts action filter");
assertIncludes(repositorySource, "matchesInboxFilter", "Phase 1C repository applies unified inbox filters");
assertIncludes(repositorySource, "input.domainCode", "Phase 1C repository filters by domain");
assertIncludes(repositorySource, "input.actionCode", "Phase 1C repository filters by action");
assertIncludes(globalsSource, ".nav-badge", "Phase 1C sidebar badge styling is present");
assertIncludes(globalsSource, ".approval-message.info", "Phase 1C-B legacy redirect info message styling is present");
assertIncludes(globalsSource, ".drawing-pending-approval-chip", "Phase 1C-C drawing pending badge styling is present");
assertNotIncludes(globalsSource, ".drawing-pending-approval-panel", "Phase 1C-C drawing pending focus panel styling is removed");
assertIncludes(globalsSource, ".master-attachment-status.approval-pending", "Phase 1C-C attachment revision pending badge styling is present");
assertIncludes(legacyRedirectSource, "buildLegacyApprovalWorkbenchRedirect", "Phase 1C-B legacy redirect helper is present");
assertIncludes(legacyRedirectSource, "numbering_change_reviews", "Phase 1C-B legacy redirect helper maps drawing revision reviews");
assertIncludes(numberingApprovalsPageSource, "redirect(buildLegacyApprovalWorkbenchRedirect", "Phase 1C-B numbering approvals route redirects to workbench");
assertIncludes(bomReviewsPageSource, "redirect(buildLegacyApprovalWorkbenchRedirect", "Phase 1C-B BOM reviews route redirects to workbench");
assertIncludes(numberingChangeReviewsPageSource, "redirect(buildLegacyApprovalWorkbenchRedirect", "Phase 1C-B drawing revision reviews route redirects to workbench");
assert(!numberingApprovalsPageSource.includes("use client"), "Phase 1C-B numbering approvals page is no longer an independent client inbox");
assert(!bomReviewsPageSource.includes("use client"), "Phase 1C-B BOM reviews page is no longer an independent client inbox");
assert(!numberingChangeReviewsPageSource.includes("use client"), "Phase 1C-B drawing revision reviews page is no longer an independent client inbox");
assertIncludes(serviceSource, "drawingRevisionReviewDecisionAction", "Phase 1C-B platform service maps drawing revision review decisions");
assertIncludes(serviceSource, "decideApprovalPlatformLegacyDrawingRevisionReviewActionAsync", "Phase 1C-B legacy drawing revision route uses platform facade");
assertIncludes(reviewActionHandlerSource, "decideApprovalPlatformLegacyDrawingRevisionReviewActionAsync", "Phase 1C-B direct drawing revision API delegates through platform facade");
assert(!reviewActionHandlerSource.includes("applyDrawingRevisionReviewAction,"), "Phase 1C-B direct drawing revision API no longer imports direct facade");

for (const contract of legacyDecisionRoutes) {
  const routeSource = read(contract.route);
  assertIncludes(routeSource, contract.required, `Friendly decision route uses platform adapter: ${contract.route}`);
  for (const forbidden of contract.forbidden) {
    assert(!routeSource.includes(forbidden), `Friendly decision route no longer imports direct facade ${forbidden}: ${contract.route}`);
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-approval-platform-"));
const dbPath = path.join(tempDir, "qc.sqlite");
const db = new Database(dbPath);

try {
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  db.prepare(
    "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?)"
  ).run("qc-requester", "QC Requester", "qc-requester@example.invalid", "Engineer", "company-jenfu");
  db.prepare(
    "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?)"
  ).run("qc-approver", "QC Approver", "qc-approver@example.invalid", "R&D Manager", "company-jenfu");

  const fakeAction = db.prepare("SELECT action_code, handler_key FROM approval_platform_actions WHERE action_code = ?").get("platform.test.fake");
  assert(fakeAction?.handler_key === "platform.fake", "SQLite seed registers platform fake action");

  assertThrows(
    () => {
      db.prepare(
        `INSERT INTO approval_platform_requests (
          id, company_id, action_code, domain_code, request_status, title, reason, requested_by, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("APR-invalid", "company-jenfu", "platform.missing", "platform", "pending", "Invalid", "Invalid", "qc-requester", "{}");
    },
    "FOREIGN KEY",
    "Unknown action fails closed by FK"
  );

  db.prepare(
    `INSERT INTO approval_platform_requests (
      id, company_id, action_code, domain_code, request_status, title, reason, requested_by, apply_status, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "APR-qc-001",
    "company-jenfu",
    "platform.test.fake",
    "platform",
    "pending",
    "QC approval",
    "QC reason",
    "qc-requester",
    "pending",
    JSON.stringify({ qcOnly: true })
  );
  db.prepare(
    `INSERT INTO approval_platform_targets (
      id, request_id, target_role, target_type, target_id, target_code, target_label, snapshot_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("APT-qc-001", "APR-qc-001", "primary", "qc_target", "target-1", "QC-1", "QC target", "{}", 0);
  db.prepare(
    `INSERT INTO approval_platform_impact_snapshots (
      id, request_id, snapshot_hash, snapshot_json, captured_by
    ) VALUES (?, ?, ?, ?, ?)`
  ).run("APIS-qc-001", "APR-qc-001", "hash-qc", JSON.stringify({ impact: "qc" }), "qc-requester");
  db.prepare(
    `INSERT INTO approval_platform_decisions (
      id, request_id, approver_role, approver_id, decision, comment
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run("APD-qc-001", "APR-qc-001", "R&D Manager", "qc-approver", "approved", "approved");
  db.prepare(
    "UPDATE approval_platform_requests SET request_status = 'applied', apply_status = 'applied', applied_by = ?, applied_at = datetime('now') WHERE id = ?"
  ).run("qc-approver", "APR-qc-001");
  db.prepare(
    `INSERT INTO approval_platform_events (
      id, request_id, event_type, actor_id, detail_json
    ) VALUES (?, ?, ?, ?, ?)`
  ).run("APE-qc-001", "APR-qc-001", "approval_platform.request.applied", "qc-approver", "{}");

  const lifecycle = db.prepare("SELECT request_status, apply_status FROM approval_platform_requests WHERE id = ?").get("APR-qc-001");
  assert(lifecycle?.request_status === "applied" && lifecycle?.apply_status === "applied", "Native fake lifecycle can reach applied state");

  assertThrows(
    () => db.prepare("UPDATE approval_platform_impact_snapshots SET snapshot_json = '{}' WHERE id = ?").run("APIS-qc-001"),
    "APPROVAL_PLATFORM_IMPACT_SNAPSHOT_IMMUTABLE",
    "Impact snapshot update is blocked"
  );
  assertThrows(
    () => db.prepare("DELETE FROM approval_platform_decisions WHERE id = ?").run("APD-qc-001"),
    "APPROVAL_PLATFORM_DECISION_APPEND_ONLY",
    "Decision delete is blocked"
  );
  assertThrows(
    () => db.prepare("UPDATE approval_platform_events SET detail_json = '{}' WHERE id = ?").run("APE-qc-001"),
    "APPROVAL_PLATFORM_EVENT_APPEND_ONLY",
    "Event update is blocked"
  );
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`qc:pdm-approval-platform passed ${checks.length}/${checks.length}`);
