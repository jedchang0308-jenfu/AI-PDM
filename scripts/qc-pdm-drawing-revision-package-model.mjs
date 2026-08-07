#!/usr/bin/env node

import Database from "better-sqlite3";
import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, name, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return readProjectFile(root, relativePath);
}

const sqliteSchema = read("db/schema.sql");
const postgresSchema = read("db/postgres/001_initial_schema.sql");
const domain = read("src/lib/drawing-revision-package.ts");
const repository = read("src/lib/repositories/drawing-revision-package-async-repository.ts");
const wrapper = read("src/lib/drawing-revision-packages-async.ts");
const submissionWorkbench = read("src/lib/drawing-submission-workbench.ts");
const submissionRoute = read("src/app/api/numbering/drawing-revisions/submissions/route.ts");
const releaseWorkflow = read("src/lib/submission-release-workflow.ts");
const submissionStatusRepository = read("src/lib/repositories/submission-status-async-repository.ts");
const masterAttachmentAsyncRepository = read("src/lib/repositories/master-attachment-async-repository.ts");
const submissionListAsyncRepository = read("src/lib/repositories/submission-list-async-repository.ts");
const approvalPlatform = read("src/lib/approval-platform.ts");
const masterAttachmentPanel = read("src/components/master-attachment-panel.tsx");
const globals = read("src/app/globals.css");
const devTask = read(".ai-doc/dev_task.md");
const spec = read(".ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md");
const qaPlan = read(".ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md");
const packageJson = readProjectJson(root, "package.json");

for (const source of [
  ["SQLite", sqliteSchema],
  ["Postgres", postgresSchema]
]) {
  const [label, text] = source;
  for (const tableName of [
    "drawing_revision_packages",
    "drawing_revision_package_files",
    "drawing_revision_package_supplements",
    "drawing_revision_package_supplement_files"
  ]) {
    assert(text.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`), `${label} schema defines ${tableName}`);
  }
  assert(text.includes("idx_drawing_revision_packages_released_unique"), `${label} schema has one Released package guard`);
  assert(text.includes("source_submission_id") && text.includes("reason_code") && text.includes("revision_warning_shown"), `${label} schema carries submission and supplement audit fields`);
}

const database = new Database(":memory:");
try {
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(sqliteSchema);
  for (const tableName of [
    "drawing_revision_packages",
    "drawing_revision_package_files",
    "drawing_revision_package_supplements",
    "drawing_revision_package_supplement_files"
  ]) {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
    assert(columns.length > 0, `Runtime SQLite creates ${tableName}`);
  }
  const indexes = database.prepare("PRAGMA index_list(drawing_revision_packages)").all().map((row) => row.name);
  assert(indexes.includes("idx_drawing_revision_packages_released_unique"), "Runtime SQLite creates Released package unique index");
} finally {
  database.close();
}

for (const reasonCode of [
  "format_file",
  "auxiliary_material",
  "metadata_correction",
  "content_changed_new_revision",
  "other"
]) {
  assert(domain.includes(reasonCode), `Supplement reason exists: ${reasonCode}`);
}
assert(domain.includes("noteRequired: true") && domain.includes("revisionWarning: true"), "Domain carries other-note and new-revision warning rules");

for (const methodName of [
  "ensurePackageForSubmission",
  "markPackageReleasedForSubmission",
  "markPackageCancelledForSubmission",
  "requestSupplement",
  "decideSupplement",
  "dryRunMigration"
]) {
  assert(repository.includes(methodName), `Repository implements ${methodName}`);
}
assert(repository.includes("duplicate_released_revision_package"), "Repository blocks duplicate Released package");
assert(repository.includes("supplement_reason_note_required"), "Repository requires note for other supplement reason");
assert(repository.includes("drawing_revision_fff_assessments fff") && repository.includes("ReviewApproved"), "Revision package projects approved FFF minor revisions as ReviewApproved");
assert(repository.includes("supplement_self_approve_forbidden"), "Repository blocks non-Admin self approval");
assert(repository.includes("R&D Manager") && repository.includes("Admin"), "Repository restricts supplement decision to manager/Admin");
assert(wrapper.includes("requestDrawingRevisionPackageSupplementAsync") && wrapper.includes("decideDrawingRevisionPackageSupplementAsync"), "Async wrapper exposes supplement APIs");

const requestRoutePath = "src/app/api/numbering/drawing-revision-packages/[packageId]/supplements/route.ts";
const decisionRoutePath = "src/app/api/numbering/drawing-revision-packages/supplements/[supplementId]/decision/route.ts";
assert(projectFileExists(root, requestRoutePath), "Supplement request API route exists");
assert(projectFileExists(root, decisionRoutePath), "Supplement decision API route exists");
const requestRoute = read(requestRoutePath);
const decisionRoute = read(decisionRoutePath);
assert(requestRoute.includes("numbering.draft.update") && requestRoute.includes("normalizeSupplementReasonCode"), "Supplement request API enforces numbering action and reason menu");
assert(decisionRoute.includes("requireRoleAsync(request, [\"R&D Manager\", \"Admin\"])"), "Supplement decision API enforces manager/Admin role");
assert(decisionRoute.includes("approve") && decisionRoute.includes("reject"), "Supplement decision API accepts approve/reject");

assert(submissionWorkbench.includes("ensureDrawingRevisionPackageForSubmissionAsync"), "Drawing submission creates/ensures package");
assert(submissionRoute.includes("packageId: submissionResult.packageId"), "Submission API returns packageId");
assert(releaseWorkflow.includes("ensureDrawingRevisionPackageForSubmissionAsync"), "Release workflow ensures package before release");
assert(submissionStatusRepository.includes("UPDATE drawing_revision_packages") && submissionStatusRepository.includes("status = 'Released'"), "Release transaction marks package Released");

assert(masterAttachmentAsyncRepository.includes("drawing_revision_package_supplement_files"), "Master attachment query links supplement files");
assert(masterAttachmentAsyncRepository.includes("review_confirmation_events rce") && masterAttachmentAsyncRepository.includes("instr(p.revision, '.') > 0"), "Master attachment query projects approved FFF minor revisions");
assert(masterAttachmentAsyncRepository.includes("revision_package_file_kind"), "Master attachment query exposes package file kind");
assert(masterAttachmentPanel.includes("isApprovedSupplementAttachment"), "Master attachment panel detects approved supplements");
assert(masterAttachmentPanel.includes("master-attachment-status supplement") && masterAttachmentPanel.includes("補件"), "Master attachment panel renders 補件 tag");
assert(masterAttachmentPanel.includes("revisionPackageRevision || attachment.sourceSubmissionRevision"), "Master attachment grouping uses package revision first");
assert(masterAttachmentPanel.includes("multiple") && masterAttachmentPanel.includes("selectedFiles={files}"), "Master attachment panel supports multi-file intake");
assert(masterAttachmentPanel.includes("requestSupplement") && masterAttachmentPanel.includes("申請補件"), "Master attachment panel exposes supplement request action");
assert(masterAttachmentPanel.includes("decideSupplement") && masterAttachmentPanel.includes("核准補件") && masterAttachmentPanel.includes("駁回補件"), "Master attachment panel exposes supplement review actions");
assert(masterAttachmentPanel.includes("content_changed_new_revision") && masterAttachmentPanel.includes("應建立新版次"), "Supplement request UI shows new-revision warning");
assert(masterAttachmentPanel.includes("supplementRoleFromAttachment"), "Supplement request maps attachment category to package role");
assert(globals.includes(".master-attachment-status.supplement"), "CSS includes supplement tag styling");
assert(globals.includes(".master-attachment-supplement-form"), "CSS includes supplement request form styling");

assert(spec.includes("no product `待確認附件`") || spec.includes("不新增"), "Spec rejects product pending-area for migration ambiguity");
assert(qaPlan.includes("QA-SUP-004") && qaPlan.includes("QA-MIG-003"), "QA plan covers supplement tag and no product pending area");
assert(devTask.includes("DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4"), "dev_task tracks Phase 4");
assert(packageJson.scripts["qc:pdm-drawing-revision-package-model"] === "node scripts/qc-pdm-drawing-revision-package-model.mjs", "package script registered");
assert(submissionListAsyncRepository.includes("SELECT_ASYNC_SUBMISSION_REVISION_PACKAGE_STATUS_SQL") && submissionListAsyncRepository.includes("effective_status"), "Submission detail exposes effective approved package status");
assert(approvalPlatform.includes("advanceDrawingRevisionSubmissionAfterImpactReviewAsync") && approvalPlatform.includes("minor_revision_remains_pending"), "FFF approval advances major release and preserves minor review approval");

const failed = checks.filter((check) => !check.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks
    },
    null,
    2
  )
);

process.exitCode = failed.length > 0 ? 1 : 0;
