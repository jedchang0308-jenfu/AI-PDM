import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const workspace = process.cwd();
const cliArgs = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const scenario = String(cliArgs.get("--scenario") ?? "");

if (scenario) await seedScenario(scenario);
else await runMatrix();

async function runMatrix() {
  const taskDataDir = requiredTaskPath("PDM_DATA_DIR");
  const taskRepositoryDir = requiredTaskPath("PDM_REPOSITORY_DIR");
  assertTaskBoundary(taskDataDir, path.resolve(workspace, "data"));
  assertTaskBoundary(taskRepositoryDir, path.resolve(workspace, "repository"));
  const runId = String(process.env.DEV096_RUN_ID ?? new Date().toISOString().replace(/[-:.TZ]/gu, ""));
  const matrixRoot = path.join(taskDataDir, `dev096-migration-${runId}`);
  const evidenceRoot = path.resolve(process.env.DEV096_EVIDENCE_DIR ?? path.join(matrixRoot, "evidence"), "migration");
  fs.mkdirSync(matrixRoot, { recursive: false });
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const scenarios = ["exact-a", "exact-b", "negative"];
  const results = {};
  for (const name of scenarios) {
    const dataDir = path.join(matrixRoot, name, "data");
    const repositoryDir = path.join(matrixRoot, name, "repository");
    const scenarioEvidence = path.join(evidenceRoot, name);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(repositoryDir, { recursive: true });
    fs.mkdirSync(scenarioEvidence, { recursive: true });
    const env = {
      ...process.env,
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      DEV096_SCENARIO_EVIDENCE_DIR: scenarioEvidence
    };
    runNode(["scripts/init-db.mjs"], env, `${name}: init schema`);
    runNode(["scripts/qc-dev-096-migration.mjs", `--scenario=${name}`], env, `${name}: seed source`);
    const databasePath = path.join(dataDir, "ai-pdm.sqlite");
    const legacyBefore = legacyAuthorityDigest(databasePath);
    const dryEvidence = path.join(scenarioEvidence, "dry-run");
    runNode(["scripts/migrate-dev-096-shared-assembly-bom.mjs", "--mode=dry-run", `--evidence-dir=${dryEvidence}`], env, `${name}: dry run`);
    if (sha256File(databasePath) !== legacyBefore.databaseSha256) throw new Error(`${name}: dry-run mutated database`);
    const applyEvidence = path.join(scenarioEvidence, "apply");
    runNode(["scripts/migrate-dev-096-shared-assembly-bom.mjs", "--mode=apply", `--evidence-dir=${applyEvidence}`], env, `${name}: apply`);
    const applied = inspectScenario(databasePath, name, legacyBefore);
    const beforeRerunHash = sha256File(databasePath);
    const rerunEvidence = path.join(scenarioEvidence, "rerun");
    runNode(["scripts/migrate-dev-096-shared-assembly-bom.mjs", "--mode=apply", `--evidence-dir=${rerunEvidence}`], env, `${name}: rerun`);
    const rerun = readJson(path.join(rerunEvidence, "evidence.json"));
    if (!rerun.replayed || rerun.databaseWrites !== 0 || rerun.backupPath !== null || sha256File(databasePath) !== beforeRerunHash) {
      throw new Error(`${name}: second apply was not a byte-exact no-op`);
    }
    results[name] = { ...applied, dryRun: readJson(path.join(dryEvidence, "evidence.json")), rerun };
  }

  const left = results["exact-a"];
  const right = results["exact-b"];
  if (canonicalJson(left.deterministicAuthority) !== canonicalJson(right.deterministicAuthority)) {
    throw new Error("deterministic migration authority differs across identical sources");
  }
  if (results.negative.openIssues !== 1 || results.negative.legacyMutated) {
    throw new Error("negative migration did not fail closed");
  }
  const checks = [
    { cases: [53], label: "fresh SQLite schema and constraints", pass: left.foreignKeyViolations.length === 0 },
    { cases: [54, 57], label: "exact legacy owner/review/release converted without identity loss", pass: left.exactCoverage },
    { cases: [55], label: "unresolved child identity writes issue proposal and leaves lineage untouched", pass: results.negative.openIssues === 1 && !results.negative.legacyMutated },
    { cases: [56], label: "apply rerun is byte-exact no-op with no backup", pass: left.rerun.replayed && right.rerun.replayed && results.negative.rerun.replayed },
    { cases: [60], label: "all migration roots are task-owned and production writes remain false", pass: scenarios.every((name) => results[name].dryRun.productionWrites !== true && results[name].rerun.productionWrites === false) },
    { cases: [82], label: "approved legacy review becomes immutable schema-v2 evidence", pass: left.reviewSchemaVersion === 2 && Boolean(left.reviewSnapshotHash) },
    { cases: [88], label: "deterministic IDs and semantic hashes match across identical sources", pass: canonicalJson(left.deterministicAuthority) === canonicalJson(right.deterministicAuthority) }
  ];
  const result = {
    runner: "migration",
    status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
    runId,
    matrixRoot,
    productionWrites: false,
    checks,
    results,
    cases: [...new Set(checks.filter((check) => check.pass).flatMap((check) => check.cases))].sort((a, b) => a - b)
  };
  fs.writeFileSync(path.join(evidenceRoot, "migration.json"), `${JSON.stringify(result, null, 2)}\n`);
  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.label}`);
  console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((check) => check.pass).length, total: checks.length }));
  if (result.status !== "PASS") process.exitCode = 1;
}

async function seedScenario(name) {
  const dataDir = requiredTaskPath("PDM_DATA_DIR");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  assertTaskBoundary(dataDir, path.resolve(workspace, "data"));
  const before = baseInvariant(databasePath);
  const engineeringMasterCounts = Object.entries(before.masterCounts).filter(([table]) => table !== "companies");
  if (before.foreignKeyViolations.length || engineeringMasterCounts.some(([, count]) => count !== 0) || before.migrationResidue !== 0) {
    throw new Error(`fixture source invariant failed: ${JSON.stringify(before)}`);
  }
  const { fixture, seedDev096Fixture } = await import("./dev096-qc-fixture.mjs");
  const fixtureLedger = seedDev096Fixture();
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const exact = name.startsWith("exact-");
  const ownerId = exact ? fixture.parents.red : fixture.parents.blue;
  const ownerPart = database.prepare("SELECT part_number FROM part_numbers WHERE id = ?").get(ownerId);
  const childPart = exact ? database.prepare("SELECT part_number FROM part_numbers WHERE id = ?").get(fixture.children.red) : { part_number: "DEV096-NOT-FOUND" };
  const draftId = exact ? "dev096-legacy-exact-draft" : "dev096-legacy-negative-draft";
  const lineId = exact ? "dev096-legacy-exact-line" : "dev096-legacy-negative-line";
  const now = "2026-08-24T03:00:00.000Z";
  database.prepare(`
    INSERT INTO bom_drafts (
      id, company_id, owner_part_number_id, bom_revision, identity_authority, draft_name,
      status, source, is_active, line_count, review_attempt, editor_version,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, '1', 'canonical_part_number', ?, ?, 'manual', 0, 1, ?, 2, ?, ?, ?, ?)
  `).run(draftId, fixture.companyId, ownerId, `${ownerPart.part_number} legacy BOM`, exact ? "Released" : "Draft", exact ? 1 : 0, fixture.users.engineer, fixture.users.engineer, now, now);
  database.prepare(`
    INSERT INTO bom_lines_tree (
      id, bom_draft_id, parent_line_id, node_type, part_number, quantity, sequence_no,
      source, source_priority, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, NULL, 'item', ?, 2, 1, 'manual', 30, ?, ?, ?, ?)
  `).run(lineId, draftId, childPart.part_number, fixture.users.engineer, fixture.users.engineer, now, now);
  const legacyRows = [{ table: "bom_drafts", id: draftId }, { table: "bom_lines_tree", id: lineId }];
  if (exact) {
    const reviewId = "dev096-legacy-exact-review";
    const releaseId = "dev096-legacy-exact-release";
    database.prepare(`
      INSERT INTO bom_review_requests (
        id, bom_draft_id, status, lifecycle_action, submitted_by, reviewed_by,
        change_reason, decision_reason, submitted_at, reviewed_at, review_schema_version
      ) VALUES (?, ?, 'Approved', 'release', ?, ?, 'legacy exact release', 'approved', ?, ?, 1)
    `).run(reviewId, draftId, fixture.users.engineer, fixture.users.manager, now, now);
    const lineSnapshot = [{
      id: lineId, bom_draft_id: draftId, parent_line_id: null, node_type: "item",
      item_id: null, part_number: childPart.part_number, revision: null, group_name: null,
      quantity: 2, sequence_no: 1, source: "manual", source_priority: 30,
      source_ref_id: null, source_filename: null, created_by: fixture.users.engineer,
      updated_by: fixture.users.engineer, created_at: now, updated_at: now
    }];
    database.prepare(`
      INSERT INTO bom_release_snapshots (
        id, bom_draft_id, company_id, owner_part_number_id, bom_revision,
        line_snapshot_json, line_count, released_by, released_at, snapshot_schema_version
      ) VALUES (?, ?, ?, ?, '1', ?, 1, ?, ?, 1)
    `).run(releaseId, draftId, fixture.companyId, ownerId, JSON.stringify(lineSnapshot), fixture.users.manager, now);
    legacyRows.push({ table: "bom_review_requests", id: reviewId }, { table: "bom_release_snapshots", id: releaseId });
  }
  const after = baseInvariant(databasePath, database);
  const foreignKeyViolations = database.pragma("foreign_key_check");
  database.close();
  if (foreignKeyViolations.length) throw new Error(`fixture foreign-key violation: ${JSON.stringify(foreignKeyViolations)}`);
  const evidenceDir = requiredTaskPath("DEV096_SCENARIO_EVIDENCE_DIR");
  fs.writeFileSync(path.join(evidenceDir, "fixture-ledger.json"), `${JSON.stringify({ name, before, fixtureLedger, legacyRows, after }, null, 2)}\n`);
}

function inspectScenario(databasePath, name, legacyBefore) {
  const database = new Database(databasePath, { readonly: true });
  database.pragma("foreign_keys = ON");
  const exact = name.startsWith("exact-");
  const draftId = exact ? "dev096-legacy-exact-draft" : "dev096-legacy-negative-draft";
  const lineId = exact ? "dev096-legacy-exact-line" : "dev096-legacy-negative-line";
  const ownerId = exact ? "dev096-parent-red" : "dev096-parent-blue";
  const draft = database.prepare("SELECT * FROM bom_drafts WHERE id = ?").get(draftId);
  const line = database.prepare("SELECT * FROM bom_lines_tree WHERE id = ?").get(lineId);
  const openIssues = Number(database.prepare("SELECT COUNT(*) FROM bom_shared_structure_migration_issues WHERE issue_status = 'open'").pluck().get());
  const foreignKeyViolations = database.pragma("foreign_key_check");
  if (!exact) {
    const current = legacyAuthorityDigest(databasePath, database);
    database.close();
    return {
      openIssues,
      legacyMutated: draft.definition_id !== null || line.logical_line_id !== null || current.legacyRowsSha256 !== legacyBefore.legacyRowsSha256,
      foreignKeyViolations,
      deterministicAuthority: []
    };
  }
  const definitionId = deterministicUuid("definition", ownerId);
  const logicalLineId = deterministicUuid("logical-line", lineId);
  const definition = database.prepare("SELECT * FROM bom_definitions WHERE id = ?").get(definitionId);
  const definitionBinding = database.prepare("SELECT id FROM bom_definition_parent_bindings WHERE definition_id = ? AND part_number_id = ?").get(definitionId, ownerId);
  const draftBinding = database.prepare("SELECT id FROM bom_draft_parent_bindings WHERE bom_draft_id = ? AND part_number_id = ?").get(draftId, ownerId);
  const component = database.prepare("SELECT * FROM bom_draft_component_nodes WHERE bom_draft_id = ? AND logical_line_id = ?").get(draftId, logicalLineId);
  const candidate = database.prepare("SELECT * FROM bom_draft_component_candidates WHERE bom_draft_id = ? AND logical_line_id = ?").get(draftId, logicalLineId);
  const review = database.prepare("SELECT * FROM bom_review_requests WHERE id = 'dev096-legacy-exact-review'").get();
  const release = database.prepare("SELECT * FROM bom_release_snapshots WHERE id = 'dev096-legacy-exact-release'").get();
  const releaseLines = JSON.parse(release.line_snapshot_json);
  const resolved = database.prepare("SELECT * FROM bom_release_resolved_lines WHERE release_snapshot_id = ? ORDER BY logical_line_id").all(release.id);
  const parentRows = database.prepare("SELECT * FROM bom_release_parent_snapshots WHERE release_snapshot_id = ?").all(release.id);
  const snapshotEvidence = canonicalHash({
    schemaVersion: 2,
    definitionId,
    bomRevision: release.bom_revision,
    reviewSnapshotHash: review.review_snapshot_hash,
    parentSnapshotHash: canonicalHash(JSON.parse(release.parent_snapshot_json)),
    lineSnapshotHash: canonicalHash(releaseLines),
    mappingSnapshotHash: canonicalHash(JSON.parse(release.mapping_snapshot_json)),
    resolvedProjectionHash: canonicalHash(JSON.parse(release.resolved_projection_json))
  });
  const exactCoverage = Boolean(
    definition && definitionBinding && draftBinding && component && candidate
    && draft.definition_id === definitionId && line.logical_line_id === logicalLineId
    && review.review_schema_version === 2 && review.review_snapshot_json && review.review_snapshot_hash
    && release.snapshot_schema_version === 2 && release.snapshot_hash === snapshotEvidence
    && releaseLines[0]?.logical_line_id === logicalLineId
    && resolved.length === 1 && parentRows.length === 1 && openIssues === 0
  );
  const deterministicAuthority = {
    definitionId,
    definitionBindingId: definitionBinding?.id ?? null,
    draftBindingId: draftBinding?.id ?? null,
    logicalLineId,
    resolvedLineId: resolved[0]?.id ?? null,
    reviewSnapshotHash: review.review_snapshot_hash,
    releaseSnapshotHash: release.snapshot_hash
  };
  database.close();
  return {
    exactCoverage,
    openIssues,
    reviewSchemaVersion: Number(review.review_schema_version),
    reviewSnapshotHash: review.review_snapshot_hash,
    releaseSnapshotHash: release.snapshot_hash,
    legacyMutated: false,
    foreignKeyViolations,
    deterministicAuthority
  };
}

function baseInvariant(databasePath, openDatabase) {
  const database = openDatabase ?? new Database(databasePath, { readonly: true });
  const masterCounts = Object.fromEntries(["companies", "part_roots", "part_numbers", "drawing_numbers", "drawings"].map((table) => [table, Number(database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get())]));
  const result = {
    databasePath,
    databaseSha256: sha256File(databasePath),
    masterCounts,
    migrationResidue: Number(database.prepare("SELECT COUNT(*) FROM bom_shared_structure_migration_issues").pluck().get()),
    foreignKeyViolations: database.pragma("foreign_key_check")
  };
  if (!openDatabase) database.close();
  return result;
}

function legacyAuthorityDigest(databasePath, openDatabase) {
  const database = openDatabase ?? new Database(databasePath, { readonly: true });
  const rows = {
    drafts: database.prepare("SELECT id, company_id, definition_id, owner_part_number_id, bom_revision, status, line_count, editor_version, created_at, updated_at FROM bom_drafts ORDER BY id").all(),
    lines: database.prepare("SELECT id, bom_draft_id, logical_line_id, parent_line_id, node_type, part_number, group_name, quantity, sequence_no, created_at, updated_at FROM bom_lines_tree ORDER BY id").all(),
    reviews: database.prepare("SELECT id, bom_draft_id, status, submitted_by, reviewed_by, change_reason, decision_reason, submitted_at, reviewed_at FROM bom_review_requests ORDER BY id").all(),
    releases: database.prepare("SELECT id, bom_draft_id, owner_part_number_id, bom_revision, line_count, released_by, released_at, obsolete_at, obsolete_by FROM bom_release_snapshots ORDER BY id").all()
  };
  const result = { databaseSha256: sha256File(databasePath), legacyRowsSha256: canonicalHash(rows), rows };
  if (!openDatabase) database.close();
  return result;
}

function runNode(arguments_, env, label) {
  const outcome = spawnSync(process.execPath, arguments_, { cwd: workspace, env, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (outcome.status !== 0) throw new Error(`${label} failed (${outcome.status}):\n${outcome.stdout}\n${outcome.stderr}`);
}

function requiredTaskPath(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`DEV096_${name}_REQUIRED`);
  return path.resolve(value);
}

function assertTaskBoundary(target, forbidden) {
  if (samePath(target, forbidden)) throw new Error(`DEV096_PRIMARY_PATH_FORBIDDEN: ${target}`);
  const relative = path.relative(workspace, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`DEV096_TASK_PATH_OUTSIDE_WORKSPACE: ${target}`);
}

function deterministicUuid(entityKind, stableSourceId) {
  const bytes = crypto.createHash("sha256").update(`ai-pdm/dev096/v1|${entityKind}|${stableSourceId}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  if (typeof value === "string") return value.trim();
  return value;
}
function canonicalJson(value) { return JSON.stringify(canonicalValue(value)); }
function canonicalHash(value) { return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
function sha256File(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function samePath(left, right) { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
