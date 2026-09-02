#!/usr/bin/env node

/*
 * DEV-106 actual PostgreSQL provider-parity runner.
 *
 * This runner always creates a task-owned localhost PostgreSQL cluster.  It
 * never consumes PDM_POSTGRES_URL, an existing Supabase container, or any
 * production credential.  The cluster, fixture database, repository path and
 * evidence path are removed in finally; the runtime declaration is printed
 * before the first process is started so the ownership boundary is auditable.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncBomWorkbenchRepository } from "../src/lib/repositories/bom-workbench-async-repository.ts";
import { getBomApplicabilityCandidateContractAsync } from "../src/lib/bom-create-context.ts";
import { buildSharedReleaseExportRows } from "../src/lib/bom-release-export.ts";
import { SharedBomError } from "../src/lib/bom-shared-structure.ts";

const root = process.cwd();
const runId = `DEV106-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV106_POSTGRES_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", runId, "postgres"));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev106-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev106_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const companyId = "dev106-pg-company";
const otherCompanyId = "dev106-pg-other-company";
const actorId = "dev106-pg-engineer";
const managerId = "dev106-pg-manager";
const parentId = "dev106-pg-parent";
const childAId = "dev106-pg-child-a";
const childBId = "dev106-pg-child-b";
const parentRootId = "dev106-pg-parent-root";
const childRootId = "dev106-pg-child-root";
const now = "2026-08-31T12:00:00.000Z";
const checks = [];
let port = null;
let started = false;
let client = null;
let dbClient = null;
let firstFailure = null;

function text(error) { return error instanceof Error ? error.message : String(error); }
function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const value = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(value));
    });
  });
}

function check(id, label, fn) {
  try {
    const detail = fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
    return detail;
  } catch (error) {
    checks.push({ id, label, status: "FAIL", message: text(error) });
    console.error(`FAIL ${id} ${text(error)}`);
    throw error;
  }
}

async function checkAsync(id, label, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
    return detail;
  } catch (error) {
    checks.push({ id, label, status: "FAIL", message: text(error) });
    console.error(`FAIL ${id} ${text(error)}`);
    throw error;
  }
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_ASSEMBLY_SHARED_BOM_V1 = "true";
  process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true";
  process.env.PDM_BOM_XMIND_EDITOR_V2_ENABLED = "true";
  process.env.PDM_SALES_KIT_BOM_V1_ENABLED = "true";

  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-106 actual PostgreSQL migration and sales-kit repository provider parity",
    port,
    owningProcessTree: `this runner ${process.pid} -> task-owned pg_ctl/postgres cluster`,
    cleanupCondition: "database client closed, PostgreSQL cluster stopped, port released, task temp removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot,
    productionWrites: false
  } }));

  assert.ok(fs.existsSync(path.join(postgresBin, "initdb.exe")), `PostgreSQL binaries not found: ${postgresBin}`);
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", dbName]);
  const dsn = `postgresql://postgres@127.0.0.1:${port}/${dbName}`;
  client = new Client({ connectionString: dsn, application_name: "ai-pdm-dev106-postgres" });
  await client.connect();

  await applyMigration("001_initial_schema.sql");
  await applyMigration("048_shared_assembly_bom.sql");
  await seedBaselineDefinition();
  await applyMigration("052_sales_kit_bom.sql");
  await checkAsync("QA-106-001", "fresh PostgreSQL schema accepts the ordered baseline and sales-kit migration", async () => {
    const columns = await client.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='bom_definitions' AND column_name='purpose'");
    const constraint = await client.query("SELECT conname FROM pg_constraint WHERE conrelid='public.bom_definitions'::regclass AND conname='bom_definitions_purpose_check'");
    assert.equal(columns.rows.length, 1);
    assert.equal(columns.rows[0].is_nullable, "NO");
    assert.match(String(columns.rows[0].column_default), /manufacturing/iu);
    assert.equal(constraint.rows.length, 1);
    return { column: columns.rows[0], constraint: constraint.rows[0].conname };
  });

  const beforeRerun = await schemaFingerprint();
  await applyMigration("052_sales_kit_bom.sql");
  const afterRerun = await schemaFingerprint();
  const legacyAfterMigration = (await client.query("SELECT purpose FROM bom_definitions WHERE id='dev106-pg-legacy-definition'")).rows[0];
  check("QA-106-002", "052 sales-kit PostgreSQL migration is idempotent and backfills existing definitions", () => {
    assert.equal(beforeRerun, afterRerun);
    assert.equal(legacyAfterMigration?.purpose, "manufacturing");
    return { schemaHash: afterRerun, legacyPurpose: legacyAfterMigration?.purpose };
  });

  await seedFixture();
  dbClient = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn, maxConnections: 4 });
  const repository = new AsyncBomWorkbenchRepository(dbClient, () => now, deterministicId);
  const candidate = await getBomApplicabilityCandidateContractAsync({ client: dbClient, companyId, contextPartNumberId: parentId, bomPurpose: "sales_kit" });
  check("QA-106-006", "sales-kit applicability returns the exact purchased Parent as a locked candidate", () => {
    assert.equal(candidate.mode, "initial");
    assert.equal(candidate.candidates.length, 1);
    assert.equal(candidate.candidates[0].partNumberId, parentId);
    assert.equal(candidate.candidates[0].selected, true);
    assert.equal(candidate.candidates[0].selectable, false);
    return { etag: candidate.selectionEtag, candidate: candidate.candidates[0] };
  });

  const input = {
    companyId,
    contextPartNumberId: parentId,
    applicableParentPartNumberIds: [parentId],
    bomRevision: candidate.suggestedBomRevision,
    source: "manual",
    baseReleaseSnapshotId: null,
    actorId,
    idempotencyKey: "dev106-pg-create-001",
    requestFingerprint: hash("dev106-sales-kit-create-001"),
    selectionEtag: candidate.selectionEtag,
    bomPurpose: "sales_kit"
  };
  const created = await repository.createSharedDraft(input);
  check("QA-106-007", "sales-kit writer creates one shared Definition and Draft without a Parent M drawing", () => {
    assert.ok(created.definitionId);
    assert.equal(created.draft.bom_purpose, "sales_kit");
    assert.equal(created.draft.applicable_parents?.length, 1);
    return { definitionId: created.definitionId, draftId: created.draft.id, purpose: created.draft.bom_purpose };
  });

  const replay = await repository.createSharedDraft(input);
  check("QA-106-008", "sales-kit create idempotency replay returns the same Draft", () => {
    assert.equal(replay.replayed, true);
    assert.equal(replay.draft.id, created.draft.id);
    return { draftId: replay.draft.id, replayed: replay.replayed };
  });

  const lineId = "dev106-pg-line-a";
  const logicalLineId = "10600000-0000-4000-8000-000000000001";
  const saved = await repository.saveDraftTree({
    draftId: created.draft.id,
    actorId,
    expectedEditorVersion: created.draft.editor_version,
    reason: "DEV-106 PostgreSQL sales-kit save",
    lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "D106-C01", revision: null, groupName: null, quantity: 2, sequenceNo: 1 }],
    floatingTopics: [],
    components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [childAId], parentSelections: [] }]
  });
  check("QA-106-009", "sales-kit writer persists one fixed child with integer quantity", () => {
    assert.equal(saved?.bom_purpose, "sales_kit");
    assert.equal(saved?.lines.length, 1);
    assert.equal(saved?.components?.[0]?.component_mode, "fixed");
    return { editorVersion: saved?.editor_version, lineCount: saved?.lines.length };
  });

  let decimalError = "";
  try {
    await repository.saveDraftTree({
      draftId: created.draft.id,
      actorId,
      expectedEditorVersion: saved.editor_version,
      reason: "invalid decimal",
      lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "D106-C01", revision: null, groupName: null, quantity: 1.5, sequenceNo: 1 }],
      floatingTopics: [],
      components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [childAId], parentSelections: [] }]
    });
  } catch (error) { decimalError = text(error); }
  const decimalDraftAfter = await client.query("SELECT editor_version, line_count FROM bom_drafts WHERE id=$1", [created.draft.id]);
  check("QA-106-010", "sales-kit writer rejects decimal quantities before mutation", () => {
    assert.match(decimalError, /BOM_SALES_KIT_QUANTITY_INTEGER_REQUIRED/iu);
    const row = decimalDraftAfter.rows[0];
    assert.equal(Number(row?.editor_version), Number(saved.editor_version));
    return { error: decimalError, editorVersion: row?.editor_version };
  });

  const review = await repository.submitReview({ draftId: created.draft.id, actorId, changeReason: "DEV-106 PostgreSQL review" });
  check("QA-106-011", "sales-kit review freezes purpose and explode-components policy", () => {
    assert.equal(review?.status, "PendingReview");
    const snapshot = JSON.parse(review?.review_snapshot_json ?? "{}");
    assert.equal(snapshot.bomPurpose, "sales_kit");
    assert.equal(snapshot.fulfillmentPolicy, "explode_components");
    assert.ok(review?.review_snapshot_hash);
    return { reviewId: review?.id, hash: review?.review_snapshot_hash, purpose: snapshot.bomPurpose };
  });

  let selfDecisionError = "";
  try { await repository.approveReview({ reviewId: review.id, actorId, decisionReason: "self" }); }
  catch (error) { selfDecisionError = text(error); }
  check("QA-106-012", "sales-kit submitter cannot approve their own review", () => {
    assert.match(selfDecisionError, /BOM_REVIEW_SELF_DECISION_FORBIDDEN/iu);
    return { error: selfDecisionError };
  });

  const approved = await repository.approveReview({ reviewId: review.id, actorId: managerId, decisionReason: "DEV-106 PostgreSQL approved" });
  check("QA-106-013", "sales-kit approval creates an immutable Released snapshot", () => {
    assert.equal(approved?.draft?.status, "Released");
    assert.ok(approved?.snapshotId);
    assert.equal(approved?.draft?.bom_purpose, "sales_kit");
    return { snapshotId: approved?.snapshotId, status: approved?.draft?.status };
  });

  const snapshot = await repository.getReleaseSnapshotById(approved.snapshotId);
  check("QA-106-014", "Released snapshot retains purpose and direct component fulfillment policy", () => {
    assert.equal(snapshot?.bom_purpose, "sales_kit");
    assert.equal(snapshot?.resolved_lines?.length, 1);
    assert.equal(snapshot?.resolved_lines?.[0]?.child_part_number, "D106-C01");
    const rows = buildSharedReleaseExportRows(snapshot, parentId);
    assert.equal(rows.length, 2);
    const header = rows[0];
    const policyIndex = header.indexOf("fulfillment_policy");
    const purposeIndex = header.indexOf("bom_purpose");
    assert.equal(rows[1][purposeIndex], "sales_kit");
    assert.equal(rows[1][policyIndex], "explode_components");
    return { rows: rows.length - 1, purpose: rows[1][purposeIndex], policy: rows[1][policyIndex] };
  });

  const releasedDraft = await repository.getDraftById(created.draft.id);
  let releasedMutationError = "";
  try {
    await repository.saveDraftTree({
      draftId: created.draft.id,
      actorId,
      expectedEditorVersion: releasedDraft.editor_version,
      reason: "released mutation",
      lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "D106-C02", revision: null, groupName: null, quantity: 1, sequenceNo: 1 }],
      floatingTopics: [],
      components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [childBId], parentSelections: [] }]
    });
  } catch (error) { releasedMutationError = text(error); }
  check("QA-106-015", "Released sales-kit evidence remains immutable", () => {
    assert.match(releasedMutationError, /BOM_DRAFT_NOT_MUTABLE|BOM_DRAFT_NOT_EDITABLE|BOM_DRAFT_STATUS_INVALID/iu);
    return { error: releasedMutationError };
  });

  let purposeMutationError = "";
  try { await client.query("UPDATE bom_definitions SET purpose='manufacturing' WHERE id=$1", [created.definitionId]); }
  catch (error) { purposeMutationError = text(error); }
  check("QA-106-016", "PostgreSQL purpose discriminator is immutable at the database boundary", () => {
    assert.match(purposeMutationError, /BOM_DEFINITION_PURPOSE_IMMUTABLE/iu);
    return { error: purposeMutationError };
  });

  const scopedRows = await client.query(`SELECT
      (SELECT company_id FROM bom_definitions WHERE id=$1) AS definition_company,
      (SELECT company_id FROM bom_drafts WHERE id=$2) AS draft_company,
      (SELECT draft.company_id FROM bom_review_requests review JOIN bom_drafts draft ON draft.id=review.bom_draft_id WHERE review.id=$3) AS review_company,
      (SELECT company_id FROM bom_release_snapshots WHERE id=$4) AS snapshot_company`, [created.definitionId, created.draft.id, review.id, approved.snapshotId]);
  check("QA-106-017", "sales-kit definition, draft, review and release all remain company-scoped", () => {
    const counts = scopedRows.rows[0];
    assert.deepEqual(Object.values(counts), [companyId, companyId, companyId, companyId]);
    return counts;
  });

  const integrityRows = await client.query(`SELECT
      (SELECT COUNT(*)::int FROM bom_definitions WHERE purpose NOT IN ('manufacturing','sales_kit') OR purpose IS NULL) AS invalid_purpose,
      (SELECT COUNT(*)::int FROM bom_draft_component_nodes node LEFT JOIN bom_drafts draft ON draft.id=node.bom_draft_id WHERE draft.id IS NULL) AS orphan_component_nodes,
      (SELECT COUNT(*)::int FROM bom_draft_component_candidates candidate LEFT JOIN bom_draft_component_nodes node ON node.bom_draft_id=candidate.bom_draft_id AND node.logical_line_id=candidate.logical_line_id WHERE node.bom_draft_id IS NULL) AS orphan_candidates`);
  check("QA-106-018", "PostgreSQL final purpose and shared-component integrity checks are clean", () => {
    const integrity = integrityRows.rows[0];
    assert.equal(Number(integrity.invalid_purpose), 0);
    assert.equal(Number(integrity.orphan_component_nodes), 0);
    assert.equal(Number(integrity.orphan_candidates), 0);
    return integrity;
  });

  await dbClient.close();
  dbClient = null;
  await client.end();
  client = null;
}

async function applyMigration(fileName) {
  const sql = fs.readFileSync(path.join(root, "db", "postgres", fileName), "utf8");
  await client.query(sql);
}

async function seedBaselineDefinition() {
  await client.query(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
    VALUES ($1, 'D106PG', 'DEV-106 PostgreSQL', $2, $2) ON CONFLICT (id) DO NOTHING`, [companyId, now]);
  await client.query(`INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at)
    VALUES ($1, 'DEV-106 Engineer', 'dev106-pg-engineer@example.invalid', 'Engineer', $2, $3, $3)
    ON CONFLICT (id) DO NOTHING`, [actorId, companyId, now]);
  await client.query(`INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at)
    VALUES ($1, 'DEV-106 Manager', 'dev106-pg-manager@example.invalid', 'R&D Manager', $2, $3, $3)
    ON CONFLICT (id) DO NOTHING`, [managerId, companyId, now]);
  await client.query(`INSERT INTO numbering_rule_versions
    (id, rule_code, title, status, effective_at, rule_json, created_by, created_at, updated_at)
    VALUES ('numbering-rule-v3-alpha-root', 'PDM-NUMBERING-V3-DEV106', 'DEV-106 numbering rule', 'active', $1, '{}', $2, $1, $1)
    ON CONFLICT (id) DO NOTHING`, [now, actorId]);
  await client.query(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at)
    VALUES ($1, $2, 'D106P', 'DEV-106 Parent Root', 'purchased', 'Active', $3, $4, $4) ON CONFLICT (id) DO NOTHING`, [parentRootId, companyId, actorId, now]);
  await client.query(`INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at)
    VALUES ('dev106-pg-legacy-definition', $1, $2, 1, $3, $3, $4, $4) ON CONFLICT (id) DO NOTHING`, [companyId, parentRootId, actorId, now]);
}

async function seedFixture() {
  await client.query(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
    VALUES ($1, 'D106X', 'DEV-106 Other Company', $2, $2) ON CONFLICT (id) DO NOTHING`, [otherCompanyId, now]);
  await client.query(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at)
    VALUES ($1, $2, 'D106C', 'DEV-106 Child Root', 'purchased', 'Active', $3, $4, $4) ON CONFLICT (id) DO NOTHING`, [childRootId, companyId, actorId, now]);
  await client.query(`INSERT INTO part_numbers
    (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, record_status, created_by, created_at, updated_at)
    VALUES ($1, $2, $3, 'D106-P01', 1, '01', '市售組合包 Parent', 'purchased', 'assembly', 'Active', $4, $5, $5)
    ON CONFLICT (id) DO NOTHING`, [parentId, companyId, parentRootId, actorId, now]);
  for (const [id, code, name, sequence] of [[childAId, "D106-C01", "市售標準品 A", 1], [childBId, "D106-C02", "市售標準品 B", 2]]) {
    await client.query(`INSERT INTO part_numbers
      (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, record_status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'purchased', 'single_part', 'Active', $8, $9, $9)
      ON CONFLICT (id) DO NOTHING`, [id, companyId, childRootId, code, sequence, String(sequence).padStart(2, "0"), name, actorId, now]);
  }
  const fk = await client.query(`SELECT COUNT(*)::int AS count FROM part_numbers child
    LEFT JOIN part_roots root ON root.id=child.part_root_id
    WHERE child.company_id=$1 AND root.id IS NULL`, [companyId]);
  assert.equal(Number(fk.rows[0].count), 0);
}

async function schemaFingerprint() {
  const rows = await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name='bom_definitions' ORDER BY table_name, ordinal_position`);
  const constraints = await client.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid='public.bom_definitions'::regclass ORDER BY conname`);
  const indexes = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='bom_definitions' ORDER BY indexname`);
  return hash(canonicalJson({ columns: rows.rows, constraints: constraints.rows, indexes: indexes.rows }));
}

function deterministicId() {
  return crypto.randomUUID();
}

async function portReleased(checkPort) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: checkPort });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
  });
}

let exitCode = 1;
try {
  await main();
  exitCode = checks.length === 15 && checks.every((item) => item.status === "PASS") ? 0 : 1;
} catch (error) {
  firstFailure = text(error);
  console.error(`DEV106_POSTGRES_RUNNER_ERROR: ${firstFailure}`);
}

if (client) await client.end().catch(() => undefined);
if (dbClient) await dbClient.close().catch(() => undefined);
if (started) spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "ignore" });
const released = port === null ? true : await portReleased(port);
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch (error) { firstFailure = firstFailure ?? text(error); exitCode = 1; }
if (!released) { firstFailure = firstFailure ?? "DEV106_POSTGRES_PORT_NOT_RELEASED"; exitCode = 1; }

const result = {
  schemaVersion: 1,
  runner: "postgres",
  provider: "postgres",
  status: exitCode === 0 ? "PASS" : "FAIL",
  runId,
  fixedCases: ["QA-106-001", "QA-106-002", ...Array.from({ length: 13 }, (_, index) => `QA-106-${String(index + 6).padStart(3, "0")}`)],
  productionWrites: false,
  primaryWrites: false,
  runtime: { project: root, port, dataDir, repositoryDir, cleanupCondition: "task-owned cluster stopped and temp removed", portReleased: released },
  checks,
  firstFailure
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.status === "PASS").length, total: checks.length, portReleased: released }));
if (exitCode !== 0) process.exitCode = 1;
