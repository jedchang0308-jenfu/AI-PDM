#!/usr/bin/env node

import Database from "better-sqlite3";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const read = (relativePath) => readProjectFile(root, relativePath);
const readJson = (relativePath) => readProjectJson(root, relativePath);
const schema = read("db/schema.sql");
const repositorySource = read("src/lib/repositories/numbering-repository.ts");
const dbExports = read("src/lib/db.ts");
const variantsRouteSource = read("src/app/api/numbering/variants/route.ts");
const ruleSimulatorRouteSource = read("src/app/api/numbering/rule-simulator/route.ts");
const impactAnalysisRouteSource = read("src/app/api/numbering/impact-analysis/route.ts");
const duplicateCheckRouteSource = read("src/app/api/numbering/duplicate-check/route.ts");
const numberingRecordsRouteSource = read("src/app/api/numbering/records/route.ts");
const draftRecordRouteSource = read("src/app/api/numbering/records/[rootCode]/route.ts");
const draftObsoleteRouteSource = read("src/app/api/numbering/records/[rootCode]/obsolete/route.ts");
const overdueDraftRouteSource = read("src/app/api/numbering/drafts/overdue/route.ts");
const numberingSearchRouteSource = read("src/app/api/numbering/search/route.ts");
const numberingDrawingsRouteSource = read("src/app/api/numbering/drawings/route.ts");
const numberingRootDetailRouteSource = read("src/app/api/numbering/roots/[rootCode]/route.ts");
const approvalRequestRouteSource = read("src/app/api/numbering/approval-requests/route.ts");
const approvalDecisionRouteSource = read("src/app/api/numbering/approval-decisions/route.ts");
const approvalBatchRouteSource = read("src/app/api/numbering/approval-batches/route.ts");
const approvalBatchDetailRouteSource = read("src/app/api/numbering/approval-batches/[batchId]/route.ts");
const numberingTasksRouteSource = read("src/app/api/numbering/tasks/route.ts");
const numberingTaskDetailRouteSource = read("src/app/api/numbering/tasks/[taskId]/route.ts");
const numberingNotificationsRouteSource = read("src/app/api/numbering/notifications/route.ts");
const numberingNotificationReadRouteSource = read("src/app/api/numbering/notifications/[notificationId]/read/route.ts");
const numberingNotificationHandledRouteSource = read("src/app/api/numbering/notifications/[notificationId]/handled/route.ts");
const exportJobRouteSource = read("src/app/api/numbering/export-jobs/route.ts");
const exportJobDetailRouteSource = read("src/app/api/numbering/export-jobs/[jobId]/route.ts");
const monthlyAuditReportRouteSource = read("src/app/api/numbering/monthly-audit-reports/route.ts");
const monthlyAuditReportDetailRouteSource = read("src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts");
const adminMatrixRouteSource = read("src/app/api/numbering/admin/matrix/route.ts");
const permissionRouteSource = read("src/app/api/numbering/permissions/route.ts");
const permissionGuardSource = read("src/lib/numbering-permission-guard.ts");
const permissionCodesSource = read("src/lib/numbering-permission-codes.ts");
const settingsPageSource = read("src/app/settings/page.tsx");
const numberStateWorkspaceSource = read("src/components/number-state-workspace.tsx");
const numberingApprovalPageSource = read("src/app/numbering/approvals/page.tsx");
const approvalWorkbenchPageSource = read("src/app/approvals/page.tsx");
const approvalLegacyRedirectSource = read("src/lib/approval-workbench-legacy-redirect.ts");
const numberingSearchPageSource = read("src/app/numbering/search/page.tsx");
const numberingDrawingsPageSource = read("src/app/numbering/drawings/page.tsx");
const numberingImpactPageSource = read("src/app/numbering/impact/page.tsx");
const numberingTaskCenterPageSource = read("src/app/numbering/tasks/page.tsx");
const numberingReportCenterPageSource = read("src/app/numbering/reports/page.tsx");
const sidebarNavSource = read("src/components/sidebar-nav.tsx");
const packageJson = readJson("package.json");
const concurrencyReuseScriptSource = read("scripts/qc-pdm-numbering-concurrency-reuse.mjs");
const draftLifecycleScriptSource = read("scripts/qc-pdm-numbering-draft-lifecycle.mjs");
const crossRoleAuditScriptSource = read("scripts/qc-pdm-numbering-cross-role-audit-e2e.mjs");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function indexExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name));
}

function triggerExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(name));
}

function expectConstraint(name, fn) {
  try {
    fn();
    record(name, false, "constraint did not reject invalid write");
  } catch (error) {
    record(name, true, error instanceof Error ? error.message : String(error));
  }
}

const db = new Database(":memory:");
db.exec(schema);

for (const table of [
  "numbering_sequences",
  "numbering_rule_versions",
  "part_roots",
  "part_numbers",
  "drawing_numbers",
  "drawing_part_links",
  "same_drawing_variants",
  "duplicate_check_events",
  "warning_events",
  "numbering_task_items",
  "numbering_notifications",
  "rule_templates",
  "approval_rules",
  "approval_requests",
  "approval_decisions",
  "approval_batches",
  "approval_batch_items",
  "roles",
  "role_permissions",
  "role_scope_rules",
  "user_role_assignments",
  "role_priority_versions",
  "approval_delegations",
  "file_assets",
  "numbering_export_jobs",
  "monthly_audit_reports"
]) {
  record(`NUM-SCHEMA table exists ${table}`, tableExists(db, table), table);
}

record(
  "NUM-SCHEMA default numbering rule exists",
  Boolean(db.prepare("SELECT id FROM numbering_rule_versions WHERE id = 'numbering-rule-v1'").get()),
  "numbering_rule_versions"
);
record(
  "NUM-SCHEMA compact numbering rule exists",
  Boolean(db.prepare("SELECT id FROM numbering_rule_versions WHERE id = 'numbering-rule-v2'").get()),
  "numbering_rule_versions"
);
record(
  "NUM-SCHEMA rule templates seeded",
  db.prepare("SELECT COUNT(*) AS count FROM rule_templates").get().count >= 3,
  "rule_templates"
);
record(
  "NUM-SCHEMA approval rules seeded",
  db.prepare("SELECT COUNT(*) AS count FROM approval_rules WHERE rule_version_id = 'numbering-rule-v1'").get().count >= 12,
  "approval_rules"
);
record("NUM-SCHEMA built-in roles seeded", db.prepare("SELECT COUNT(*) AS count FROM roles WHERE system_defined = 1").get().count >= 6, "roles");
record(
  "NUM-SCHEMA default role page permissions seeded",
  db.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE permission_kind = 'page' AND allowed = 1").get().count >= 20,
  "role_permissions.page"
);
record(
  "NUM-SCHEMA default role action permissions seeded",
  db.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE permission_kind = 'action' AND allowed = 1").get().count >= 60,
  "role_permissions.action"
);
record(
  "NUM-SCHEMA RD cannot decide approval batches by default",
  !db
    .prepare(
      `SELECT rp.id
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE r.role_code = 'rd'
         AND rp.permission_kind = 'action'
         AND rp.permission_code = 'numbering.approval.batch.decide'
         AND rp.allowed = 1`
    )
    .get(),
  "role_permissions.rd.batch_decide"
);
record(
  "NUM-SCHEMA RD can update and obsolete drafts without admin approval by default",
  db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE r.role_code = 'rd'
         AND rp.permission_kind = 'action'
         AND rp.permission_code IN ('numbering.draft.update', 'numbering.draft.obsolete')
         AND rp.allowed = 1`
    )
    .get().count === 2,
  "role_permissions.rd.draft"
);
record(
  "NUM-SCHEMA overdue draft admin confirmation stays admin-only by default",
  db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE r.role_code IN ('system_admin', 'pdm_admin')
         AND rp.permission_kind = 'action'
         AND rp.permission_code = 'numbering.draft.admin_confirm'
         AND rp.allowed = 1`
    )
    .get().count === 2 &&
    !db
      .prepare(
        `SELECT rp.id
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.role_code = 'rd'
           AND rp.permission_kind = 'action'
           AND rp.permission_code = 'numbering.draft.admin_confirm'
           AND rp.allowed = 1`
      )
      .get(),
  "role_permissions.draft.admin_confirm"
);
record("NUM-SCHEMA role scope index exists", indexExists(db, "idx_role_scope_rules_role_kind"), "role_scope_rules");
record("NUM-SCHEMA user role assignment active index exists", indexExists(db, "idx_user_role_assignments_user_active"), "user_role_assignments");
record("NUM-SCHEMA user role assignment unique active index exists", indexExists(db, "idx_user_role_assignments_active_unique"), "user_role_assignments");
record("NUM-SCHEMA audit update trigger exists", triggerExists(db, "trg_audit_logs_no_update"), "audit_logs");
record("NUM-SCHEMA audit delete trigger exists", triggerExists(db, "trg_audit_logs_no_delete"), "audit_logs");
record("NUM-SCHEMA primary manufacturing partial unique index exists", indexExists(db, "idx_drawing_part_links_primary_per_part"));
record(
  "NUM-SCHEMA part numbers support custom specification",
  db.prepare("PRAGMA table_info(part_numbers)").all().some((column) => column.name === "custom_specification"),
  "part_numbers.custom_specification"
);

const now = new Date().toISOString();
db.prepare(
  "INSERT INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("engineer-1", "Engineer One", "engineer@example.test", "Engineer", now, now);
db.prepare(
  "INSERT INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("manager-1", "Manager One", "manager@example.test", "R&D Manager", now, now);
db.prepare(
  "INSERT INTO part_roots (id, root_code, core_name, item_kind, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
).run("root-1", "0001", "外殼", "manufactured", "Draft", "numbering-rule-v1", now, now);
db.prepare(
  "INSERT INTO part_numbers (id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("part-1", "root-1", "P-0001-001", 1, "001", "外殼_A", "manufactured", 0, "Draft", "numbering-rule-v1", now, now);
db.prepare(
  "INSERT INTO drawing_numbers (id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("drawing-1", "root-1", "D-0001-MA1", "MA", "製造用圖", 1, 1, "Draft", "numbering-rule-v1", now, now);
db.prepare(
  "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)"
).run("link-1", "drawing-1", "part-1", "primary_manufacturing", now);
db.prepare(
  "INSERT INTO part_numbers (id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("part-2", "root-1", "P-0001-002", 2, "002", "憭挺_B", "manufactured", 0, "Draft", "numbering-rule-v1", now, now);
db.prepare(
  "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)"
).run("link-variant", "drawing-1", "part-2", "primary_manufacturing", now);
db.prepare(
  "INSERT INTO same_drawing_variants (id, drawing_number_id, part_number_id, field_name, field_value, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("variant-1", "drawing-1", "part-2", "material", "PC", now);
db.prepare(
  "INSERT INTO duplicate_check_events (id, entity_type, query_json, result_json, blocked, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("dup-event-1", "part_number", "{\"partName\":\"test\"}", "{\"matches\":[]}", 0, now);
db.prepare(
  "INSERT INTO warning_events (id, warning_code, severity, entity_type, entity_id, title, message, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("warning-1", "HIGH_SIMILARITY_NUMBERING", "warning", "part_number", "part-2", "High similarity", "warning only", "{}", now);
db.prepare(
  "INSERT INTO numbering_task_items (id, task_type, entity_type, entity_id, title, message, risk_level, task_status, assigned_role, detail_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("task-1", "approval_request", "part_number", "part-1", "Review", "Pending review", "warning", "open", "pdm_admin", "{}", now, now);
db.prepare(
  "INSERT INTO numbering_notifications (id, notification_type, entity_type, entity_id, title, message, severity, recipient_role, detail_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("notification-1", "approval_request_pending", "part_number", "part-1", "Review", "Pending review", "warning", "pdm_admin", "{}", now, now);
db.prepare(
  "INSERT INTO numbering_export_jobs (id, export_mode, status, result_json, generated_by, generated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("export-job-1", "last_change_summary", "completed", "{\"rows\":[]}", "manager-1", now, now);
db.prepare(
  "INSERT INTO monthly_audit_reports (id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
).run("monthly-report-1", "numbering_master", "2026-06", "manual", "manager-1", "completed", "{\"counts\":{}}", now);
db.prepare(
  "INSERT INTO approval_requests (id, request_type, action_code, entity_type, entity_id, request_status, reason, payload_json, requested_by, requested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("approval-request-1", "numbering", "update_name", "part_number", "part-1", "pending", "Review part name update", "{}", "engineer-1", now, now, now);
db.prepare(
  "INSERT INTO approval_decisions (id, approval_request_id, approver_role, approver_id, decision, comment, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("approval-decision-1", "approval-request-1", "rd_manager", "manager-1", "approved", "ok", now);
db.prepare(
  "INSERT INTO approval_batches (id, batch_code, request_type, project_code, action_code, batch_status, submitted_by, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
).run("approval-batch-1", "NB-QC-1", "numbering", "PRJ-QC", "update_name", "pending", "engineer-1", now, now, now);
db.prepare(
  "INSERT INTO approval_batch_items (id, batch_id, approval_request_id, item_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("approval-batch-item-1", "approval-batch-1", "approval-request-1", "pending", now, now);
db.prepare("INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
  "audit-log-1",
  "manager-1",
  "numbering.qc.audit_seed",
  "{\"before\":null,\"after\":{\"entityId\":\"part-1\"},\"diff\":{\"entityId\":{\"before\":null,\"after\":\"part-1\"}}}",
  now
);
record(
  "NUM-CONSTRAINT same MA drawing may link multiple part numbers",
  db.prepare("SELECT COUNT(*) AS count FROM drawing_part_links WHERE drawing_number_id = ? AND link_type = 'primary_manufacturing'").get("drawing-1").count === 2,
  "drawing_part_links"
);
record(
  "NUM-SCHEMA same drawing variant metadata saved",
  Boolean(db.prepare("SELECT id FROM same_drawing_variants WHERE drawing_number_id = ? AND part_number_id = ?").get("drawing-1", "part-2")),
  "same_drawing_variants"
);
record(
  "NUM-SCHEMA duplicate check event saved",
  Boolean(db.prepare("SELECT id FROM duplicate_check_events WHERE id = ? AND blocked = 0").get("dup-event-1")),
  "duplicate_check_events"
);
record(
  "NUM-SCHEMA warning event saved",
  Boolean(db.prepare("SELECT id FROM warning_events WHERE id = ? AND severity = 'warning'").get("warning-1")),
  "warning_events"
);
record(
  "NUM-SCHEMA numbering task saved",
  Boolean(db.prepare("SELECT id FROM numbering_task_items WHERE id = ? AND task_status = 'open'").get("task-1")),
  "numbering_task_items"
);
record(
  "NUM-SCHEMA numbering notification saved unread/unhandled",
  Boolean(db.prepare("SELECT id FROM numbering_notifications WHERE id = ? AND read_at IS NULL AND handled_at IS NULL").get("notification-1")),
  "numbering_notifications"
);
record(
  "NUM-SCHEMA numbering export job saved",
  Boolean(db.prepare("SELECT id FROM numbering_export_jobs WHERE id = ? AND export_mode = 'last_change_summary'").get("export-job-1")),
  "numbering_export_jobs"
);
record(
  "NUM-SCHEMA monthly numbering audit report saved",
  Boolean(db.prepare("SELECT id FROM monthly_audit_reports WHERE id = ? AND report_type = 'numbering_master'").get("monthly-report-1")),
  "monthly_audit_reports"
);
record(
  "NUM-SCHEMA approval request saved",
  Boolean(db.prepare("SELECT id FROM approval_requests WHERE id = ? AND request_status = 'pending'").get("approval-request-1")),
  "approval_requests"
);
record(
  "NUM-SCHEMA approval decision saved",
  Boolean(db.prepare("SELECT id FROM approval_decisions WHERE approval_request_id = ?").get("approval-request-1")),
  "approval_decisions"
);
record(
  "NUM-SCHEMA approval batch saved",
  Boolean(db.prepare("SELECT id FROM approval_batches WHERE id = ? AND batch_status = 'pending'").get("approval-batch-1")),
  "approval_batches"
);
record(
  "NUM-SCHEMA approval batch item saved",
  Boolean(db.prepare("SELECT id FROM approval_batch_items WHERE batch_id = ? AND item_status = 'pending'").get("approval-batch-1")),
  "approval_batch_items"
);
record(
  "NUM-SCHEMA audit log saved with before/after/diff",
  Boolean(
    db
      .prepare("SELECT id FROM audit_logs WHERE id = ? AND detail_json LIKE '%before%' AND detail_json LIKE '%after%' AND detail_json LIKE '%diff%'")
      .get("audit-log-1")
  ),
  "audit_logs"
);

expectConstraint("NUM-CONSTRAINT duplicate root_code rejected", () => {
  db.prepare(
    "INSERT INTO part_roots (id, root_code, core_name, item_kind, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("root-dup", "0001", "外殼 duplicate", "manufactured", "Draft", "numbering-rule-v1", now, now);
});
expectConstraint("NUM-CONSTRAINT duplicate part_number rejected", () => {
  db.prepare(
    "INSERT INTO part_numbers (id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("part-dup", "root-1", "P-0001-001", 2, "002", "外殼_B", "manufactured", 0, "Draft", "numbering-rule-v1", now, now);
});
expectConstraint("NUM-CONSTRAINT duplicate drawing_number rejected", () => {
  db.prepare(
    "INSERT INTO drawing_numbers (id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("drawing-dup", "root-1", "D-0001-MA1", "MA", "製造用圖", 2, 1, "Draft", "numbering-rule-v1", now, now);
});
expectConstraint("NUM-CONSTRAINT one primary manufacturing link per part", () => {
  db.prepare(
    "INSERT INTO drawing_numbers (id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("drawing-2", "root-1", "D-0001-MA2", "MA", "製造用圖", 2, 1, "Draft", "numbering-rule-v1", now, now);
  db.prepare(
    "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run("link-2", "drawing-2", "part-1", "primary_manufacturing", now);
});
expectConstraint("NUM-CONSTRAINT audit logs cannot be updated", () => {
  db.prepare("UPDATE audit_logs SET action = ? WHERE id = ?").run("numbering.qc.audit_update", "audit-log-1");
});
expectConstraint("NUM-CONSTRAINT audit logs cannot be deleted", () => {
  db.prepare("DELETE FROM audit_logs WHERE id = ?").run("audit-log-1");
});

record("NUM-REPO repository exports createNumberingRecord", repositorySource.includes("export function createNumberingRecord"), "numbering-repository.ts");
record("NUM-REPO repository uses sqlite transaction", repositorySource.includes("database.transaction(() =>"), "numbering-repository.ts");
record(
  "NUM-REPO updates draft numbering without creating approval request",
  repositorySource.includes("export function updateDraftNumberingRecord") &&
    repositorySource.includes("numbering.draft.update") &&
    repositorySource.includes("assertDraftMutableStatus"),
  "numbering-repository.ts"
);
record(
  "NUM-REPO obsoletes draft numbering without creating approval request",
  repositorySource.includes("export function obsoleteDraftNumberingRecord") &&
    repositorySource.includes("numbering.draft.obsolete") &&
    repositorySource.includes("OBSOLETE_REASON_REQUIRED"),
  "numbering-repository.ts"
);
record(
  "NUM-REPO marks overdue drafts for admin confirmation",
  repositorySource.includes("export function markOverdueDraftNumberingRecords") &&
    repositorySource.includes("PendingAdminConfirm") &&
    repositorySource.includes("draft_admin_confirm") &&
    repositorySource.includes("numbering.draft.pending_admin_confirm"),
  "numbering-repository.ts"
);
record("NUM-REPO enforces reference purpose description", repositorySource.includes("REFERENCE_PURPOSE_DESCRIPTION_REQUIRED"), "numbering-repository.ts");
record("NUM-REPO enforces universal reason", repositorySource.includes("UNIVERSAL_PART_REASON_REQUIRED"), "numbering-repository.ts");
record("NUM-REPO treats shared item kind as universal", repositorySource.includes('itemKind === "shared" || input.isUniversal'), "numbering-repository.ts");
record("NUM-REPO links same-drawing variants", repositorySource.includes("export function linkPartNumberToDrawing"), "numbering-repository.ts");
record("NUM-REPO requires same-drawing variant details", repositorySource.includes("SAME_DRAWING_VARIANT_REQUIRED"), "numbering-repository.ts");
record("NUM-REPO evaluates technical-transfer and release data controls", repositorySource.includes("export function evaluateNumberingGate"), "numbering-repository.ts");
record("NUM-REPO blocks missing primary MA at gate", repositorySource.includes("PRIMARY_MA_REQUIRED"), "numbering-repository.ts");
record(
  "NUM-REPO analyzes MA drawing obsolescence impact",
  repositorySource.includes("export function analyzeMainDrawingObsolescence") && repositorySource.includes("MainDrawingInvalid"),
  "numbering-repository.ts"
);
record("NUM-REPO checks duplicate/high-similarity warnings", repositorySource.includes("export function checkNumberingDuplicates"), "numbering-repository.ts");
record("NUM-REPO keeps high similarity warning-only", repositorySource.includes("HIGH_SIMILARITY_NUMBERING"), "numbering-repository.ts");
record("NUM-REPO requests numbering approvals", repositorySource.includes("export function requestNumberingApproval"), "numbering-repository.ts");
record("NUM-REPO decides numbering approvals", repositorySource.includes("export function decideNumberingApproval"), "numbering-repository.ts");
record("NUM-REPO evaluates configurable approval rules", repositorySource.includes("export function evaluateApprovalRules"), "numbering-repository.ts");
record("NUM-REPO keeps hard approval limits outside matrix toggles", repositorySource.includes("DUPLICATE_CODE_HARD_BLOCK"), "numbering-repository.ts");
record("NUM-REPO creates numbering approval batches", repositorySource.includes("export function createNumberingApprovalBatch"), "numbering-repository.ts");
record("NUM-REPO decides numbering approval batches", repositorySource.includes("export function decideNumberingApprovalBatch"), "numbering-repository.ts");
record("NUM-REPO resubmits rejected batch items only", repositorySource.includes("export function resubmitRejectedNumberingApprovalBatchItems"), "numbering-repository.ts");
record("NUM-REPO lists approval review batches", repositorySource.includes("export function listNumberingApprovalBatches"), "numbering-repository.ts");
record("NUM-REPO supports item-specific batch review comments", repositorySource.includes("itemComments") && repositorySource.includes("itemComment || input.comment"), "numbering-repository.ts");
record("NUM-REPO lists numbering tasks", repositorySource.includes("export function listNumberingTasks"), "numbering-repository.ts");
record("NUM-REPO updates numbering task status", repositorySource.includes("export function updateNumberingTaskStatus"), "numbering-repository.ts");
record("NUM-REPO lists numbering notifications", repositorySource.includes("export function listNumberingNotifications"), "numbering-repository.ts");
record("NUM-REPO updates numbering notification read/handled state", repositorySource.includes("export function updateNumberingNotificationState"), "numbering-repository.ts");
record("NUM-REPO creates numbering export jobs", repositorySource.includes("export function createNumberingExportJob"), "numbering-repository.ts");
record("NUM-REPO lists numbering export jobs", repositorySource.includes("export function listNumberingExportJobs"), "numbering-repository.ts");
record("NUM-REPO supports no/last/full audit export modes", repositorySource.includes("last_change_summary") && repositorySource.includes("full_change_summary"), "numbering-repository.ts");
record("NUM-REPO generates monthly numbering audit metadata", repositorySource.includes("export function generateMonthlyNumberingAuditReport"), "numbering-repository.ts");
record(
  "NUM-REPO monthly audit metadata includes department pages",
  repositorySource.includes("buildReportDepartmentPages") && repositorySource.includes("projectBuckets"),
  "numbering-repository.ts"
);
record("NUM-REPO lists monthly numbering audit reports", repositorySource.includes("export function listMonthlyNumberingAuditReports"), "numbering-repository.ts");
record(
  "NUM-REPO normalizes audit detail with before after diff and markers",
  repositorySource.includes("normalizeAuditDetail") &&
    repositorySource.includes("computeAuditDiff") &&
    repositorySource.includes("before") &&
    repositorySource.includes("after") &&
    repositorySource.includes("diff") &&
    repositorySource.includes("markers"),
  "numbering-repository.ts"
);
record(
  "NUM-REPO does not mutate audit logs after insert",
  !repositorySource.includes("UPDATE audit_logs") && !repositorySource.includes("DELETE FROM audit_logs"),
  "numbering-repository.ts"
);
record("NUM-REPO lists admin approval matrix", repositorySource.includes("export function listNumberingAdminMatrix"), "numbering-repository.ts");
record("NUM-REPO upserts admin approval rules", repositorySource.includes("export function upsertNumberingApprovalRule"), "numbering-repository.ts");
record("NUM-REPO applies approval rule templates", repositorySource.includes("export function applyNumberingRuleTemplate"), "numbering-repository.ts");
record("NUM-REPO audits admin approval rule changes", repositorySource.includes("numbering.approval_rule.upsert"), "numbering-repository.ts");
record("NUM-REPO upserts custom roles", repositorySource.includes("export function upsertNumberingAdminRole"), "numbering-repository.ts");
record("NUM-REPO upserts role permissions", repositorySource.includes("export function upsertNumberingRolePermission"), "numbering-repository.ts");
record("NUM-REPO saves role priority versions", repositorySource.includes("export function saveNumberingRolePriority"), "numbering-repository.ts");
record("NUM-REPO upserts role scopes", repositorySource.includes("export function upsertNumberingRoleScope"), "numbering-repository.ts");
record("NUM-REPO upserts approval delegations", repositorySource.includes("export function upsertNumberingApprovalDelegation"), "numbering-repository.ts");
record("NUM-REPO revokes approval delegations", repositorySource.includes("export function revokeNumberingApprovalDelegation"), "numbering-repository.ts");
record("NUM-REPO checks role matrix permissions", repositorySource.includes("export function checkNumberingPermission"), "numbering-repository.ts");
record(
  "NUM-REPO permission check follows active role priority",
  repositorySource.includes("getActiveRolePriority") && repositorySource.includes("sortRoleCodesByPriority") && repositorySource.includes("permissionByRoleId"),
  "numbering-repository.ts"
);
record(
  "NUM-REPO permission check supports scoped delegated roles",
  repositorySource.includes("delegationMatchesPermissionScope") && repositorySource.includes("delegatedRoles"),
  "numbering-repository.ts"
);
record(
  "NUM-REPO applies delegated and scoped access to tasks",
  repositorySource.includes("getNumberingAccessContext") && repositorySource.includes("canAccessNumberingRoleItem") && repositorySource.includes("delegatedAccessAllowed"),
  "numbering-repository.ts"
);
record("NUM-REPO requests main drawing restore approvals", repositorySource.includes("export function requestMainDrawingRestoreApproval"), "numbering-repository.ts");
record("NUM-REPO applies approved same-drawing variant", repositorySource.includes("same_drawing_variant_after_release"), "numbering-repository.ts");
record("NUM-REPO blocks released same-drawing variant without approval", repositorySource.includes("SAME_DRAWING_VARIANT_APPROVAL_REQUIRED"), "numbering-repository.ts");
record("NUM-REPO evaluates approved missing-MA override", repositorySource.includes("release_missing_ma_confirm"), "numbering-repository.ts");
record("NUM-REPO validates restore source status", repositorySource.includes("MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART"), "numbering-repository.ts");
record("NUM-REPO validates restore replacement MA drawing", repositorySource.includes("MAIN_DRAWING_RESTORE_REQUIRES_SAME_ROOT_MA_DRAWING"), "numbering-repository.ts");
record("NUM-REPO applies approved main drawing restore", repositorySource.includes("numbering.main_drawing.restore"), "numbering-repository.ts");
record("NUM-REPO db.ts re-exports numbering repository", dbExports.includes("createNumberingRecord"), "src/lib/db.ts");
record("NUM-REPO db.ts re-exports variant linker", dbExports.includes("linkPartNumberToDrawing"), "src/lib/db.ts");
record("NUM-REPO db.ts re-exports duplicate checker", dbExports.includes("checkNumberingDuplicates"), "src/lib/db.ts");
record("NUM-REPO db.ts re-exports approval workflow", dbExports.includes("requestNumberingApproval") && dbExports.includes("decideNumberingApproval"), "src/lib/db.ts");
record("NUM-REPO db.ts re-exports approval rule evaluator", dbExports.includes("evaluateApprovalRules"), "src/lib/db.ts");
record(
  "NUM-REPO db.ts re-exports draft lifecycle workflow",
  dbExports.includes("updateDraftNumberingRecord") &&
    dbExports.includes("obsoleteDraftNumberingRecord") &&
    dbExports.includes("markOverdueDraftNumberingRecords"),
  "src/lib/db.ts"
);
record(
  "NUM-REPO db.ts re-exports approval batch workflow",
  dbExports.includes("createNumberingApprovalBatch") && dbExports.includes("decideNumberingApprovalBatch") && dbExports.includes("listNumberingApprovalBatches"),
  "src/lib/db.ts"
);
record("NUM-REPO db.ts re-exports task and notification workflow", dbExports.includes("listNumberingTasks") && dbExports.includes("updateNumberingNotificationState"), "src/lib/db.ts");
record(
  "NUM-REPO db.ts re-exports export/report workflow",
  dbExports.includes("createNumberingExportJob") &&
    dbExports.includes("listNumberingExportJobs") &&
    dbExports.includes("generateMonthlyNumberingAuditReport") &&
    dbExports.includes("listMonthlyNumberingAuditReports"),
  "src/lib/db.ts"
);
record(
  "NUM-REPO db.ts re-exports admin matrix workflow",
  dbExports.includes("listNumberingAdminMatrix") &&
    dbExports.includes("upsertNumberingApprovalRule") &&
    dbExports.includes("applyNumberingRuleTemplate") &&
    dbExports.includes("upsertNumberingRolePermission") &&
    dbExports.includes("saveNumberingRolePriority") &&
    dbExports.includes("upsertNumberingApprovalDelegation") &&
    dbExports.includes("checkNumberingPermission"),
  "src/lib/db.ts"
);
record(
  "NUM-REPO db.ts re-exports search and detail workflow",
  dbExports.includes("searchNumberingRecords") && dbExports.includes("getNumberingRootDetail"),
  "src/lib/db.ts"
);
record(
  "NUM-REPO db.ts re-exports drawing module workflow",
  dbExports.includes("listDrawingModuleRecords") &&
    dbExports.includes("DrawingModuleListRecord") &&
    repositorySource.includes("export function listDrawingModuleRecords"),
  "src/lib/db.ts"
);
record("NUM-REPO db.ts re-exports main drawing restore approval", dbExports.includes("requestMainDrawingRestoreApproval"), "src/lib/db.ts");
record("NUM-API variant route calls linker", variantsRouteSource.includes("linkPartNumberToDrawing"), "variants/route.ts");
record(
  "NUM-API permission route exposes page and action permissions",
  permissionRouteSource.includes("NUMBERING_PAGE_PERMISSION_CODES") &&
    permissionRouteSource.includes("NUMBERING_ACTION_PERMISSION_CODES") &&
    permissionRouteSource.includes("checkNumberingPermission"),
  "permissions/route.ts"
);
record(
  "NUM-API permission guard centralizes role matrix checks",
  permissionGuardSource.includes("requireNumberingPermission") &&
    permissionGuardSource.includes("checkNumberingPermission") &&
    permissionGuardSource.includes("canUserUseNumberingAction"),
  "numbering-permission-guard.ts"
);
record(
  "NUM-API rule simulator route calls gate and approval evaluators",
  ruleSimulatorRouteSource.includes("evaluateNumberingGate") &&
    ruleSimulatorRouteSource.includes("evaluateApprovalRules") &&
    ruleSimulatorRouteSource.includes("settings.admin_matrix"),
  "rule-simulator/route.ts"
);
record(
  "NUM-API impact analysis route protects invalidation",
  impactAnalysisRouteSource.includes("analyzeMainDrawingObsolescence") &&
    impactAnalysisRouteSource.includes("numbering.impact.apply") &&
    impactAnalysisRouteSource.includes("Admin or R&D Manager"),
  "impact-analysis/route.ts"
);
record(
  "NUM-API duplicate-check route calls checker and permission guard",
  duplicateCheckRouteSource.includes("checkNumberingDuplicates") && duplicateCheckRouteSource.includes("numbering.duplicate_check"),
  "duplicate-check/route.ts"
);
record(
  "NUM-API numbering records route creates draft records through permission guard",
  numberingRecordsRouteSource.includes("createNumberingRecord") && numberingRecordsRouteSource.includes("numbering.create"),
  "records/route.ts"
);
record("NUM-API numbering records route validates custom and shared inputs", numberingRecordsRouteSource.includes("customSpecification") && numberingRecordsRouteSource.includes("universalReason"), "records/route.ts");
record("NUM-API numbering records route treats shared items as universal", numberingRecordsRouteSource.includes('itemKind === "shared"'), "records/route.ts");
record(
  "NUM-API numbering records route validates current creation inputs",
  numberingRecordsRouteSource.includes("itemKind is required") && numberingRecordsRouteSource.includes("drawingPurposeCode is required when drawingRequested is true"),
  "records/route.ts"
);
record(
  "NUM-API draft record route updates drafts through action guard",
  draftRecordRouteSource.includes("updateDraftNumberingRecord") && draftRecordRouteSource.includes("numbering.draft.update"),
  "records/[rootCode]/route.ts"
);
record(
  "NUM-API draft obsolete route obsoletes drafts through action guard",
  draftObsoleteRouteSource.includes("obsoleteDraftNumberingRecord") && draftObsoleteRouteSource.includes("numbering.draft.obsolete"),
  "records/[rootCode]/obsolete/route.ts"
);
record(
  "NUM-API overdue draft route marks admin confirmation through action guard",
  overdueDraftRouteSource.includes("markOverdueDraftNumberingRecords") && overdueDraftRouteSource.includes("numbering.draft.admin_confirm"),
  "drafts/overdue/route.ts"
);
record("NUM-API approval request route supports numbering review requests", approvalRequestRouteSource.includes("requestNumberingApproval"), "approval-requests/route.ts");
record(
  "NUM-API numbering search route calls search repository through page guard",
  numberingSearchRouteSource.includes("searchNumberingRecords") && numberingSearchRouteSource.includes("numbering.search"),
  "search/route.ts"
);
record(
  "NUM-API numbering drawings route calls drawing module repository through page guard",
  numberingDrawingsRouteSource.includes("listDrawingModuleRecords") && numberingDrawingsRouteSource.includes("numbering.drawings.view"),
  "drawings/route.ts"
);
record(
  "NUM-API numbering root detail route calls detail repository through page guard",
  numberingRootDetailRouteSource.includes("getNumberingRootDetail") && numberingRootDetailRouteSource.includes("numbering.search"),
  "roots/[rootCode]/route.ts"
);
record("NUM-API approval request route calls workflow", approvalRequestRouteSource.includes("requestNumberingApproval"), "approval-requests/route.ts");
record("NUM-API approval request route calls main drawing restore workflow", approvalRequestRouteSource.includes("requestMainDrawingRestoreApproval"), "approval-requests/route.ts");
record(
  "NUM-REPO approval tasks route reviewers to UI with payload markers",
  repositorySource.includes("buildNumberingActionMarkers") &&
    repositorySource.includes("approvalRecipientRole") &&
    repositorySource.includes("proxy_submission") &&
    repositorySource.includes("delegated_review") &&
    repositorySource.includes("impact_scope") &&
    repositorySource.includes("actionUrl: `/numbering/approvals`"),
  "numbering-repository.ts"
);
record(
  "NUM-API approval decision route calls workflow through action guard",
  (approvalDecisionRouteSource.includes("decideNumberingApproval") ||
    approvalDecisionRouteSource.includes("decideApprovalPlatformLegacyNumberingAsync")) &&
    approvalDecisionRouteSource.includes("numbering.approval.batch.decide"),
  "approval-decisions/route.ts"
);
record(
  "NUM-API approval batch route creates and lists batches through guards",
  approvalBatchRouteSource.includes("createNumberingApprovalBatch") &&
    approvalBatchRouteSource.includes("listNumberingApprovalBatches") &&
    approvalBatchRouteSource.includes("numbering.approvals") &&
    approvalBatchRouteSource.includes("numbering.approval.batch.create"),
  "approval-batches/route.ts"
);
record(
  "NUM-API approval batch detail route decides, resubmits, and accepts item comments",
    (approvalBatchDetailRouteSource.includes("decideNumberingApprovalBatch") ||
      approvalBatchDetailRouteSource.includes("decideApprovalPlatformLegacyNumberingBatchAsync")) &&
    approvalBatchDetailRouteSource.includes("resubmitRejectedNumberingApprovalBatchItems") &&
    approvalBatchDetailRouteSource.includes("itemComments") &&
    approvalBatchDetailRouteSource.includes("numbering.approval.batch.decide") &&
    approvalBatchDetailRouteSource.includes("numbering.approval.batch.resubmit"),
  "approval-batches/[batchId]/route.ts"
);
record("NUM-API numbering tasks route lists task center through page guard", numberingTasksRouteSource.includes("listNumberingTasks") && numberingTasksRouteSource.includes("numbering.tasks"), "tasks/route.ts");
record(
  "NUM-API numbering task detail route updates handled state through action guard",
  numberingTaskDetailRouteSource.includes("updateNumberingTaskStatus") && numberingTaskDetailRouteSource.includes("numbering.task.update"),
  "tasks/[taskId]/route.ts"
);
record(
  "NUM-API numbering notifications route lists read/handled state through page guard",
  numberingNotificationsRouteSource.includes("listNumberingNotifications") && numberingNotificationsRouteSource.includes("numbering.tasks"),
  "notifications/route.ts"
);
record(
  "NUM-API notification read route marks read through action guard",
  numberingNotificationReadRouteSource.includes("markRead") && numberingNotificationReadRouteSource.includes("numbering.notification.update"),
  "notifications/[notificationId]/read/route.ts"
);
record("NUM-REPO notification handled update blocks non-dismissible notices", repositorySource.includes("NUMBERING_NOTIFICATION_NOT_DISMISSIBLE"), "numbering-repository.ts");
record(
  "NUM-API notification handled route marks read and handled",
  numberingNotificationHandledRouteSource.includes("markRead") &&
    numberingNotificationHandledRouteSource.includes("markHandled") &&
    numberingNotificationHandledRouteSource.includes("numbering.notification.update"),
  "notifications/[notificationId]/handled/route.ts"
);
record(
  "NUM-API export job route creates and lists exports through guards",
  exportJobRouteSource.includes("createNumberingExportJob") &&
    exportJobRouteSource.includes("listNumberingExportJobs") &&
    exportJobRouteSource.includes("numbering.reports") &&
    exportJobRouteSource.includes("numbering.export.create"),
  "export-jobs/route.ts"
);
record(
  "NUM-API export job detail route reads exports through page guard",
  exportJobDetailRouteSource.includes("getNumberingExportJob") && exportJobDetailRouteSource.includes("numbering.reports"),
  "export-jobs/[jobId]/route.ts"
);
record(
  "NUM-API monthly report route generates and lists metadata through guards",
  monthlyAuditReportRouteSource.includes("generateMonthlyNumberingAuditReport") &&
    monthlyAuditReportRouteSource.includes("listMonthlyNumberingAuditReports") &&
    monthlyAuditReportRouteSource.includes("numbering.reports") &&
    monthlyAuditReportRouteSource.includes("numbering.audit_report.generate"),
  "monthly-audit-reports/route.ts"
);
record(
  "NUM-API monthly report detail route reads metadata through page guard",
  monthlyAuditReportDetailRouteSource.includes("getMonthlyNumberingAuditReport") && monthlyAuditReportDetailRouteSource.includes("numbering.reports"),
  "monthly-audit-reports/[reportId]/route.ts"
);
record(
  "NUM-API admin matrix route requires admin matrix permission and saves rules",
  adminMatrixRouteSource.includes("settings.admin_matrix") &&
    adminMatrixRouteSource.includes('auth.user.role !== "Admin"') &&
    adminMatrixRouteSource.includes("listNumberingAdminMatrix") &&
    adminMatrixRouteSource.includes("upsertNumberingApprovalRule") &&
    adminMatrixRouteSource.includes("applyNumberingRuleTemplate"),
  "admin/matrix/route.ts"
);
record(
  "NUM-API admin matrix route supports role and delegation operations",
  adminMatrixRouteSource.includes("role_permission") &&
    adminMatrixRouteSource.includes("role_priority") &&
    adminMatrixRouteSource.includes("role_scope") &&
    adminMatrixRouteSource.includes("role_assignment") &&
    adminMatrixRouteSource.includes("revoke_role_assignment") &&
    adminMatrixRouteSource.includes("delegation") &&
    adminMatrixRouteSource.includes("revoke_delegation"),
  "admin/matrix/route.ts"
);
record(
  "NUM-REPO role assignments extend permission context",
  repositorySource.includes("getAssignedNumberingRoleCodes") &&
    repositorySource.includes("user_role_assignments") &&
    repositorySource.includes("upsertNumberingUserRoleAssignment") &&
    repositorySource.includes("revokeNumberingUserRoleAssignment"),
  "numbering-repository.ts"
);
record(
  "NUM-CONFIG numbering permission codes include pages and operations",
  permissionCodesSource.includes("NUMBERING_PAGE_PERMISSION_CODES") &&
    permissionCodesSource.includes("NUMBERING_ACTION_PERMISSION_CODES") &&
    permissionCodesSource.includes("numbering.draft.update") &&
    permissionCodesSource.includes("numbering.draft.obsolete") &&
    permissionCodesSource.includes("numbering.draft.admin_confirm") &&
    permissionCodesSource.includes("numbering.drawings.view") &&
    permissionCodesSource.includes("/numbering/drawings") &&
    permissionCodesSource.includes("NUMBERING_NAV_PERMISSION_BY_PATH"),
  "numbering-permission-codes.ts"
);
record(
  "NUM-UI settings page renders approval matrix controls",
  settingsPageSource.includes("審核矩陣設定台") && settingsPageSource.includes("/api/numbering/admin/matrix"),
  "settings/page.tsx"
);
record(
  "NUM-UI settings page includes hard-rule warning markers and simulator",
  settingsPageSource.includes("不可關閉硬限制") && settingsPageSource.includes("規則模擬器") && settingsPageSource.includes("InfoMark"),
  "settings/page.tsx"
);
record(
  "NUM-UI settings page includes templates and rule version history",
  settingsPageSource.includes("規則模板") && settingsPageSource.includes("RuleVersionSummary"),
  "settings/page.tsx"
);
record(
  "NUM-UI settings page includes role matrix, scope, priority, and delegation controls",
  settingsPageSource.includes("角色權限矩陣") &&
    settingsPageSource.includes("最高權限排序") &&
    settingsPageSource.includes("主管範圍設定") &&
    settingsPageSource.includes("代理人設定"),
  "settings/page.tsx"
);
record(
  "NUM-UI numbering task center renders tasks and notifications",
  numberingTaskCenterPageSource.includes("待辦中心") && numberingTaskCenterPageSource.includes("通知中心"),
  "numbering/tasks/page.tsx"
);
record(
  "NUM-UI numbering task center blocks non-dismissible notification action",
  numberingTaskCenterPageSource.includes("!notification.dismissible") && numberingTaskCenterPageSource.includes("待處理或阻擋通知不可直接關閉"),
  "numbering/tasks/page.tsx"
);
record(
  "NUM-UI numbering task center renders shared attention markers",
  numberingTaskCenterPageSource.includes("MarkerList") && numberingTaskCenterPageSource.includes("proxy_submission") && numberingTaskCenterPageSource.includes("impact_scope"),
  "numbering/tasks/page.tsx"
);
record(
  "NUM-UI DEV-048 owner workspace renders create flow",
  numberStateWorkspaceSource.includes("建立保留號") &&
    numberStateWorkspaceSource.includes("/api/numbering/draft-workspaces") &&
    numberStateWorkspaceSource.includes("duplicateCheckState") &&
    numberStateWorkspaceSource.includes("建立並保留號碼"),
  "components/number-state-workspace.tsx"
);
record(
  "NUM-UI owner workspace supports item kinds and drawing requirement policy",
  numberStateWorkspaceSource.includes('type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom"') &&
    numberStateWorkspaceSource.includes("跨專案共用") &&
    numberStateWorkspaceSource.includes("manufacturedPartMustIncludeDrawing"),
  "components/number-state-workspace.tsx"
);
record(
  "NUM-UI owner workspace displays record status from the current lifecycle contract",
  numberStateWorkspaceSource.includes("recordStatus: string"),
  "components/number-state-workspace.tsx"
);
record(
  "NUM-UI formal-data legacy approval page redirects to workbench",
  numberingApprovalPageSource.includes("redirect(buildLegacyApprovalWorkbenchRedirect") &&
    numberingApprovalPageSource.includes('"numbering_approvals"') &&
    approvalLegacyRedirectSource.includes('domain: "numbering"'),
  "numbering/approvals/page.tsx"
);
record(
  "NUM-UI approval workbench exposes numbering review filters",
  approvalWorkbenchPageSource.includes("<h1>審核工作台") &&
    approvalWorkbenchPageSource.includes("numbering.release") &&
    approvalWorkbenchPageSource.includes("numbering.obsolete_part_number") &&
    approvalWorkbenchPageSource.includes("numbering.obsolete_ma_drawing"),
  "approvals/page.tsx"
);
record(
  "NUM-UI approval workbench supports detail decisions and legacy redirect messages",
  approvalWorkbenchPageSource.includes("allowedDecisionsForDetail") &&
    approvalWorkbenchPageSource.includes("legacyRedirectMessages") &&
    approvalWorkbenchPageSource.includes("buildInboxUrl") &&
    approvalWorkbenchPageSource.includes("syncFilterQuery"),
  "approvals/page.tsx"
);
record(
  "NUM-UI numbering search page renders query and detail workflow",
  numberingSearchPageSource.includes("圖料工作台") &&
    (numberingSearchPageSource.includes("/api/numbering/search") ||
      numberingSearchPageSource.includes("/api/numbering/relations?${params.toString()}")) &&
    numberingSearchPageSource.includes("/api/numbering/roots/${"),
  "numbering/search/page.tsx"
);
record(
  "NUM-UI numbering search page includes warning markers and impact panel",
  numberingSearchPageSource.includes("WarningDot") &&
    numberingSearchPageSource.includes("影響範圍") &&
    numberingSearchPageSource.includes("製造圖作廢影響"),
  "numbering/search/page.tsx"
);
record(
  "NUM-UI drawing management page renders module workflow",
  numberingDrawingsPageSource.includes("圖號工作台") &&
    numberingDrawingsPageSource.includes("/api/numbering/drawings") &&
    numberingDrawingsPageSource.includes("/numbering/search") &&
    numberingDrawingsPageSource.includes("/numbering/impact") &&
    numberingDrawingsPageSource.includes("numbering.drawings.view"),
  "numbering/drawings/page.tsx"
);
record(
  "NUM-UI numbering impact page renders manufacturing drawing impact workflow",
  numberingImpactPageSource.includes("製造圖影響") &&
    numberingImpactPageSource.includes("/api/numbering/impact-analysis") &&
    numberingImpactPageSource.includes("套用失效"),
  "numbering/impact/page.tsx"
);
record(
  "NUM-UI numbering impact page shows affected parts and revision tasks",
  numberingImpactPageSource.includes("受影響料號") &&
    numberingImpactPageSource.includes("文件進版待辦") &&
    numberingImpactPageSource.includes("recordStatus"),
  "numbering/impact/page.tsx"
);
record(
  "NUM-UI numbering report center renders audit report workflow",
  numberingReportCenterPageSource.includes("圖號稽核報表") &&
    numberingReportCenterPageSource.includes("重產月報") &&
    numberingReportCenterPageSource.includes("匯出下載"),
  "numbering/reports/page.tsx"
);
record(
  "NUM-UI numbering report center includes department tabs and download",
  numberingReportCenterPageSource.includes("全公司總覽") &&
    numberingReportCenterPageSource.includes("專案分頁") &&
    numberingReportCenterPageSource.includes("downloadJson"),
  "numbering/reports/page.tsx"
);
record(
  "NUM-UI sidebar links numbering task center",
  sidebarNavSource.includes("/numbering/tasks") && (sidebarNavSource.includes("圖號待辦") || sidebarNavSource.includes("我的待辦")),
  "sidebar-nav.tsx"
);
record(
  "NUM-UI sidebar retires standalone numbering request and keeps owner modules",
  !sidebarNavSource.includes('href: "/numbering/request"') &&
    !sidebarNavSource.includes('href: "/numbering/part-drafts"') &&
    sidebarNavSource.includes('href: "/numbering/search"') &&
    sidebarNavSource.includes('href: "/parts"'),
  "sidebar-nav.tsx"
);
record("NUM-UI sidebar groups owner modules under drawing management", sidebarNavSource.includes('label: "圖料管理"'), "sidebar-nav.tsx");
record(
  "NUM-UI sidebar links unified approval workbench",
  sidebarNavSource.includes("/approvals") && sidebarNavSource.includes("審核工作台") && sidebarNavSource.includes('badge: "approvalPending"'),
  "sidebar-nav.tsx"
);
record("NUM-UI sidebar links numbering search page", sidebarNavSource.includes("/numbering/search") && sidebarNavSource.includes("圖料工作台"), "sidebar-nav.tsx");
record("NUM-UI sidebar links drawing management page", sidebarNavSource.includes("/numbering/drawings") && sidebarNavSource.includes("圖號工作台"), "sidebar-nav.tsx");
record("NUM-UI sidebar links numbering impact page", sidebarNavSource.includes("/numbering/impact") && sidebarNavSource.includes("製造圖影響"), "sidebar-nav.tsx");
record("NUM-UI sidebar links numbering report center", sidebarNavSource.includes("/numbering/reports") && sidebarNavSource.includes("圖號報表"), "sidebar-nav.tsx");
record(
  "NUM-UI sidebar applies numbering page permission guard",
  sidebarNavSource.includes("NUMBERING_NAV_PERMISSION_BY_PATH") && sidebarNavSource.includes("/api/numbering/permissions") && sidebarNavSource.includes("pagePermissions"),
  "sidebar-nav.tsx"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-core",
  packageJson.scripts?.["qc:pdm-numbering-core"] === "node scripts/qc-pdm-numbering-core-test.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-api-regression",
  packageJson.scripts?.["qc:pdm-numbering-api-regression"] === "node scripts/qc-pdm-numbering-api-regression.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-data-consistency",
  packageJson.scripts?.["qc:pdm-numbering-data-consistency"] === "node scripts/qc-pdm-numbering-data-consistency.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-concurrency-reuse",
  packageJson.scripts?.["qc:pdm-numbering-concurrency-reuse"] === "node scripts/qc-pdm-numbering-concurrency-reuse.mjs",
  "package.json"
);
record(
  "NUM-QC concurrency reuse script covers parallel allocation and reserved numbers",
  concurrencyReuseScriptSource.includes("Promise.all") &&
    concurrencyReuseScriptSource.includes("Pending approval") &&
    concurrencyReuseScriptSource.includes("Rejected approval") &&
    concurrencyReuseScriptSource.includes("Obsolete") &&
    concurrencyReuseScriptSource.includes("Duplicate check blocks"),
  "qc-pdm-numbering-concurrency-reuse.mjs"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-draft-lifecycle",
  packageJson.scripts?.["qc:pdm-numbering-draft-lifecycle"] === "node scripts/qc-pdm-numbering-draft-lifecycle.mjs",
  "package.json"
);
record(
  "NUM-QC draft lifecycle script covers no-approval drafts and overdue admin confirmation",
  draftLifecycleScriptSource.includes("/api/numbering/records/") &&
    draftLifecycleScriptSource.includes("/obsolete") &&
    draftLifecycleScriptSource.includes("/api/numbering/drafts/overdue") &&
    draftLifecycleScriptSource.includes("approval_requests") &&
    draftLifecycleScriptSource.includes("PendingAdminConfirm"),
  "qc-pdm-numbering-draft-lifecycle.mjs"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-cross-role-audit-e2e",
  packageJson.scripts?.["qc:pdm-numbering-cross-role-audit-e2e"] === "node scripts/qc-pdm-numbering-cross-role-audit-e2e.mjs",
  "package.json"
);
record(
  "NUM-QC cross-role audit script covers delegated review, resubmit, task scope, and audit envelope",
  crossRoleAuditScriptSource.includes("delegated_review") &&
    crossRoleAuditScriptSource.includes("resubmit_rejected") &&
    crossRoleAuditScriptSource.includes("/api/numbering/tasks") &&
    crossRoleAuditScriptSource.includes("numbering.approval_batch.resubmit_rejected") &&
    crossRoleAuditScriptSource.includes("before/after/diff"),
  "qc-pdm-numbering-cross-role-audit-e2e.mjs"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-cross-role-permission",
  packageJson.scripts?.["qc:pdm-numbering-cross-role-permission"] === "node scripts/qc-pdm-numbering-cross-role-permission.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-report-center-ui",
  packageJson.scripts?.["qc:pdm-numbering-report-center-ui"] === "node scripts/qc-pdm-numbering-report-center-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-impact-ui",
  packageJson.scripts?.["qc:pdm-numbering-impact-ui"] === "node scripts/qc-pdm-numbering-impact-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-request-ui",
  packageJson.scripts?.["qc:pdm-numbering-request-ui"] === "node scripts/qc-pdm-numbering-request-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-approval-review-ui",
  packageJson.scripts?.["qc:pdm-numbering-approval-review-ui"] === "node scripts/qc-pdm-numbering-approval-review-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-role-delegation-ui",
  packageJson.scripts?.["qc:pdm-numbering-role-delegation-ui"] === "node scripts/qc-pdm-numbering-role-delegation-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-permission-guard-ui",
  packageJson.scripts?.["qc:pdm-numbering-permission-guard-ui"] === "node scripts/qc-pdm-numbering-permission-guard-ui.mjs",
  "package.json"
);
record(
  "NUM-QC package exposes qc:pdm-numbering-search-ui",
  packageJson.scripts?.["qc:pdm-numbering-search-ui"] === "node scripts/qc-pdm-numbering-search-ui.mjs",
  "package.json"
);

db.close();

record(
  "NUM-UI settings page includes user role assignment controls",
  settingsPageSource.includes("RoleAssignmentPanel") &&
    settingsPageSource.includes("role-assignment-user") &&
    settingsPageSource.includes("role-assignment-role") &&
    settingsPageSource.includes("role-assignment-reason"),
  "settings/page.tsx"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
