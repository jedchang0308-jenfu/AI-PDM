import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function resolvePrimaryDatabase(root) {
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8", windowsHide: true });
  const commonDir = common.status === 0 ? common.stdout.trim() : "";
  const primaryRoot = process.env.PDM_QA_PRIMARY_ROOT?.trim() || (commonDir ? path.dirname(commonDir) : root);
  return path.join(primaryRoot, "data", "ai-pdm.sqlite");
}

function primarySnapshot(root) {
  const databasePath = resolvePrimaryDatabase(root);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const tableExists = (name) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const schema = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name").all();
    const identities = {
      roots: database.prepare("SELECT id,company_id,root_code,record_status FROM part_roots ORDER BY company_id,root_code,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number,record_status FROM part_numbers ORDER BY company_id,part_number,id").all(),
      drawings: database.prepare("SELECT id,company_id,part_root_id,drawing_number,lifecycle_state FROM drawings ORDER BY company_id,drawing_number,id").all()
    };
    let unresolvedResidue = 0;
    if (tableExists("pdm_workbench_migration_quarantine")) {
      const columns = new Set(database.prepare("PRAGMA table_info(pdm_workbench_migration_quarantine)").all().map((row) => row.name));
      if (columns.has("resolution_status")) unresolvedResidue = Number(database.prepare("SELECT COUNT(*) count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'").get().count);
      else if (columns.has("resolution")) unresolvedResidue = Number(database.prepare("SELECT COUNT(*) count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'").get().count);
      else unresolvedResidue = Number(database.prepare("SELECT COUNT(*) count FROM pdm_workbench_migration_quarantine").get().count);
    }
    const snapshot = {
      schemaHash: sha256(JSON.stringify(schema)),
      canonicalIdentityHash: sha256(JSON.stringify(identities)),
      counts: Object.fromEntries(Object.entries(identities).map(([key, rows]) => [key, rows.length])),
      rootReferenceViolations: {
        parts: Number(database.prepare("SELECT COUNT(*) count FROM part_numbers child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL").get().count),
        drawings: Number(database.prepare("SELECT COUNT(*) count FROM drawings child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL").get().count)
      },
      unresolvedMigrationResidue: unresolvedResidue,
      foreignKeyViolations: database.pragma("foreign_key_check").length
    };
    snapshot.safe = Object.values(snapshot.counts).every((count) => count > 0)
      && Object.values(snapshot.rootReferenceViolations).every((count) => count === 0)
      && snapshot.unresolvedMigrationResidue === 0
      && snapshot.foreignKeyViolations === 0;
    return { ...snapshot, databasePath };
  } finally { database.close(); }
}

function validateRegistry(root, registryFile, expectedDevId, expectedDenominator, childIds) {
  const absolute = path.join(root, registryFile);
  const registry = readJson(absolute);
  const cases = Array.isArray(registry.cases) ? registry.cases : [];
  const expectedIds = Array.from({ length: expectedDenominator }, (_, index) => `QA-${expectedDevId.slice(4)}-${String(index + 1).padStart(2, "0")}`);
  const observedIds = cases.map((item) => item.caseId);
  const duplicates = observedIds.filter((id, index) => observedIds.indexOf(id) !== index);
  const missing = expectedIds.filter((id) => !observedIds.includes(id));
  const extras = observedIds.filter((id) => !expectedIds.includes(id));
  const allowed = new Set(["current-runner", "successor-replaced", "retired"]);
  const fieldErrors = [];
  for (const item of cases) {
    for (const field of ["caseId", "disposition", "currentOwner", "historicalOracle", "replacementReason"]) if (!item[field]) fieldErrors.push(`${item.caseId ?? "unknown"}:${field}`);
    if (!allowed.has(item.disposition)) fieldErrors.push(`${item.caseId}:disposition`);
    if (!Array.isArray(item.runnerEvidence)) fieldErrors.push(`${item.caseId}:runnerEvidence`);
    for (const runner of item.runnerEvidence ?? []) if (!childIds.has(runner)) fieldErrors.push(`${item.caseId}:unknown-runner:${runner}`);
    if (item.disposition === "current-runner" && (item.runnerEvidence?.length ?? 0) === 0) fieldErrors.push(`${item.caseId}:missing-current-runner`);
    if (item.disposition === "successor-replaced" && (!item.successorEvidence?.registry || !Array.isArray(item.successorEvidence?.caseIds) || item.successorEvidence.caseIds.length === 0)) fieldErrors.push(`${item.caseId}:missing-successor-evidence`);
    if (item.disposition === "retired" && (item.runnerEvidence?.length ?? 0) === 0) fieldErrors.push(`${item.caseId}:missing-retirement-proof`);
    if (!item.historicalOracle?.path || !item.historicalOracle?.caseId || !fs.existsSync(path.join(root, item.historicalOracle.path))) fieldErrors.push(`${item.caseId}:historical-oracle`);
  }
  return {
    registry,
    cases,
    gate: registry.devId === expectedDevId && registry.denominator === expectedDenominator && cases.length === expectedDenominator && duplicates.length === 0 && missing.length === 0 && extras.length === 0 && fieldErrors.length === 0,
    expectedIds,
    observedIds,
    duplicates,
    missing,
    extras,
    fieldErrors,
    sha256: sha256(fs.readFileSync(absolute))
  };
}

function validateExternalSuccessor(root, item, selfRegistry, provisionalCaseResults) {
  const evidence = item.successorEvidence;
  const registryPath = path.join(root, evidence.registry);
  if (!fs.existsSync(registryPath)) return { passed: false, detail: `missing registry ${evidence.registry}` };
  const registry = evidence.registry === selfRegistry ? { cases: provisionalCaseResults } : readJson(registryPath);
  const cases = Array.isArray(registry.cases) ? registry.cases : [];
  const ids = new Set(cases.map((entry) => entry.caseId));
  const missing = evidence.caseIds.filter((caseId) => !ids.has(caseId));
  const selfFailures = evidence.registry === selfRegistry
    ? cases.filter((entry) => evidence.caseIds.includes(entry.caseId) && !entry.passed).map((entry) => entry.caseId)
    : [];
  const closurePresent = !evidence.closure || fs.existsSync(path.join(root, evidence.closure));
  return { passed: missing.length === 0 && selfFailures.length === 0 && closurePresent, detail: { missing, selfFailures, closurePresent, caseIds: evidence.caseIds, registry: evidence.registry } };
}

export function runDev115Aggregate({ devId, registryFile, denominator, children }) {
  const root = process.cwd();
  const runId = `DEV115-${devId}-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
  const outputDir = path.join(root, "output", "qa", "dev-115-qa-gate-convergence", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const childIds = new Set(children.map((child) => child.id));
  const registryValidation = validateRegistry(root, registryFile, devId, denominator, childIds);
  const primaryBefore = primarySnapshot(root);
  const runtimeDeclaration = {
    project: root,
    purpose: `${devId} DEV-115 aggregate current-case convergence`,
    port: null,
    owningProcessTree: `aggregate pid ${process.pid} -> every registered child process`,
    cleanupCondition: "each runtime-owning child stops its exact process tree and releases its port; parent exits after final unified verdict",
    PDM_DATA_DIR: "child-owned isolated directory; primary is read-only invariant source",
    PDM_REPOSITORY_DIR: "child-owned isolated directory",
    mutationScope: [outputDir, "child-owned temporary data/repository/dist directories"]
  };
  console.log(JSON.stringify({ runtimeDeclaration }));

  const childResults = [];
  for (const child of children) {
    const result = spawnSync(process.execPath, child.args, {
      cwd: root,
      env: { ...process.env, DEV115_PARENT_RUN_ID: runId },
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 64 * 1024 * 1024
    });
    const stdoutFile = path.join(outputDir, `${child.id}.stdout.log`);
    const stderrFile = path.join(outputDir, `${child.id}.stderr.log`);
    fs.writeFileSync(stdoutFile, result.stdout ?? "", "utf8");
    fs.writeFileSync(stderrFile, `${result.stderr ?? ""}${result.error ? `\n${result.error.stack ?? result.error}` : ""}`, "utf8");
    const passed = result.status === 0 && !result.error;
    childResults.push({ id: child.id, passed, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: path.relative(root, stdoutFile), stderr: path.relative(root, stderrFile) });
    console.log(`${passed ? "PASS" : "FAIL"} ${child.id}`);
  }
  const childById = new Map(childResults.map((item) => [item.id, item]));
  const provisionalCaseResults = registryValidation.cases.map((item) => ({
    caseId: item.caseId,
    disposition: item.disposition,
    passed: item.disposition === "successor-replaced" ? true : item.runnerEvidence.every((id) => childById.get(id)?.passed === true),
    runnerEvidence: item.runnerEvidence,
    detail: item.disposition === "retired" ? "retirement proof runners passed" : "current runners passed"
  }));
  const caseResults = provisionalCaseResults.map((result) => {
    const item = registryValidation.cases.find((entry) => entry.caseId === result.caseId);
    if (item.disposition !== "successor-replaced") return result;
    const successor = validateExternalSuccessor(root, item, registryFile, provisionalCaseResults);
    return { ...result, passed: successor.passed, detail: successor.detail };
  });
  const primaryAfter = primarySnapshot(root);
  const primaryInvariant = primaryBefore.safe && primaryAfter.safe && JSON.stringify(primaryBefore) === JSON.stringify(primaryAfter);
  const status = registryValidation.gate
    && childResults.every((item) => item.passed)
    && caseResults.length === denominator
    && caseResults.every((item) => item.passed)
    && primaryInvariant
    ? "PASS" : "FAIL";
  const manifest = {
    schemaVersion: "dev-115-aggregate-v1",
    devId,
    runId,
    status,
    runtimeDeclaration,
    registry: {
      path: registryFile,
      sha256: registryValidation.sha256,
      valid: registryValidation.gate,
      denominator,
      observed: registryValidation.cases.length,
      duplicates: registryValidation.duplicates,
      missing: registryValidation.missing,
      extras: registryValidation.extras,
      fieldErrors: registryValidation.fieldErrors
    },
    children: childResults,
    caseResults,
    primaryInvariant: { passed: primaryInvariant, before: primaryBefore, after: primaryAfter },
    unresolved: { missingCases: registryValidation.missing.length, duplicateCases: registryValidation.duplicates.length, failedCases: caseResults.filter((item) => !item.passed).length, failedChildren: childResults.filter((item) => !item.passed).length, openP0: status === "PASS" ? 0 : 1, openP1: 0 },
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outputDir, "aggregate-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status, outputDir, denominator, passedCases: caseResults.filter((item) => item.passed).length, failedCases: caseResults.filter((item) => !item.passed).map((item) => item.caseId), primaryInvariant }, null, 2));
  if (status !== "PASS") process.exitCode = 1;
}
