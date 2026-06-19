import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const repoRoot = process.cwd();
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-numbering-company-scope-"));

try {
  const init = spawnSync("npm.cmd run db:init", {
    cwd: repoRoot,
    env: { ...process.env, PDM_DATA_DIR: tempDataDir },
    encoding: "utf8",
    shell: true
  });
  assert.equal(init.status, 0, init.error?.message || init.stderr || init.stdout);

  const db = new Database(path.join(tempDataDir, "ai-pdm.sqlite"), { readonly: true });
  for (const tableName of ["numbering_sequences", "part_roots", "part_numbers", "drawing_numbers"]) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
    assert.ok(columns.includes("company_id"), `${tableName} must include company_id`);
  }
  for (const tableName of [
    "approval_requests",
    "approval_batches",
    "import_batches",
    "numbering_export_jobs",
    "monthly_audit_reports",
    "numbering_task_items",
    "numbering_notifications"
  ]) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
    assert.ok(columns.includes("company_id"), `${tableName} must include company_id`);
  }
  assert.ok(hasUniqueColumns(db, "part_roots", ["company_id", "root_code"]));
  assert.ok(hasUniqueColumns(db, "part_numbers", ["company_id", "part_number"]));
  assert.ok(hasUniqueColumns(db, "drawing_numbers", ["company_id", "drawing_number"]));
  db.close();

  const repository = read("src/lib/repositories/numbering-async-repository.ts");
  assert.match(repository, /DEFAULT_COMPANY_ID/);
  assert.match(repository, /SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL/);
  assert.match(repository, /SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL/);
  assert.match(repository, /SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL/);
  assert.match(repository, /APPROVAL_REQUEST_COMPANY_MISMATCH/);
  assert.match(repository, /APPROVAL_BATCH_COMPANY_MISMATCH/);
  assert.match(repository, /buildNumberingExportPayload\(client, input\.exportMode, companyId\)/);
  assert.match(repository, /SELECT_ASYNC_NUMBERING_EXPORT_ROOTS_SQL, \{ companyId \}/);
  assert.match(repository, /SELECT_ASYNC_DVT_PROMOTION_CANDIDATES_SQL, \{ companyId, limit \}/);
  assert.match(repository, /WHERE p\.part_number = :partNumber\s+AND p\.company_id = :companyId/);
  assert.match(repository, /INSERT INTO numbering_task_items \(\s+id, company_id,/);
  assert.match(repository, /INSERT INTO numbering_notifications \(\s+id, company_id,/);
  assert.match(repository, /FROM numbering_task_items\s+WHERE task_status = 'open'\s+AND company_id = :companyId/);
  assert.match(repository, /WHERE id = :taskId\s+AND company_id = :companyId/);
  assert.match(repository, /WHERE id = :notificationId\s+AND company_id = :companyId/);
  assert.match(repository, /\$\{input\.companyId\}:part_root|\$\{input\.companyId\}:part_root|\$\{root\.companyId\}:part:/);
  assert.match(repository, /r\.company_id = :companyId/);

  for (const route of [
    "src/app/api/numbering/records/route.ts",
    "src/app/api/numbering/duplicate-check/route.ts",
    "src/app/api/numbering/search/route.ts",
    "src/app/api/numbering/roots/[rootCode]/route.ts",
    "src/app/api/numbering/records/[rootCode]/route.ts",
    "src/app/api/numbering/records/[rootCode]/obsolete/route.ts",
    "src/app/api/numbering/drawings/route.ts",
    "src/app/api/parts/route.ts"
  ]) {
    const source = read(route);
    assert.match(source, /resolveNumberingCompanyContextAsync/, `${route} must resolve numbering company context`);
    assert.match(source, /pdmCompany/, `${route} must return selected PDM company context`);
  }

  for (const route of [
    "src/app/api/numbering/approval-requests/route.ts",
    "src/app/api/numbering/approval-decisions/route.ts",
    "src/app/api/numbering/approval-batches/route.ts",
    "src/app/api/numbering/approval-batches/[batchId]/route.ts",
    "src/app/api/numbering/import-batches/route.ts",
    "src/app/api/numbering/import-batches/[batchId]/route.ts",
    "src/app/api/numbering/import-batches/[batchId]/confirm/route.ts",
    "src/app/api/numbering/dvt-candidates/route.ts",
    "src/app/api/numbering/impact-analysis/route.ts",
    "src/app/api/numbering/export-jobs/route.ts",
    "src/app/api/numbering/export-jobs/[jobId]/route.ts",
    "src/app/api/numbering/monthly-audit-reports/route.ts",
    "src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts",
    "src/app/api/numbering/tasks/route.ts",
    "src/app/api/numbering/tasks/[taskId]/route.ts",
    "src/app/api/numbering/notifications/route.ts",
    "src/app/api/numbering/notifications/[notificationId]/read/route.ts",
    "src/app/api/numbering/notifications/[notificationId]/handled/route.ts",
    "src/app/api/parts/[partNumber]/route.ts",
    "src/app/api/parts/[partNumber]/variant/route.ts",
    "src/app/api/parts/[partNumber]/cost-profiles/route.ts",
    "src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts",
    "src/app/api/parts/[partNumber]/cost-resolution/route.ts"
  ]) {
    const source = read(route);
    assert.match(source, /resolveNumberingCompanyContextAsync/, `${route} must resolve numbering company context`);
    assert.match(source, /companyResult\.company\.companyId/, `${route} must pass selected companyId`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "numbering tables include company_id",
          "numbering unique keys are company scoped",
          "numbering repository uses company-scoped selectors",
          "numbering sequences are company scoped",
          "workflow, task, and notification tables include company_id",
          "workflow and part routes resolve selected company context",
          "task and notification routes resolve selected company context",
          "core numbering routes resolve and return PDM company context"
        ]
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tempDataDir, { recursive: true, force: true });
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function hasUniqueColumns(db, tableName, expectedColumns) {
  return db
    .prepare(`PRAGMA index_list(${tableName})`)
    .all()
    .filter((index) => Number(index.unique) === 1)
    .some((index) => {
      const columns = db.prepare(`PRAGMA index_info(${index.name})`).all().map((column) => column.name);
      return columns.join(",") === expectedColumns.join(",");
    });
}
