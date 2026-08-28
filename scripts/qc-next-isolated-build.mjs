import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { removeTaskOwnedWorkspaceTempDir } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = crypto.randomUUID();
const runtimeRoot = path.join(root, ".tmp", `next-qc-runtime-project-${runId}`);
const isolatedDataDir = path.join(runtimeRoot, ".runtime-data");
const isolatedRepositoryDir = path.join(isolatedDataDir, "repository");
const distDirRelative = ".tmp/next-qc-build";
const distDir = path.join(runtimeRoot, ...distDirRelative.split("/"));
const mainDatabasePath = path.join(root, "data", "ai-pdm.sqlite");

function logicalMainDatabaseSnapshot(databasePath) {
  if (!fs.existsSync(databasePath)) return { exists: false, hash: null, payload: null };
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const tables = ["part_roots", "part_numbers", "drawing_numbers", "drawings", "canonical_workbench_states"];
    const payload = {
      schema: database.prepare(`SELECT name, sql FROM sqlite_master
        WHERE type IN ('table', 'index', 'trigger') AND (
          tbl_name IN (${tables.map(() => "?").join(",")}) OR
          name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration')
        ) ORDER BY type, name`).all(...tables),
      tables: Object.fromEntries(tables.map((table) => {
        const exists = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").get(table);
        return [table, exists ? database.prepare(`SELECT * FROM ${table} ORDER BY id`).all() : null];
      })),
      foreignKeys: database.pragma("foreign_key_check"),
      residue: database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
        AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all()
    };
    return { exists: true, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload };
  } finally {
    database.close();
  }
}

function prepareRuntimeProject() {
  const workspaceTempRoot = path.resolve(root, ".tmp");
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  if (!resolvedRuntimeRoot.startsWith(`${workspaceTempRoot}${path.sep}`)
    || !path.basename(resolvedRuntimeRoot).startsWith("next-qc-runtime-project-")) {
    throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolvedRuntimeRoot}`);
  }

  fs.mkdirSync(resolvedRuntimeRoot, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedRuntimeRoot, file));
  }
  for (const file of [".env", ".env.local", ".env.production.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedRuntimeRoot, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolvedRuntimeRoot, directory), { recursive: true, force: true });
  }

  const nextConfigPath = path.join(resolvedRuntimeRoot, "next.config.mjs");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  const isolatedNextConfig = nextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolatedNextConfig === nextConfig) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(nextConfigPath, isolatedNextConfig, "utf8");

  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolvedRuntimeRoot, "node_modules"), "junction");
  fs.mkdirSync(isolatedRepositoryDir, { recursive: true });
}

let exitCode = 1;
let artifactReady = false;
let mainAfter = null;
let cleanup = { removed: false, path: runtimeRoot, error: "not-run" };
const mainBefore = logicalMainDatabaseSnapshot(mainDatabasePath);

try {
  prepareRuntimeProject();
  const nextCli = path.join(runtimeRoot, "node_modules", "next", "dist", "bin", "next");
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: runtimeRoot,
      env: {
        ...process.env,
        PDM_DB_PROVIDER: "sqlite",
        PDM_DATA_DIR: isolatedDataDir,
        PDM_REPOSITORY_DIR: isolatedRepositoryDir,
        PDM_NEXT_DIST_DIR: distDirRelative,
        PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json",
        PDM_BUILD_COMMIT: "local-dev"
      },
      stdio: "inherit"
    });
    console.log(JSON.stringify({ runtimeDeclaration: {
      project: root,
      runtimeProject: runtimeRoot,
      purpose: "Next production build verification in a task-owned source/Next-metadata/data copy",
      port: "none",
      owningProcessTree: `build runner ${process.pid} -> Next build child ${child.pid ?? "pending"}`,
      cleanupCondition: "build exits, artifact and primary invariant are checked, then the runtime project is removed",
      PDM_DATA_DIR: isolatedDataDir,
      PDM_REPOSITORY_DIR: isolatedRepositoryDir,
      mutationScope: runtimeRoot
    } }));
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  artifactReady = fs.existsSync(path.join(distDir, "BUILD_ID"));
  mainAfter = logicalMainDatabaseSnapshot(mainDatabasePath);
  if (JSON.stringify(mainAfter) !== JSON.stringify(mainBefore)) {
    console.error(`PDM_ISOLATED_BUILD_MUTATED_MAIN_DATABASE:${JSON.stringify({ before: mainBefore.hash, after: mainAfter.hash })}`);
    exitCode = 1;
  } else {
    console.log(`Isolated build main database invariant: ${mainAfter.hash ?? "database-absent"}`);
  }
  if (!artifactReady) {
    console.error(`PDM_ISOLATED_BUILD_ARTIFACT_MISSING:${path.join(distDir, "BUILD_ID")}`);
    exitCode = 1;
  }
} finally {
  cleanup = removeTaskOwnedWorkspaceTempDir(root, runtimeRoot);
  if (!cleanup.removed) {
    console.error(`PDM_ISOLATED_BUILD_CLEANUP_FAILED:${JSON.stringify(cleanup)}`);
    exitCode = 1;
  }
}

console.log(`Isolated build result: ${exitCode === 0 ? "PASS" : "FAIL"}; artifact=${artifactReady}; primary=${mainAfter && JSON.stringify(mainAfter) === JSON.stringify(mainBefore)}; cleanup=${cleanup.removed}`);
process.exit(exitCode);
