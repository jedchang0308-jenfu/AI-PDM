import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const runId = crypto.randomUUID();
const distDirRelative = `.tmp/next-qc-build-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const runtimeRoot = path.join(root, ".tmp", `next-qc-runtime-${runId}`);
const isolatedDataDir = path.join(runtimeRoot, "data");
const isolatedRepositoryDir = path.join(runtimeRoot, "repository");
const mainDatabasePath = path.join(root, "data", "ai-pdm.sqlite");
const tsconfigFile = `.tsconfig.qc-build-${runId}.json`;
const tsconfigPath = path.join(root, tsconfigFile);
const trackedGeneratedFiles = ["next-env.d.ts"];
const snapshots = new Map(trackedGeneratedFiles.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

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

const isolatedTsconfig = {
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "es2022"],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    incremental: true,
    plugins: [{ name: "next" }],
    paths: { "@/*": ["./src/*"] }
  },
  include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  exclude: ["node_modules", "output", ".tmp", ".next*", "backups"]
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restoreTrackedGeneratedFiles() {
  for (const [file, content] of snapshots) {
    let lastError;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        fs.writeFileSync(path.join(root, file), content, "utf8");
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await delay(attempt * 100);
      }
    }
    if (lastError) throw lastError;
  }
}

async function writeIsolatedTsconfig() {
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.writeFileSync(tsconfigPath, `${JSON.stringify(isolatedTsconfig, null, 2)}\n`, "utf8");
      return;
    } catch (error) {
      lastError = error;
      await delay(attempt * 100);
    }
  }
  throw lastError;
}

let exitCode = 1;
const mainBefore = logicalMainDatabaseSnapshot(mainDatabasePath);
try {
  fs.mkdirSync(isolatedDataDir, { recursive: true });
  fs.mkdirSync(isolatedRepositoryDir, { recursive: true });
  await writeIsolatedTsconfig();
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: root,
      env: {
        ...process.env,
        PDM_DB_PROVIDER: "sqlite",
        PDM_DATA_DIR: isolatedDataDir,
        PDM_REPOSITORY_DIR: isolatedRepositoryDir,
        PDM_NEXT_DIST_DIR: distDirRelative,
        PDM_NEXT_TSCONFIG_PATH: tsconfigFile
      },
      stdio: "inherit"
    });
    console.log(`Isolated build runtime: project=${root}; purpose=Next production build verification; port=none; ownerPid=${child.pid ?? "pending"}; dataDir=${isolatedDataDir}; repositoryDir=${isolatedRepositoryDir}; cleanup=after build and main-database invariant`);
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const mainAfter = logicalMainDatabaseSnapshot(mainDatabasePath);
  if (JSON.stringify(mainAfter) !== JSON.stringify(mainBefore)) {
    console.error(`PDM_ISOLATED_BUILD_MUTATED_MAIN_DATABASE:${JSON.stringify({ before: mainBefore.hash, after: mainAfter.hash })}`);
    exitCode = 1;
  } else {
    console.log(`Isolated build main database invariant: ${mainAfter.hash ?? "database-absent"}`);
  }
} finally {
  await restoreTrackedGeneratedFiles();
  if (fs.existsSync(tsconfigPath)) fs.rmSync(tsconfigPath, { force: true });
  const resolved = path.resolve(distDir);
  const tmpRoot = path.resolve(root, ".tmp");
  if (resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  if (resolvedRuntimeRoot.startsWith(`${tmpRoot}${path.sep}`)) {
    fs.rmSync(resolvedRuntimeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

process.exit(exitCode);
