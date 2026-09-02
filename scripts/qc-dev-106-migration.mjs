import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV106_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", "migration"));
fs.mkdirSync(evidenceDir, { recursive: true });
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev106-migration-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir);
fs.mkdirSync(repositoryDir);
const env = { ...process.env, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir };
const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `command failed: ${args.join(" ")}`);
  return result.stdout;
};
const cases = [];
try {
  run(["scripts/init-db.mjs"]);
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  const before = inspect(databasePath);
  run(["scripts/migrate-dev-106-sales-kit-bom.mjs", "--mode=dry-run"]);
  const dryRun = inspect(databasePath);
  cases.push({ id: "QA-106-001", label: "fresh SQLite dry-run is zero-write", pass: before.sha256 === dryRun.sha256 && dryRun.foreignKeyViolations.length === 0 });
  run(["scripts/migrate-dev-106-sales-kit-bom.mjs", "--mode=apply"]);
  const applied = inspect(databasePath);
  const beforeRerun = applied.sha256;
  const output = run(["scripts/migrate-dev-106-sales-kit-bom.mjs", "--mode=apply"]);
  const rerun = inspect(databasePath);
  cases.push({ id: "QA-106-002", label: "apply rerun is byte-exact no-op", pass: beforeRerun === rerun.sha256 && /noOp": true/.test(output) && rerun.invalidRows === 0 && rerun.foreignKeyViolations.length === 0 });
  fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify({ runner: "migration", status: cases.every((item) => item.pass) ? "PASS" : "FAIL", cases, productionWrites: false }, null, 2)}\n`);
  for (const item of cases) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id} ${item.label}`);
  if (cases.some((item) => !item.pass)) process.exitCode = 1;
} finally {
  fs.rmSync(taskRoot, { recursive: true, force: true });
}

function inspect(databasePath) {
  const db = new Database(databasePath, { readonly: true });
  const bytes = fs.readFileSync(databasePath);
  const hash = bytes.toString("base64");
  const columns = db.prepare("PRAGMA table_info(bom_definitions)").all().map((row) => row.name);
  const invalidRows = columns.includes("purpose") ? Number(db.prepare("SELECT COUNT(*) FROM bom_definitions WHERE purpose IS NULL OR purpose NOT IN ('manufacturing','sales_kit')").pluck().get()) : 0;
  const foreignKeyViolations = db.pragma("foreign_key_check");
  db.close();
  return { sha256: hash, columns, invalidRows, foreignKeyViolations };
}
