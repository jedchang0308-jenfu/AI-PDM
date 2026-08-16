import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import ts from "typescript";

const rootDir = process.cwd();
const outDir = path.join(rootDir, "output", "qc-pdm-release-master-status-sync");
fs.mkdirSync(outDir, { recursive: true });

const repositorySourcePath = path.join(rootDir, "src", "lib", "repositories", "submission-status-async-repository.ts");
const compiledRepositoryPath = path.join(outDir, "submission-status-async-repository.compiled.mjs");
const compiledRepository = ts.transpileModule(fs.readFileSync(repositorySourcePath, "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
  },
  fileName: repositorySourcePath
});
fs.writeFileSync(compiledRepositoryPath, compiledRepository.outputText, "utf8");

const writeRepositorySourcePath = path.join(rootDir, "src", "lib", "repositories", "submission-write-async-repository.ts");
const compiledWriteRepositoryPath = path.join(outDir, "submission-write-async-repository.compiled.mjs");
const compiledWriteRepository = ts.transpileModule(fs.readFileSync(writeRepositorySourcePath, "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
  },
  fileName: writeRepositorySourcePath
});
fs.writeFileSync(compiledWriteRepositoryPath, compiledWriteRepository.outputText, "utf8");

const { AsyncSubmissionStatusRepository } = await import(pathToFileURL(compiledRepositoryPath).href);
const { AsyncSubmissionWriteRepository } = await import(pathToFileURL(compiledWriteRepositoryPath).href);

const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

class MemoryAsyncClient {
  kind = "sqlite";

  constructor(database) {
    this.database = database;
  }

  async query(sql, params) {
    return params ? this.database.prepare(sql).all(params) : this.database.prepare(sql).all();
  }

  async queryOne(sql, params) {
    return (params ? this.database.prepare(sql).get(params) : this.database.prepare(sql).get()) ?? null;
  }

  async execute(sql, params) {
    if (params) {
      this.database.prepare(sql).run(params);
      return;
    }
    this.database.prepare(sql).run();
  }

  async transaction(fn) {
    this.database.exec("BEGIN");
    try {
      const result = await fn(this);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async close() {}
}

function createFixtureDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      current_revision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, part_number)
    );

    CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      revision TEXT NOT NULL,
      product_line TEXT NOT NULL DEFAULT '',
      customer TEXT NOT NULL DEFAULT '',
      project_code TEXT NOT NULL DEFAULT '',
      process_name TEXT NOT NULL DEFAULT '',
      machine TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT '',
      surface_finish TEXT NOT NULL DEFAULT '',
      document_type TEXT NOT NULL DEFAULT '',
      change_description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      submitted_by TEXT NOT NULL DEFAULT 'qc-user',
      approval_required INTEGER NOT NULL DEFAULT 1,
      released_at TEXT,
      release_error TEXT,
      reject_reason TEXT,
      superseded_by_submission_id TEXT,
      obsolete_at TEXT,
      obsolete_by TEXT,
      corrects_submission_id TEXT,
      resolved_by_submission_id TEXT,
      resolved_at TEXT,
      source_entity_type TEXT,
      source_entity_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE submission_snapshots (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      source_part_number_id TEXT NOT NULL,
      source_part_number TEXT NOT NULL
    );

    CREATE TABLE submission_part_scopes (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      link_type TEXT NOT NULL,
      form_state TEXT NOT NULL,
      fit_state TEXT NOT NULL,
      function_state TEXT NOT NULL,
      fff_outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE part_roots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      root_code TEXT NOT NULL,
      record_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      record_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE drawing_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      record_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE drawing_part_links (
      id TEXT PRIMARY KEY,
      drawing_number_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      link_type TEXT NOT NULL
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE drawing_revision_packages (
      id TEXT PRIMARY KEY,
      source_submission_id TEXT,
      status TEXT NOT NULL,
      released_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedReleasedPathFixture(db, options = {}) {
  const now = "2026-07-02T08:00:00.000Z";
  const companyId = "company-qc";
  const itemId = "item-qc-release-sync";
  const rootId = "root-qc-0014";
  const partId = "part-qc-0014";
  const drawingId = options.sourceDrawingId ?? "drawing-qc-0014";
  const linkType = options.linkType ?? "primary_manufacturing";
  db.prepare(
    "INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(itemId, companyId, "P-QC-0014-001", "QC release sync part", "0.1", now, now);
  db.prepare(
    "INSERT INTO part_roots (id, company_id, root_code, record_status, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(rootId, companyId, "QC0014", "Draft", now);
  db.prepare(
    "INSERT INTO part_numbers (id, company_id, part_root_id, part_number, record_status, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(partId, companyId, rootId, "P-QC-0014-001", "Draft", now);
  db.prepare(
    "INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, record_status, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(drawingId, companyId, rootId, "D-QC-0014-MA1", "Draft", now);
  db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type) VALUES (?, ?, ?, ?)").run(
    "link-qc-0014",
    drawingId,
    partId,
    linkType
  );
  db.prepare(
    `INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, status, released_at, release_error, reject_reason,
      superseded_by_submission_id, obsolete_at, obsolete_by, corrects_submission_id, resolved_by_submission_id, resolved_at,
      source_entity_type, source_entity_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    "sub-qc-previous-released",
    companyId,
    itemId,
    "D-QC-0014-MA1",
    "0.1",
    "Released",
    "2026-07-02T07:00:00.000Z",
    "drawing_number",
    drawingId,
    now,
    now
  );
  db.prepare(
    `INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, status, released_at, release_error, reject_reason,
      superseded_by_submission_id, obsolete_at, obsolete_by, corrects_submission_id, resolved_by_submission_id, resolved_at,
      source_entity_type, source_entity_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    "sub-qc-release-failed",
    companyId,
    itemId,
    "D-QC-0014-MA1",
    "0.2",
    "ReleaseFailed",
    "old release failed",
    "drawing_number",
    drawingId,
    now,
    now
  );
  db.prepare(
    `INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, status, released_at, release_error, reject_reason,
      superseded_by_submission_id, obsolete_at, obsolete_by, corrects_submission_id, resolved_by_submission_id, resolved_at,
      source_entity_type, source_entity_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    "sub-qc-current",
    companyId,
    itemId,
    "D-QC-0014-MA1",
    "0.2",
    "Releasing",
    options.sourceEntityType ?? "drawing_number",
    options.sourceEntityId ?? drawingId,
    now,
    now
  );
}

async function runSuccessfulReleaseSyncScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db);
  let auditSeq = 0;
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `audit-qc-${++auditSeq}`
  );

  const result = await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  const submission = db.prepare("SELECT status, released_at FROM submissions WHERE id = ?").get("sub-qc-current");
  const drawing = db.prepare("SELECT record_status FROM drawing_numbers WHERE id = ?").get("drawing-qc-0014");
  const part = db.prepare("SELECT record_status FROM part_numbers WHERE id = ?").get("part-qc-0014");
  const root = db.prepare("SELECT record_status FROM part_roots WHERE id = ?").get("root-qc-0014");
  const item = db.prepare("SELECT current_revision FROM items WHERE id = ?").get("item-qc-release-sync");
  const previous = db.prepare("SELECT status, superseded_by_submission_id FROM submissions WHERE id = ?").get("sub-qc-previous-released");
  const failed = db.prepare("SELECT resolved_by_submission_id FROM submissions WHERE id = ?").get("sub-qc-release-failed");
  const audit = db.prepare("SELECT action, detail_json FROM audit_logs ORDER BY id ASC").all();

  record("success marks submission Released", submission.status === "Released");
  record("success stamps released_at", submission.released_at === "2026-07-02T09:00:00.000Z");
  record("drawing master is Released", drawing.record_status === "Released");
  record("part master is Released", part.record_status === "Released");
  record("root master is Released", root.record_status === "Released");
  record("item current revision is updated", item.current_revision === "0.2");
  record("previous released submission is obsoleted", previous.status === "Obsolete" && previous.superseded_by_submission_id === "sub-qc-current");
  record("related release-failed submission is resolved", failed.resolved_by_submission_id === "sub-qc-current");
  record("result exposes master sync payload", result.master_status_sync?.drawing?.code === "D-QC-0014-MA1");
  record("master sync audit is written", audit.some((row) => row.action === "ReleaseMasterStatusSynced"));
  record("obsolete audit still exists", audit.some((row) => row.action === "ObsoleteByRevision"));
  record("release-failed resolution audit still exists", audit.some((row) => row.action === "ReleaseFailedResolvedByCorrection"));
}

async function runMissingSourceStopsReleaseScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db, { sourceEntityId: "missing-drawing-id" });
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => "audit-qc-missing"
  );

  let message = "";
  try {
    await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const submission = db.prepare("SELECT status FROM submissions WHERE id = ?").get("sub-qc-current");
  const drawing = db.prepare("SELECT record_status FROM drawing_numbers WHERE id = ?").get("drawing-qc-0014");
  const auditCount = db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get().count;

  record("missing source returns human Chinese message", message.includes("找不到這筆送審的來源圖號"));
  record("missing source does not mark submission Released", submission.status === "Releasing");
  record("missing source does not mutate drawing master", drawing.record_status === "Draft");
  record("missing source does not write partial audit", auditCount === 0);
}

async function runSingleLinkFallbackScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db, { linkType: "reference", sourceEntityType: null, sourceEntityId: null });
  let auditSeq = 0;
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `audit-qc-fallback-${++auditSeq}`
  );

  const result = await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  const part = db.prepare("SELECT record_status FROM part_numbers WHERE id = ?").get("part-qc-0014");

  record("legacy submission can resolve by drawing number fallback", result.master_status_sync.part_resolution === "single_link_fallback");
  record("single linked part is still synced", part.record_status === "Released");
}

async function runSnapshotSelectsOneOfMultiplePrimaryPartsScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db);
  db.prepare(
    "INSERT INTO part_numbers (id, company_id, part_root_id, part_number, record_status, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("part-qc-0014-variant", "company-qc", "root-qc-0014", "P-QC-0014-002", "Draft", "2026-07-02T08:00:00.000Z");
  db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type) VALUES (?, ?, ?, ?)").run(
    "link-qc-0014-variant",
    "drawing-qc-0014",
    "part-qc-0014-variant",
    "primary_manufacturing"
  );
  db.prepare(
    "INSERT INTO submission_snapshots (id, submission_id, source_part_number_id, source_part_number) VALUES (?, ?, ?, ?)"
  ).run("snapshot-qc-selected-part", "sub-qc-current", "part-qc-0014-variant", "P-QC-0014-002");

  let auditSeq = 0;
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `audit-qc-snapshot-${++auditSeq}`
  );

  const result = await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  const selectedPart = db.prepare("SELECT record_status FROM part_numbers WHERE id = ?").get("part-qc-0014-variant");
  const otherPart = db.prepare("SELECT record_status FROM part_numbers WHERE id = ?").get("part-qc-0014");

  record("snapshot resolves one selected part from multiple legitimate primary links", result.master_status_sync.part_resolution === "submission_snapshot");
  record("snapshot-selected part is synced", selectedPart.record_status === "Released");
  record("other legitimate linked part is not silently mutated", otherPart.record_status === "Draft");
}

async function runLowerRevisionAcceptedAsHistoryScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db);
  db.prepare("UPDATE items SET current_revision = '0.3' WHERE id = ?").run("item-qc-release-sync");
  db.prepare(
    `INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, status, released_at, release_error, reject_reason,
      superseded_by_submission_id, obsolete_at, obsolete_by, corrects_submission_id, resolved_by_submission_id, resolved_at,
      source_entity_type, source_entity_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    "sub-qc-newer-released",
    "company-qc",
    "item-qc-release-sync",
    "D-QC-0014-MA1",
    "0.3",
    "Released",
    "2026-07-02T08:30:00.000Z",
    "drawing_number",
    "drawing-qc-0014",
    "2026-07-02T08:30:00.000Z",
    "2026-07-02T08:30:00.000Z"
  );
  let auditSeq = 0;
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `audit-qc-backfill-${++auditSeq}`
  );

  const result = await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });

  const current = db.prepare("SELECT status, released_at, superseded_by_submission_id FROM submissions WHERE id = ?").get("sub-qc-current");
  const newer = db.prepare("SELECT status, superseded_by_submission_id FROM submissions WHERE id = ?").get("sub-qc-newer-released");
  const older = db.prepare("SELECT status, superseded_by_submission_id FROM submissions WHERE id = ?").get("sub-qc-previous-released");
  const item = db.prepare("SELECT current_revision FROM items WHERE id = ?").get("item-qc-release-sync");
  const recomputedAudit = db.prepare("SELECT detail_json FROM audit_logs WHERE action = ?").get("RevisionCurrentRecomputed");

  record("lower revision backfill is accepted as history", result.accepted_as_history === true && result.latest_revision === "0.3", JSON.stringify(result));
  record(
    "backfilled lower revision is obsoleted by newer current",
    current.status === "Obsolete" && current.released_at === "2026-07-02T09:00:00.000Z" && current.superseded_by_submission_id === "sub-qc-newer-released",
    JSON.stringify(current)
  );
  record("newer released revision remains current", newer.status === "Released" && newer.superseded_by_submission_id === null, JSON.stringify(newer));
  record("older released revision is recomputed as history", older.status === "Obsolete" && older.superseded_by_submission_id === "sub-qc-newer-released", JSON.stringify(older));
  record("item current revision stays on newer release", item.current_revision === "0.3", JSON.stringify(item));
  record("history acceptance writes recompute audit", recomputedAudit?.detail_json?.includes('"acceptedAsHistory":true'), JSON.stringify(recomputedAudit));
}

function seedMultiPartScopes(db) {
  const now = "2026-07-02T08:00:00.000Z";
  for (const suffix of ["002", "003"]) {
    const itemId = `item-qc-release-sync-${suffix}`;
    const partId = `part-qc-0014-${suffix}`;
    const partNumber = `P-QC-0014-${suffix}`;
    db.prepare(
      "INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(itemId, "company-qc", partNumber, `QC batch ${suffix}`, "0.1", now, now);
    db.prepare(
      "INSERT INTO part_numbers (id, company_id, part_root_id, part_number, record_status, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(partId, "company-qc", "root-qc-0014", partNumber, "Draft", now);
    db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type) VALUES (?, ?, ?, ?)").run(
      `link-qc-0014-${suffix}`,
      "drawing-qc-0014",
      partId,
      "primary_manufacturing"
    );
  }
  const rows = [
    ["scope-qc-001", "item-qc-release-sync", "part-qc-0014", "P-QC-0014-001", "QC release sync part"],
    ["scope-qc-002", "item-qc-release-sync-002", "part-qc-0014-002", "P-QC-0014-002", "QC batch 002"],
    ["scope-qc-003", "item-qc-release-sync-003", "part-qc-0014-003", "P-QC-0014-003", "QC batch 003"]
  ];
  for (const [id, itemId, partId, partNumber, partName] of rows) {
    db.prepare(
      `INSERT INTO submission_part_scopes (
        id, submission_id, company_id, item_id, part_number_id, part_number, part_name, link_type,
        form_state, fit_state, function_state, fff_outcome, created_at
      ) VALUES (?, 'sub-qc-current', 'company-qc', ?, ?, ?, ?, 'primary_manufacturing',
        'no_impact', 'no_impact', 'no_impact', 'no_impact', ?)`
    ).run(id, itemId, partId, partNumber, partName, now);
  }
}

async function runMultiPartAtomicReleaseScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db);
  seedMultiPartScopes(db);
  let auditSeq = 0;
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `audit-qc-batch-${++auditSeq}`
  );

  const result = await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  const parts = db.prepare("SELECT part_number, record_status FROM part_numbers ORDER BY part_number").all();
  const items = db.prepare("SELECT part_number, current_revision FROM items ORDER BY part_number").all();

  record("multi-part scope releases all three part masters", parts.length === 3 && parts.every((part) => part.record_status === "Released"), JSON.stringify(parts));
  record("multi-part scope updates all three item revisions", items.length === 3 && items.every((item) => item.current_revision === "0.2"), JSON.stringify(items));
  record("multi-part release result exposes all affected parts", result.master_status_sync.part_resolution === "submission_scope" && result.master_status_sync.parts.length === 3, JSON.stringify(result.master_status_sync));
}

async function runMultiPartSubmissionCreationScenario() {
  const db = createFixtureDatabase();
  let idSeq = 0;
  const repo = new AsyncSubmissionWriteRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => `write-qc-${++idSeq}`
  );
  const partScopes = ["001", "002", "003"].map((suffix) => ({
    partNumberId: `part-write-${suffix}`,
    partNumber: `P-WRITE-${suffix}`,
    partName: `Write scope ${suffix}`,
    linkType: "primary_manufacturing",
    formState: "no_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    fffOutcome: "no_impact"
  }));
  const submissionId = await repo.createSubmissionRecord({
    companyId: "company-qc",
    drawingNumber: "D-WRITE-M01",
    partNumber: "P-WRITE-001",
    partName: "Write scope 001",
    revision: "0.2",
    material: "SUS304",
    surfaceFinish: "BA",
    documentType: "SLDDRW",
    changeDescription: "QC multi-part creation",
    submittedBy: "qc-user",
    files: [],
    partScopes
  });
  const scopes = db.prepare("SELECT part_number, fff_outcome FROM submission_part_scopes WHERE submission_id = ? ORDER BY part_number").all(submissionId);
  const items = db.prepare("SELECT part_number FROM items ORDER BY part_number").all();
  const audit = db.prepare("SELECT detail_json FROM audit_logs WHERE submission_id = ? AND action = 'Submit'").get(submissionId);

  record("submission creation persists one immutable scope row per selected part", scopes.length === 3 && scopes.every((scope) => scope.fff_outcome === "no_impact"), JSON.stringify(scopes));
  record("submission creation upserts all scoped item identities without duplicate anchor", items.length === 3, JSON.stringify(items));
  record("submission audit records the full part scope", audit?.detail_json?.includes("P-WRITE-003"), JSON.stringify(audit));
}

async function runMultiPartRelationshipDriftRollsBackScenario() {
  const db = createFixtureDatabase();
  seedReleasedPathFixture(db);
  seedMultiPartScopes(db);
  db.prepare("DELETE FROM drawing_part_links WHERE part_number_id = ?").run("part-qc-0014-003");
  const repo = new AsyncSubmissionStatusRepository(
    new MemoryAsyncClient(db),
    () => "2026-07-02T09:00:00.000Z",
    () => "audit-qc-batch-rollback"
  );

  let message = "";
  try {
    await repo.markSubmissionReleasedAndObsoletePrevious({ id: "sub-qc-current", actorId: "qc-user" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const submission = db.prepare("SELECT status FROM submissions WHERE id = ?").get("sub-qc-current");
  const parts = db.prepare("SELECT record_status FROM part_numbers").all();
  const items = db.prepare("SELECT current_revision FROM items").all();

  record("relationship drift blocks the whole batch with recovery text", message.includes("整批不能發布") && message.includes("P-QC-0014-003"), message);
  record("relationship drift keeps submission unreleased", submission.status === "Releasing", JSON.stringify(submission));
  record("relationship drift rolls back every part master", parts.every((part) => part.record_status === "Draft"), JSON.stringify(parts));
  record("relationship drift rolls back every item revision", items.every((item) => item.current_revision === "0.1"), JSON.stringify(items));
}

function runStaticContractChecks() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const repository = fs.readFileSync(path.join(rootDir, "src", "lib", "repositories", "submission-status-async-repository.ts"), "utf8");
  const drawingPage = fs.readFileSync(path.join(rootDir, "src", "app", "numbering", "drawings", "page.tsx"), "utf8");
  const asyncNumberingRepository = fs.readFileSync(path.join(rootDir, "src", "lib", "repositories", "numbering-async-repository.ts"), "utf8");

  record(
    "package exposes qc script",
    packageJson.scripts?.["qc:pdm-release-master-status-sync"]?.includes("scripts/qc-pdm-release-master-status-sync.mjs")
  );
  record("repository writes master sync audit", repository.includes("ReleaseMasterStatusSynced"));
  record("repository blocks missing source with Chinese message", repository.includes("找不到這筆送審的來源圖號"));
  record("repository blocks duplicate formal revisions", repository.includes("assertNoFormalDuplicateRevision") && repository.includes("不能重複核准同一版次"));
  record("repository supports lower revision history acceptance", repository.includes("acceptedAsHistory") && repository.includes("history_submission_ids"));
  record("repository releases the immutable snapshotted part selection", repository.includes('resolution: "submission_snapshot"'));
  record("drawing list exposes human mismatch text", drawingPage.includes("已發布送審待同步"));
  record("async drawing list detects released-master mismatch", asyncNumberingRepository.includes("SELECT_ASYNC_DRAWING_MODULE_RELEASE_STATUS_MISMATCHES_SQL"));
}

await runSuccessfulReleaseSyncScenario();
await runMissingSourceStopsReleaseScenario();
await runSingleLinkFallbackScenario();
await runSnapshotSelectsOneOfMultiplePrimaryPartsScenario();
await runLowerRevisionAcceptedAsHistoryScenario();
await runMultiPartSubmissionCreationScenario();
await runMultiPartAtomicReleaseScenario();
await runMultiPartRelationshipDriftRollsBackScenario();
runStaticContractChecks();

const summary = {
  generatedAt: new Date().toISOString(),
  checks
};

fs.writeFileSync(path.join(outDir, "pdm-release-master-status-sync-report.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(
  path.join(outDir, "pdm-release-master-status-sync-report.md"),
  `# PDM Release Master Status Sync QC\n\n${checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"}: ${check.name}`).join("\n")}\n`,
  "utf8"
);

console.log(`qc:pdm-release-master-status-sync passed ${checks.length}/${checks.length} checks`);
