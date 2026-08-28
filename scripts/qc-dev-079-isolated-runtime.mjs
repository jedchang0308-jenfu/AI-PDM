import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import Database from "better-sqlite3";

const root = process.cwd();

export async function startDev079IsolatedRuntime() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-layout-"));
  const repositoryDir = path.join(tempDir, "repository");
  const distDir = `.tmp/next-qc-dev079-layout-${crypto.randomUUID()}`;
  const targetDb = path.join(tempDir, "ai-pdm.sqlite");
  let port = null;
  let child = null;
  let workerChild = null;
  try {
    const primaryBefore = protectedSnapshot(path.join(root, "data", "ai-pdm.sqlite"));
    assertSafeSnapshot(primaryBefore, "primary-before");
    fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), targetDb);
    fs.cpSync(path.join(root, "data", "repository"), repositoryDir, { recursive: true });
    const fixtureSource = protectedSnapshot(targetDb);
    if (JSON.stringify(fixtureSource) !== JSON.stringify(primaryBefore)) throw new Error("DEV-079 unmodified fixture snapshot does not match primary protected invariant");
    const target = prepareA0002IsolatedDatabase(targetDb);
    port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
    const workerToken = `dev079-layout-worker-${crypto.randomUUID()}`;
    const previewToken = `dev079-layout-preview-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        PDM_AUTH_MODE: "demo",
        PDM_AUTH_SECRET: "dev079-layout-auth-secret",
        PDM_DB_PROVIDER: "sqlite",
        PDM_DATA_DIR: tempDir,
        PDM_REPOSITORY_DIR: repositoryDir,
        PDM_RELEASE_MODE: "local_stub",
        PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
        PDM_NUMBER_STATE_FLOW_V1: "true",
        PDM_NUMBER_LIFECYCLE_V2: "true",
        PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
        PDM_DRAWING_RECOGNITION_V1: "true",
        PDM_DRAWING_RECOGNITION_WORKER_TOKEN: workerToken,
        PDM_PREVIEW_WORKER_TOKEN: previewToken,
        PDM_PUBLIC_BASE_URL: baseUrl,
        PDM_NEXT_DIST_DIR: distDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    console.log(JSON.stringify({ runtime: { project: "AI_PDM", purpose: "DEV-079 isolated layout browser QC", port, pid: child.pid, cleanup: "stop exact process tree and verify port release" } }));
    await waitForServer(baseUrl);
    let stopped = false;
    return {
      baseUrl,
      ...target,
      databasePath: targetDb,
      workerToken,
      previewToken,
      runtimeReceipt: {
        project: root,
        purpose: "DEV-079 canonical A0002 layout browser QC",
        port,
        owningProcessTree: `runner -> Next dev pid ${child.pid}`,
        cleanupCondition: "browser closes, exact Next tree stops, port releases, task-owned data/repository/dist are removed",
        PDM_DATA_DIR: tempDir,
        PDM_REPOSITORY_DIR: repositoryDir,
        mutationScope: [tempDir, path.join(root, ...distDir.split("/"))],
        primaryBefore,
        fixtureSource,
        fixtureMutationLedger: target.fixtureMutationLedger
      },
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await stopRuntime({ child, workerChild, port, tempDir, distDir });
        const primaryAfter = protectedSnapshot(path.join(root, "data", "ai-pdm.sqlite"));
        if (JSON.stringify(primaryBefore) !== JSON.stringify(primaryAfter)) throw new Error("DEV-079 primary protected invariant changed during isolated runtime");
      }
    };
  } catch (error) {
    await stopRuntime({ child, workerChild, port, tempDir, distDir }).catch(() => {});
    throw error;
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("DEV-079 isolated layout browser server did not start");
}

function prepareA0002IsolatedDatabase(databasePath) {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const timestamp = new Date().toISOString();
  const workId = "qc-dev079-a0002-canonical-work";
  const target = database.prepare(`SELECT drawing.id AS drawingId, drawing.drawing_number AS drawingNumber,
      branch.id AS branchId, claim.id AS claimId, revision.id AS revisionId
    FROM drawings drawing
    JOIN drawing_rd_branches branch ON branch.drawing_id = drawing.id AND branch.status = 'open'
    JOIN drawing_revision_claims claim ON claim.branch_id = branch.id AND claim.predecessor_revision_id IS NULL
    JOIN drawing_revisions revision ON revision.id = branch.latest_approved_revision_id
    WHERE drawing.drawing_number = 'A0002-M01' AND drawing.lifecycle_state = 'drawing_preparation'
    ORDER BY claim.created_at DESC LIMIT 1`).get();
  if (!target) { database.close(); throw new Error("DEV-079 canonical A0002 drawing/branch/claim/revision is unavailable"); }
  const files = database.prepare(`SELECT file.id AS fileBindingId, file.sort_order AS ordinal, asset.content_hash AS contentHash, file.role, file.display_name AS displayName
    FROM drawing_revision_files file
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    WHERE file.drawing_revision_id = :revisionId AND file.removed_at IS NULL
    ORDER BY file.sort_order, file.id`).all({ revisionId: target.revisionId });
  const requiredRoles = new Set(files.map((file) => file.role));
  if (files.length !== 3 || !["pdf", "drawing_2d", "cad_3d"].every((role) => requiredRoles.has(role))) {
    database.close();
    throw new Error(`DEV-079 canonical A0002 three-file source is incomplete:${JSON.stringify(files)}`);
  }
  const currentRecognition = database.prepare(`SELECT session.id, session.status
    FROM drawing_recognition_sessions session
    WHERE session.source_context_type = 'drawing_revision' AND session.source_context_id = :revisionId
    ORDER BY session.created_at DESC, session.id DESC LIMIT 1`).get({ revisionId: target.revisionId });
  if (!currentRecognition || currentRecognition.status !== "review_ready") {
    database.close();
    throw new Error(`DEV-079 canonical A0002 review-ready recognition is unavailable:${JSON.stringify(currentRecognition)}`);
  }
  const insertFixture = database.transaction(() => {
    database.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email = 'admin@example.com'").run();
    database.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
    database.prepare("DELETE FROM drawing_revision_work_files WHERE work_id = :workId").run({ workId });
    database.prepare("DELETE FROM drawing_revision_works WHERE id = :workId").run({ workId });
    database.prepare(`INSERT INTO drawing_revision_works
      (id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id, proposed_payload, base_hash, row_version, created_at, updated_at)
      VALUES (:workId, 'company-jenfu', :drawingId, :branchId, :claimId, 'user-manager-demo', :proposedPayload, :baseHash, 1, :timestamp, :timestamp)`).run({
      workId,
      drawingId: target.drawingId,
      branchId: target.branchId,
      claimId: target.claimId,
      proposedPayload: JSON.stringify({ drawingId: target.drawingId, revisionId: target.revisionId, migrated: true }),
      baseHash: crypto.createHash("sha256").update(`DEV-079:${target.drawingId}:${target.revisionId}`).digest("hex"),
      timestamp
    });
    const stateUpdate = database.prepare(`UPDATE canonical_workbench_states
      SET work_id = :workId, handling = 'owner', row_version = row_version + 1, updated_at = :timestamp
      WHERE company_id = 'company-jenfu' AND entity_type = 'drawing'
        AND canonical_entity_id = :drawingId AND branch_id = :branchId AND revision_id = :revisionId`).run({
      workId,
      drawingId: target.drawingId,
      branchId: target.branchId,
      revisionId: target.revisionId,
      timestamp
    });
    if (stateUpdate.changes !== 1) throw new Error(`DEV-079 canonical A0002 work state cardinality:${stateUpdate.changes}`);
    const insertFile = database.prepare("INSERT INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash) VALUES (:workId, :fileBindingId, :ordinal, :contentHash)");
    for (const file of files) insertFile.run({ workId, fileBindingId: file.fileBindingId, ordinal: file.ordinal, contentHash: file.contentHash });
  });
  insertFixture();
  const foreignKeys = database.pragma("foreign_key_check");
  const preparedFiles = database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = :workId").get({ workId });
  database.close();
  if (foreignKeys.length !== 0 || Number(preparedFiles.count) !== 3) throw new Error(`DEV-079 canonical work fixture invalid:${JSON.stringify({ foreignKeys, preparedFiles })}`);
  return {
    ...target,
    workId,
    recognitionSessionId: currentRecognition.id,
    fixtureMutationLedger: [
      { action: "enable task-owned local admin identity", scope: "isolated fixture only" },
      { action: "insert canonical A0002 work, bind its owner state, and attach exact three revision-file snapshots", workId, revisionId: target.revisionId, files, scope: "isolated fixture only" }
    ]
  };
}

function protectedSnapshot(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const scalar = (sql) => Number(database.prepare(sql).get().count);
    const quarantineColumns = new Set(database.prepare("PRAGMA table_info(pdm_workbench_migration_quarantine)").all().map((row) => String(row.name)));
    const unresolvedQuarantine = quarantineColumns.has("resolution_status")
      ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'")
      : quarantineColumns.has("resolution")
        ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'")
        : scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine");
    const schema = database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type, name").all();
    const identities = {
      roots: database.prepare("SELECT id, company_id, root_code, record_status FROM part_roots ORDER BY company_id, root_code, id").all(),
      parts: database.prepare("SELECT id, company_id, part_root_id, part_number, record_status FROM part_numbers ORDER BY company_id, part_number, id").all(),
      drawings: database.prepare("SELECT id, company_id, part_root_id, formal_drawing_number_id, drawing_number, lifecycle_state FROM drawings ORDER BY company_id, drawing_number, id").all()
    };
    return {
      schemaHash: crypto.createHash("sha256").update(JSON.stringify(schema)).digest("hex"),
      canonicalIdentityHash: crypto.createHash("sha256").update(JSON.stringify(identities)).digest("hex"),
      counts: { roots: scalar("SELECT COUNT(*) AS count FROM part_roots"), parts: scalar("SELECT COUNT(*) AS count FROM part_numbers"), drawings: scalar("SELECT COUNT(*) AS count FROM drawings") },
      migrationResidue: { unresolved: unresolvedQuarantine },
      rootReferenceViolations: {
        parts: scalar("SELECT COUNT(*) AS count FROM part_numbers child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL"),
        drawings: scalar("SELECT COUNT(*) AS count FROM drawings child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL")
      },
      foreignKeyViolations: database.pragma("foreign_key_check").length
    };
  } finally { database.close(); }
}

function assertSafeSnapshot(snapshot, label) {
  if (Object.values(snapshot.counts).some((count) => count <= 0)
    || snapshot.migrationResidue.unresolved !== 0
    || Object.values(snapshot.rootReferenceViolations).some((count) => count !== 0)
    || snapshot.foreignKeyViolations !== 0) throw new Error(`DEV-079 unsafe ${label} snapshot:${JSON.stringify(snapshot)}`);
}

async function stopRuntime({ child, workerChild, port, tempDir, distDir }) {
  if (workerChild && workerChild.exitCode === null) terminate(workerChild);
  if (child && child.exitCode === null) {
    terminate(child);
    const deadline = Date.now() + 5_000;
    while (child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (port) {
    const released = await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (!released) throw new Error(`temporary DEV-079 port ${port} was not released`);
  }
  for (const target of [path.join(root, ...distDir.split("/")), tempDir]) {
    const resolved = path.resolve(target);
    const allowed = resolved.startsWith(path.resolve(os.tmpdir())) || resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
    if (allowed && fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function terminate(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}
