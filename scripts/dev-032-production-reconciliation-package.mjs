#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDev046CloudSqlMigrationRunPlan } from "./run-dev-046-cloudsql-migrations.mjs";

export const DEV032_PRODUCTION_RECONCILIATION_PACKAGE_VERSION =
  "dev-032-production-reconciliation/v1";

const root = process.cwd();
const manifestPath = "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json";
const defaultOutputDir = path.join(root, "output", "dev-032-production-reconciliation");

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildReadbackSql(migrations) {
  const expectedValues = migrations
    .flatMap((migration) => [...new Set([
      migration.outputSha256,
      ...(migration.acceptedExistingChecksums ?? [])
    ])].map((checksum) => `    (${sqlString(migration.version)}, ${sqlString(checksum)})`))
    .join(",\n");
  return `-- DEV-032 production/restore read-only reconciliation
-- No mutation statement is permitted in this artifact.
WITH
expected_migration_checksums(version, checksum) AS (
  VALUES
${expectedValues}
),
expected_migrations(version) AS (
  SELECT DISTINCT version FROM expected_migration_checksums
),
official_codes(number_kind, company_id, number_value) AS (
  SELECT 'root', company_id, root_code FROM part_roots
  UNION ALL SELECT 'part', company_id, part_number FROM part_numbers
  UNION ALL SELECT 'drawing', company_id, drawing_number FROM drawing_numbers
),
reserved_codes(number_kind, company_id, number_value) AS (
  SELECT draft_item_type, company_id, candidate_code
  FROM number_candidate_reservations
  WHERE reservation_state IN ('active', 'review_locked', 'approved_locked')
  UNION ALL
  SELECT number_kind, company_id, number_value
  FROM numbering_recovery_reservations
  WHERE reservation_status = 'reserved'
),
reservation_max AS (
  SELECT company_id, sequence_scope_key, MAX(sequence_no) AS max_sequence_no
  FROM number_candidate_reservations
  WHERE reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted')
  GROUP BY company_id, sequence_scope_key
),
snapshot AS (
  SELECT jsonb_build_object(
    'sequences', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence_key) FROM (
      SELECT sequence_key, company_id, next_value FROM numbering_sequences
    ) s), '[]'::jsonb),
    'official', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.number_kind, o.company_id, o.number_value) FROM official_codes o), '[]'::jsonb),
    'reservations', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.company_id, r.sequence_scope_key, r.sequence_no, r.id) FROM (
      SELECT id, company_id, sequence_scope_key, sequence_no, candidate_code, reservation_state,
             promoted_master_type, promoted_master_id
      FROM number_candidate_reservations
    ) r), '[]'::jsonb),
    'recovery', COALESCE((SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.company_id, rr.number_kind, rr.number_value) FROM (
      SELECT company_id, number_kind, number_value, reservation_status, ledger_entry_hash
      FROM numbering_recovery_reservations
    ) rr), '[]'::jsonb),
    'drafts', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.company_id, d.reserved_part_number, d.id) FROM (
      SELECT id, company_id, reserved_part_number, status, version FROM part_number_drafts
    ) d), '[]'::jsonb)
  ) AS payload
)
SELECT
  (SELECT COUNT(*)::int FROM expected_migrations) AS expected_migration_count,
  (SELECT COUNT(*)::int FROM pdm_schema_migrations) AS actual_migration_count,
  (SELECT COUNT(*)::int FROM expected_migrations e LEFT JOIN pdm_schema_migrations a USING (version) WHERE a.version IS NULL) AS missing_migration_count,
  (SELECT COUNT(*)::int FROM pdm_schema_migrations a LEFT JOIN expected_migrations e USING (version) WHERE e.version IS NULL) AS extra_migration_count,
  (SELECT COUNT(*)::int
   FROM pdm_schema_migrations a
   JOIN expected_migrations e USING (version)
   WHERE NOT EXISTS (
     SELECT 1 FROM expected_migration_checksums allowed
     WHERE allowed.version = a.version AND allowed.checksum = a.checksum
   )) AS checksum_mismatch_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, root_code FROM part_roots GROUP BY company_id, root_code HAVING COUNT(*) > 1) x) AS duplicate_root_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, part_number FROM part_numbers GROUP BY company_id, part_number HAVING COUNT(*) > 1) x) AS duplicate_part_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, drawing_number FROM drawing_numbers GROUP BY company_id, drawing_number HAVING COUNT(*) > 1) x) AS duplicate_drawing_count,
  (SELECT COUNT(*)::int FROM official_codes o JOIN reserved_codes r USING (number_kind, company_id, number_value)) AS active_number_reuse_count,
  (SELECT COUNT(*)::int FROM (
    SELECT company_id, draft_item_type, candidate_code
    FROM number_candidate_reservations
    WHERE reservation_state IN ('active', 'review_locked', 'approved_locked')
    GROUP BY company_id, draft_item_type, candidate_code HAVING COUNT(*) > 1
  ) x) AS duplicate_active_candidate_count,
  (SELECT COUNT(*)::int FROM reservation_max r
    JOIN numbering_sequences s ON s.company_id = r.company_id AND s.sequence_key = r.sequence_scope_key
    WHERE s.next_value <= r.max_sequence_no) AS sequence_regression_count,
  (SELECT COUNT(*)::int FROM number_candidate_reservations r
    LEFT JOIN numbering_draft_workspaces w ON w.id = r.workspace_id AND w.company_id = r.company_id
    LEFT JOIN numbering_draft_roots dr ON r.draft_item_type = 'root' AND dr.id = r.draft_item_id AND dr.workspace_id = r.workspace_id
    LEFT JOIN numbering_draft_parts dp ON r.draft_item_type = 'part' AND dp.id = r.draft_item_id AND dp.workspace_id = r.workspace_id
    LEFT JOIN numbering_draft_drawings dd ON r.draft_item_type = 'drawing' AND dd.id = r.draft_item_id AND dd.workspace_id = r.workspace_id
    WHERE w.id IS NULL OR (r.draft_item_type = 'root' AND dr.id IS NULL)
      OR (r.draft_item_type = 'part' AND dp.id IS NULL)
      OR (r.draft_item_type = 'drawing' AND dd.id IS NULL)) AS orphan_candidate_count,
  (SELECT COUNT(*)::int FROM number_candidate_reservations r
    LEFT JOIN part_roots pr ON r.promoted_master_type = 'part_root' AND pr.id = r.promoted_master_id
    LEFT JOIN part_numbers pn ON r.promoted_master_type = 'part_number' AND pn.id = r.promoted_master_id
    LEFT JOIN drawing_numbers dn ON r.promoted_master_type = 'drawing_number' AND dn.id = r.promoted_master_id
    WHERE r.reservation_state = 'promoted' AND (
      (r.promoted_master_type = 'part_root' AND (pr.id IS NULL OR pr.root_code <> r.candidate_code)) OR
      (r.promoted_master_type = 'part_number' AND (pn.id IS NULL OR pn.part_number <> r.candidate_code)) OR
      (r.promoted_master_type = 'drawing_number' AND (dn.id IS NULL OR dn.drawing_number <> r.candidate_code))
    )) AS orphan_promoted_target_count,
  (SELECT COUNT(*)::int FROM platform_command_receipts
    WHERE command_status = 'processing' AND created_at < now() - interval '15 minutes') AS stale_processing_receipt_count,
  (SELECT COUNT(*)::int FROM companies) AS company_count,
  (SELECT COUNT(*)::int FROM users WHERE account_status = 'active' AND role = 'Admin' AND system_role_enabled = 1) AS active_admin_count,
  (SELECT COUNT(*)::int FROM roles) AS role_count,
  (SELECT COUNT(*)::int FROM role_permissions) AS permission_count,
  (SELECT COUNT(*)::int FROM part_roots) AS root_count,
  (SELECT COUNT(*)::int FROM part_numbers) AS part_count,
  (SELECT COUNT(*)::int FROM drawing_numbers) AS drawing_count,
  (SELECT COUNT(*)::int FROM part_number_drafts) AS legacy_draft_count,
  (SELECT COUNT(*)::int FROM numbering_draft_workspaces) AS workspace_count,
  ((SELECT COUNT(*) FROM numbering_publication_evidence) +
   (SELECT COUNT(*) FROM file_assets WHERE storage_provider = 'google_cloud_storage'))::int AS gcs_evidence_count,
  (SELECT payload FROM snapshot) AS numbering_snapshot;
`;
}

export function buildDev032ProductionReconciliationPackage() {
  const migrationPlan = buildDev046CloudSqlMigrationRunPlan(manifestPath);
  if (migrationPlan.target.projectId !== "jenfu-ai-pdm-prod" || migrationPlan.schemaMigrationCount < 1) {
    throw new Error("DEV032_RECONCILIATION_MIGRATION_MANIFEST_MISMATCH");
  }
  const readbackSql = buildReadbackSql(migrationPlan.schemaMigrations);
  const report = {
    schemaVersion: 1,
    packageVersion: DEV032_PRODUCTION_RECONCILIATION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    dev: "DEV-032",
    phase: "Gate-C-production-and-restore-reconciliation",
    status: "read_only_candidate_not_executed",
    target: migrationPlan.target,
    expectedMigrationCount: migrationPlan.schemaMigrationCount,
    expectedRoleCount: 9,
    expectedPermissionCount: 237,
    fileAuthorityExpected: false,
    mutationAllowed: false
  };
  return {
    report,
    manifest: {
      ...report,
      readbackSqlSha256: sha256(readbackSql),
      requiredModes: ["pre_canary", "post_smoke", "restore"]
    },
    readbackSql
  };
}

export async function writeDev032ProductionReconciliationPackage(packageData, outputDir = defaultOutputDir) {
  await mkdir(outputDir, { recursive: true });
  const files = {
    manifest: path.join(outputDir, "manifest.json"),
    readback: path.join(outputDir, "readback.sql")
  };
  await Promise.all([
    writeFile(files.manifest, `${JSON.stringify(packageData.manifest, null, 2)}\n`, "utf8"),
    writeFile(files.readback, packageData.readbackSql, "utf8")
  ]);
  return files;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const packageData = buildDev032ProductionReconciliationPackage();
  const outputs = await writeDev032ProductionReconciliationPackage(packageData);
  console.log(JSON.stringify({ status: packageData.report.status, outputs }, null, 2));
}
