#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const schemaPath = path.join(root, "db", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev054-"));
const tempDataDir = path.join(tempRoot, "data");
const tempRepositoryDir = path.join(tempRoot, "repository");
fs.mkdirSync(tempDataDir, { recursive: true });
fs.mkdirSync(tempRepositoryDir, { recursive: true });

function columns(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function tableExists(database, tableName) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function stableDigest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readStableLegacyEvidence(database) {
  const master = database.prepare(`
    SELECT
      root.id AS root_id,
      root.root_code,
      root.record_status AS root_status,
      part.id AS part_id,
      part.part_root_id AS part_root_id,
      part.part_number,
      part.record_status AS part_status,
      drawing.id AS drawing_id,
      drawing.part_root_id AS drawing_root_id,
      drawing.drawing_number,
      drawing.record_status AS drawing_status,
      link.id AS link_id,
      link.drawing_number_id AS link_drawing_id,
      link.part_number_id AS link_part_id,
      revision.id AS revision_id,
      revision.drawing_number_id AS revision_drawing_id,
      revision.revision,
      revision.status AS revision_status
    FROM part_roots root
    JOIN part_numbers part ON part.part_root_id = root.id
    JOIN drawing_numbers drawing ON drawing.part_root_id = root.id
    JOIN drawing_part_links link ON link.drawing_number_id = drawing.id AND link.part_number_id = part.id
    JOIN drawing_revision_packages revision ON revision.drawing_number_id = drawing.id
    WHERE root.id = 'dev054-stable-root'
  `).get();
  const approvalHistory = database.prepare(`
    SELECT
      action.action_code,
      action.enabled,
      package.id AS package_id,
      package.action_code AS package_action_code,
      request.id AS request_id,
      request.package_id AS request_package_id,
      request.action_code AS request_action_code,
      request.request_status
    FROM approval_platform_actions action
    JOIN approval_platform_packages package ON package.action_code = action.action_code
    JOIN approval_platform_requests request ON request.package_id = package.id
    WHERE action.action_code = 'numbering.dvt_promotion'
  `).get();
  const auditRows = database.prepare(`
    SELECT id, submission_id, actor_id, action, detail_json, created_at
    FROM audit_logs
    WHERE id LIKE 'dev054-stable-audit-%'
    ORDER BY id ASC
  `).all();
  return {
    master,
    masterDigest: stableDigest(master),
    approvalHistory,
    approvalHistoryDigest: stableDigest(approvalHistory),
    auditCount: auditRows.length,
    auditDigest: stableDigest(auditRows)
  };
}

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(absolutePath));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

function collectRegisteredQcTargets() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const targets = new Set();
  for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!scriptName.startsWith("qc:")) continue;
    for (const match of String(command).matchAll(/scripts\/[A-Za-z0-9._-]+\.mjs/g)) {
      targets.add(path.join(root, ...match[0].split("/")));
    }
  }
  return [...targets];
}

let runtimeDatabase;
let stableEvidenceBefore;
let suiteFailure;
try {
  const fixturePath = path.join(tempDataDir, "ai-pdm.sqlite");
  const fixture = new Database(fixturePath);
  fixture.exec(schema);
  fixture.exec(`
    ALTER TABLE part_roots ADD COLUMN development_phase TEXT NOT NULL DEFAULT 'EVT';
    ALTER TABLE part_numbers ADD COLUMN development_phase TEXT NOT NULL DEFAULT 'EVT';
    ALTER TABLE drawing_numbers ADD COLUMN development_phase TEXT NOT NULL DEFAULT 'EVT';
    ALTER TABLE approval_rules ADD COLUMN phase TEXT;
    CREATE TABLE phase_gate_checks (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      gate_code TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO phase_gate_checks (id, submission_id, gate_code, status)
    VALUES ('legacy-phase-check', 'legacy-submission', 'design', 'open');
  `);

  const ruleVersionId = fixture.prepare("SELECT id FROM numbering_rule_versions ORDER BY created_at ASC LIMIT 1").pluck().get();
  const roleId = fixture.prepare("SELECT id FROM roles ORDER BY created_at ASC LIMIT 1").pluck().get();
  fixture.prepare(`
    INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at)
    VALUES ('dev054-stable-user', 'DEV-054 Stable User', 'dev054-stable@example.invalid', 'Engineer', 'company-jenfu', ?, ?)
  `).run("2026-08-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z");
  const userId = fixture.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").pluck().get();
  assert.ok(ruleVersionId, "fixture requires a numbering rule version");
  assert.ok(roleId, "fixture requires a role");
  assert.ok(userId, "fixture requires a user");

  const stableTimestamp = "2026-08-05T00:00:00.000Z";
  fixture.prepare(`
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at, development_phase
    ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Released', ?, ?, ?, ?, 'DVT')
  `).run("dev054-stable-root", "Z054", "DEV-054 stable root", ruleVersionId, userId, stableTimestamp, stableTimestamp);
  fixture.prepare(`
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      record_status, rule_version_id, created_by, created_at, updated_at, development_phase
    ) VALUES (?, 'company-jenfu', ?, ?, 1, '01', ?, 'manufactured', 'Released', ?, ?, ?, ?, 'PVT')
  `).run("dev054-stable-part", "dev054-stable-root", "Z05401", "DEV-054 stable part", ruleVersionId, userId, stableTimestamp, stableTimestamp);
  fixture.prepare(`
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
      is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at, development_phase
    ) VALUES (?, 'company-jenfu', ?, ?, 'M', 'Manufacturing', 1, 1, 'Released', ?, ?, ?, ?, 'DVT')
  `).run("dev054-stable-drawing", "dev054-stable-root", "Z054M01", ruleVersionId, userId, stableTimestamp, stableTimestamp);
  fixture.prepare(`
    INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
    VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)
  `).run("dev054-stable-link", "dev054-stable-drawing", "dev054-stable-part", userId, stableTimestamp);
  fixture.prepare(`
    INSERT INTO drawing_revision_packages (
      id, company_id, drawing_number_id, drawing_number, revision, status, created_by, created_at, updated_at, submitted_at, released_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'C', 'Released', ?, ?, ?, ?, ?)
  `).run(
    "dev054-stable-revision",
    "dev054-stable-drawing",
    "Z054M01",
    userId,
    stableTimestamp,
    stableTimestamp,
    stableTimestamp,
    stableTimestamp
  );
  const insertAudit = fixture.prepare(`
    INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
    VALUES (?, NULL, ?, ?, ?, ?)
  `);
  insertAudit.run("dev054-stable-audit-1", userId, "DEV054StableFixtureCreated", '{"sequence":1}', stableTimestamp);
  insertAudit.run("dev054-stable-audit-2", userId, "DEV054StableFixtureReviewed", '{"sequence":2}', stableTimestamp);

  fixture.prepare(`
    INSERT INTO approval_rules (
      id, rule_version_id, rule_name, action_code, phase, record_status,
      requires_approval, blocks_usage, blocks_release, shows_warning, export_marker
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 1)
  `).run("dev054-legacy-dvt-rule", ruleVersionId, "Legacy project phase rule", "dvt_promotion", "DVT", "PendingReview");
  fixture.prepare(`
    INSERT INTO role_permissions (
      id, role_id, permission_kind, permission_code, allowed, created_at, updated_at
    ) VALUES (?, ?, 'page', 'numbering.dvt', 1, ?, ?)
  `).run("dev054-legacy-dvt-permission", roleId, new Date().toISOString(), new Date().toISOString());
  fixture.prepare(`
    INSERT INTO approval_platform_actions (
      action_code, domain_code, title, description, handler_key, risk_level,
      allow_batch, requires_impact_snapshot, enabled, metadata_json
    ) VALUES ('numbering.dvt_promotion', 'numbering', 'Legacy project promotion', '', 'legacy-project-phase', 'high', 0, 1, 1, '{}')
  `).run();
  fixture.prepare(`
    INSERT INTO approval_platform_actions (
      action_code, domain_code, title, description, handler_key, risk_level,
      allow_batch, requires_impact_snapshot, enabled, metadata_json
    ) VALUES ('dev054.fixture.enabled', 'numbering', 'Enabled fixture action', '', 'dev054-enabled', 'low', 0, 0, 1, '{}')
  `).run();
  fixture.prepare(`
    INSERT INTO approval_platform_packages (
      id, company_id, package_code, action_code, package_type, package_status, title,
      reason, submitted_by, submitted_at, payload_json, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, 'numbering.dvt_promotion', 'single', 'approved', ?, '', ?, ?, '{}', ?, ?)
  `).run(
    "dev054-stable-package",
    "DEV054-STABLE-PACKAGE",
    "Historical project-status package",
    userId,
    stableTimestamp,
    stableTimestamp,
    stableTimestamp
  );
  fixture.prepare(`
    INSERT INTO approval_platform_requests (
      id, company_id, package_id, action_code, domain_code, request_status, title, reason,
      requested_by, requested_at, apply_status, payload_json, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, 'numbering.dvt_promotion', 'numbering', 'approved', ?, ?, ?, ?, 'not_required', '{}', ?, ?)
  `).run(
    "dev054-stable-request",
    "dev054-stable-package",
    "Historical project-status request",
    "Preserved audit evidence",
    userId,
    stableTimestamp,
    stableTimestamp,
    stableTimestamp
  );
  stableEvidenceBefore = readStableLegacyEvidence(fixture);
  assert.ok(stableEvidenceBefore.master, "stable fixture master relation and revision evidence must exist before migration");
  assert.equal(stableEvidenceBefore.auditCount, 2, "stable fixture requires two audit rows before migration");
  fixture.close();

  process.env.PDM_DATA_DIR = tempDataDir;
  process.env.PDM_REPOSITORY_DIR = tempRepositoryDir;
  const { getDb } = await import("../src/lib/db.ts");
  runtimeDatabase = getDb();

  const stableEvidenceAfter = readStableLegacyEvidence(runtimeDatabase);
  assert.deepEqual(stableEvidenceAfter.master, stableEvidenceBefore.master, "stable IDs, relations, revision, and record statuses must survive migration");
  assert.equal(stableEvidenceAfter.masterDigest, stableEvidenceBefore.masterDigest, "stable master evidence digest must survive migration");
  assert.equal(stableEvidenceAfter.auditCount, stableEvidenceBefore.auditCount, "audit row count must survive migration");
  assert.equal(stableEvidenceAfter.auditDigest, stableEvidenceBefore.auditDigest, "audit digest must survive migration");

  for (const tableName of ["part_roots", "part_numbers", "drawing_numbers"]) {
    assert.equal(columns(runtimeDatabase, tableName).includes("development_phase"), false, `${tableName} must not expose development_phase`);
  }
  assert.equal(columns(runtimeDatabase, "approval_rules").includes("phase"), false, "approval_rules must not expose phase");
  assert.equal(tableExists(runtimeDatabase, "phase_gate_checks"), false, "legacy PLM phase-gate table must be dropped");
  assert.equal(
    runtimeDatabase.prepare("SELECT COUNT(*) FROM approval_rules WHERE action_code IN ('dvt_promotion', 'dvt_missing_ma_override')").pluck().get(),
    0,
    "legacy project-phase approval rules must be removed"
  );
  assert.equal(
    runtimeDatabase.prepare("SELECT COUNT(*) FROM role_permissions WHERE permission_code IN ('numbering.dvt', 'numbering.dvt.submit', 'dvt_promotion', 'dvt_missing_ma_override')").pluck().get(),
    0,
    "legacy project-phase permissions must be removed"
  );
  assert.equal(
    runtimeDatabase.prepare("SELECT enabled FROM approval_platform_actions WHERE action_code = 'numbering.dvt_promotion'").pluck().get(),
    0,
    "historical action definition must be disabled rather than deleted"
  );
  const stableEvidenceAfterDisable = readStableLegacyEvidence(runtimeDatabase);
  assert.equal(stableEvidenceAfterDisable.approvalHistory?.enabled, 0, "disabled parent action must remain for historical package/request evidence");
  assert.equal(stableEvidenceAfterDisable.approvalHistory?.package_action_code, "numbering.dvt_promotion");
  assert.equal(stableEvidenceAfterDisable.approvalHistory?.request_action_code, "numbering.dvt_promotion");

  const { listApprovalPlatformActionsAsync } = await import("../src/lib/approval-platform.ts");
  const enabledActionCatalog = await listApprovalPlatformActionsAsync();
  assert.ok(enabledActionCatalog.some((action) => action.actionCode === "dev054.fixture.enabled"), "enabled action catalog must retain enabled actions");
  assert.equal(
    enabledActionCatalog.some((action) => action.actionCode === "numbering.dvt_promotion"),
    false,
    "enabled action catalog must hide the disabled historical parent"
  );

  runtimeDatabase.close();
  const secondStartup = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--experimental-loader",
      "./scripts/qc-ts-path-loader.mjs",
      "--input-type=module",
      "--eval",
      'import { getDb } from "./src/lib/db.ts"; const database = getDb(); database.prepare("SELECT 1").get(); database.close();'
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PDM_DATA_DIR: tempDataDir,
        PDM_REPOSITORY_DIR: tempRepositoryDir
      },
      encoding: "utf8"
    }
  );
  assert.equal(secondStartup.status, 0, `second getDb startup failed: ${secondStartup.stderr || secondStartup.stdout}`);
  runtimeDatabase = new Database(fixturePath);
  const stableEvidenceAfterSecondStartup = readStableLegacyEvidence(runtimeDatabase);
  assert.deepEqual(stableEvidenceAfterSecondStartup, stableEvidenceAfterDisable, "second getDb startup must be idempotent and preserve all evidence");

  const forbiddenActiveTokens = /development_phase|developmentPhase|formatDevelopmentPhase|EVTDisabled|dvt_promotion|dvt_missing|numbering\.dvt|phase_gate_checks|PhaseGate|phaseGate|phase-gates|phase_gate_required|PLM 階段關卡|Concept Gate|Design Gate|Verification Gate|Release Gate|專案 \/ 圖料|\bEVT\b|\bDVT\b|\bPVT\b/u;
  const activeViolations = collectSourceFiles(path.join(root, "src"))
    .filter((filePath) => filePath !== path.join(root, "src", "lib", "db.ts"))
    .filter((filePath) => forbiddenActiveTokens.test(fs.readFileSync(filePath, "utf8")))
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"));
  assert.deepEqual(activeViolations, [], `active source still contains project-status authority: ${activeViolations.join(", ")}`);

  const registeredQcForbiddenTokens = /development_phase|developmentPhase|formatDevelopmentPhase|EVTDisabled|dvt_promotion|dvt_missing|numbering\.dvt|phase[-_]gates?|phase_gate_required|PLM 階段關卡|\bEVT\b|\bDVT\b|\bPVT\b/iu;
  const thisSuitePath = path.join(root, "scripts", "qc-dev-054-project-status-removal.mjs");
  const allowedRemovalMigrationLiterals = new Map([
    [
      "scripts/qc-api-test.mjs",
      ["phase-gates"]
    ],
    [
      "scripts/qc-dev-053-phase1h-real-operation-full.mjs",
      ["024_remove_submission_phase_gate", "20260805010000_remove_submission_phase_gate"]
    ],
    [
      "scripts/qc-pdm-lifecycle-actions-git-boundary.mjs",
      ["024_remove_submission_phase_gate", "20260805010000_remove_submission_phase_gate", "dvt", "development[_-]phase"]
    ]
  ]);
  const registeredAndMigrationToolTargets = [...new Set(collectRegisteredQcTargets())];
  const missingRegisteredTargets = registeredAndMigrationToolTargets
    .filter((filePath) => !fs.existsSync(filePath))
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"));
  assert.deepEqual(missingRegisteredTargets, [], `registered QC target is missing: ${missingRegisteredTargets.join(", ")}`);
  const registeredQcViolations = registeredAndMigrationToolTargets
    .filter((filePath) => filePath !== thisSuitePath)
    .filter((filePath) => {
      const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
      let classifiedSource = fs.readFileSync(filePath, "utf8");
      for (const allowance of allowedRemovalMigrationLiterals.get(relativePath) ?? []) {
        const { literal, expectedOccurrences } = typeof allowance === "string"
          ? { literal: allowance, expectedOccurrences: 1 }
          : allowance;
        assert.ok(classifiedSource.includes(literal), `${relativePath} must retain classified removal migration literal ${literal}`);
        const occurrenceCount = classifiedSource.split(literal).length - 1;
        assert.equal(
          occurrenceCount,
          expectedOccurrences,
          `${relativePath} must contain exactly ${expectedOccurrences} classified negative/removal literal(s) ${literal}`
        );
        classifiedSource = classifiedSource.replaceAll(literal, "");
      }
      return registeredQcForbiddenTokens.test(classifiedSource);
    })
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"));
  assert.deepEqual(
    registeredQcViolations,
    [],
    `registered QC target still contains positive project-status fixture or stale absence assertion: ${registeredQcViolations.join(", ")}`
  );

  assert.equal(fs.existsSync(path.join(root, "src", "app", "numbering", "dvt", "page.tsx")), false, "DVT page must be removed");
  assert.equal(fs.existsSync(path.join(root, "src", "app", "api", "numbering", "dvt-candidates", "route.ts")), false, "DVT API must be removed");
  assert.equal(fs.existsSync(path.join(root, "src", "app", "api", "submissions", "[id]", "phase-gates", "route.ts")), false, "PLM phase-gate list API must be removed");
  assert.equal(fs.existsSync(path.join(root, "src", "app", "api", "submissions", "[id]", "phase-gates", "[checkId]", "route.ts")), false, "PLM phase-gate decision API must be removed");
  assert.equal(/development_phase|EVTDisabled|phase_gate_checks|\bEVT\b|\bDVT\b|\bPVT\b/.test(schema), false, "fresh SQLite schema must not create project-status authority");

  const lifecycleSource = fs.readFileSync(path.join(root, "src", "components", "lifecycle-ux.tsx"), "utf8");
  assert.match(lifecycleSource, /qualityStage: "研發階段" \| "技術移轉"/u);
  assert.match(lifecycleSource, /controlDimension: "變更管制"/u);
  assert.doesNotMatch(lifecycleSource, /qualityStage:\s*"變更管制"/u);

  const actionRepository = fs.readFileSync(path.join(root, "src", "lib", "repositories", "approval-platform-async-repository.ts"), "utf8");
  assert.match(actionRepository, /FROM approval_platform_actions\s+WHERE enabled = 1\s+ORDER BY/u, "normal action catalog must hide disabled legacy actions");

  const postgresMigration = fs.readFileSync(path.join(root, "db", "postgres", "023_remove_project_status_authority.sql"), "utf8");
  const supabaseMigration = fs.readFileSync(
    path.join(root, ".ai-doc", "archived", "legacy-supabase-migration-mirror", "migrations", "20260804030000_remove_project_status_authority.sql"),
    "utf8"
  );
  const phaseGateMigration = fs.readFileSync(path.join(root, "db", "postgres", "024_remove_submission_phase_gate.sql"), "utf8");
  const phaseGateSupabaseMigration = fs.readFileSync(
    path.join(root, ".ai-doc", "archived", "legacy-supabase-migration-mirror", "migrations", "20260805010000_remove_submission_phase_gate.sql"),
    "utf8"
  );
  assert.match(postgresMigration, /DROP COLUMN IF EXISTS development_phase/);
  assert.match(postgresMigration, /DROP COLUMN IF EXISTS phase/);
  assert.match(postgresMigration, /Historical approval requests and decisions keep their original action codes/);
  assert.ok(supabaseMigration.endsWith(postgresMigration), "archived Supabase mirror must contain the canonical PostgreSQL migration unchanged");
  assert.match(phaseGateMigration, /DROP TABLE IF EXISTS public\.phase_gate_checks/);
  assert.ok(phaseGateSupabaseMigration.endsWith(phaseGateMigration), "archived phase-gate removal mirror must contain migration 024 unchanged");

  console.log(JSON.stringify({
    suite: "DEV-054 project-status authority removal",
    passed: true,
    checks: {
      sqliteLegacyCompatibility: true,
      activeRuntimeSurfaceRemoved: true,
      semanticPhaseGateSurfaceRemoved: true,
      registeredQcTargetsClean: true,
      freshSchemaRemoved: true,
      postgresMigrationMirrored: true,
      historicalActionEvidencePreserved: true,
      stableLegacyEvidencePreserved: true,
      secondStartupIdempotent: true,
      enabledActionCatalogFiltered: true
    }
  }, null, 2));
} catch (error) {
  suiteFailure = error;
  throw error;
} finally {
  if (runtimeDatabase?.open) runtimeDatabase.close();
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(os.tmpdir());
  assert.ok(
    path.basename(resolvedTempRoot).startsWith("ai-pdm-dev054-") && resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`),
    `refusing to remove unexpected QC path: ${resolvedTempRoot}`
  );
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (cleanupError) {
    if (!suiteFailure) throw cleanupError;
  }
}
