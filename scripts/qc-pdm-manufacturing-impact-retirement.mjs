#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-impact-retirement-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
Object.assign(process.env, {
  PDM_DB_PROVIDER: "sqlite",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir
});

console.log(JSON.stringify({
  runtimeDeclaration: {
    project: root,
    purpose: "standalone manufacturing-impact retirement contract and isolated permission migration",
    port: null,
    owningProcessTree: `node:${process.pid}`,
    cleanupCondition: "all assertions complete; close fixture DB and remove exact taskRoot",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot
  }
}));

const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
  });
}

let fixture;
try {
  const runtimeSources = sourceFiles(path.join(root, "src"));
  const sourceText = runtimeSources
    .filter((file) => file !== path.join(root, "src", "lib", "db.ts"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  const allSourceText = runtimeSources.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  record("standalone page is absent", !exists("src/app/numbering/impact/page.tsx"));
  record("standalone API route is absent", !exists("src/app/api/numbering/impact-analysis/route.ts"));
  record("runtime has no retired route or permission consumers", !sourceText.includes("/numbering/impact") && !sourceText.includes("numbering.impact"));
  record(
    "runtime has no legacy repository facade",
    !allSourceText.includes("analyzeMainDrawingObsolescence") && !allSourceText.includes("MainDrawingImpact") && !allSourceText.includes("impactWorkbench")
  );

  const workbench = read("src/components/canonical-pdm-workbench.tsx");
  const formalImpactRoute = read("src/app/api/lifecycle/obsolete-impact/route.ts");
  record(
    "formal obsolete dependency snapshot remains",
    exists("src/lib/numbering-obsolete-impact.ts") &&
      formalImpactRoute.includes("getFormalObsoleteImpactAsync") &&
      workbench.includes("/api/lifecycle/obsolete-impact") &&
      workbench.includes("impactFingerprint")
  );
  record(
    "drawing revision F/F/F impact remains",
    exists("src/lib/drawing-change-impact.ts") &&
      read("src/components/canonical-drawing-change-workspace.tsx").includes("formState") &&
      read("src/components/canonical-drawing-change-workspace.tsx").includes("functionState")
  );

  const schema = read("db/schema.sql");
  record("fresh SQLite schema does not seed retired permissions", !schema.includes("numbering.impact"));
  fixture = new Database(path.join(dataDir, "retirement-fixture.sqlite"));
  fixture.exec(schema);
  const role = fixture.prepare("SELECT id FROM roles ORDER BY id LIMIT 1").get();
  if (!role?.id) throw new Error("RETIREMENT_FIXTURE_ROLE_MISSING");
  const insertPermission = fixture.prepare(
    "INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed) VALUES (?, ?, ?, ?, 1)"
  );
  insertPermission.run("retired-page", role.id, "page", "numbering.impact");
  insertPermission.run("retired-analyze", role.id, "action", "numbering.impact.analyze");
  insertPermission.run("retired-apply", role.id, "action", "numbering.impact.apply");

  const { ensureStandaloneManufacturingImpactRetirement } = await import("../src/lib/db.ts");
  ensureStandaloneManufacturingImpactRetirement(fixture);
  ensureStandaloneManufacturingImpactRetirement(fixture);
  const retiredCount = fixture.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE permission_code LIKE 'numbering.impact%'").get().count;
  const ledgerCount = fixture.prepare("SELECT COUNT(*) AS count FROM pdm_local_data_migrations WHERE version = 'pdm-standalone-manufacturing-impact-retirement-v1'").get().count;
  record("SQLite migration deletes only retired permission family", retiredCount === 0 && ledgerCount === 1, JSON.stringify({ retiredCount, ledgerCount }));
  record("SQLite migration preserves foreign-key integrity", fixture.pragma("foreign_key_check").length === 0);

  const postgresMigration = read("db/postgres/050_retire_standalone_manufacturing_impact.sql");
  record(
    "PostgreSQL migration is bounded to the three retired permissions",
    (postgresMigration.match(/DELETE FROM public\.role_permissions/gu) ?? []).length === 1 &&
      ["numbering.impact", "numbering.impact.analyze", "numbering.impact.apply"].every((code) => postgresMigration.includes(`'${code}'`)) &&
      !/DELETE FROM public\.(?!role_permissions)/u.test(postgresMigration)
  );
} catch (error) {
  record("retirement gate executes without exception", false, error instanceof Error ? `${error.name}:${error.message}` : String(error));
} finally {
  fixture?.close();
  const resolvedTaskRoot = path.resolve(taskRoot);
  if (!resolvedTaskRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolvedTaskRoot).startsWith("ai-pdm-impact-retirement-")) {
    throw new Error(`UNSAFE_RETIREMENT_TEMP_PATH:${resolvedTaskRoot}`);
  }
  fs.rmSync(resolvedTaskRoot, { recursive: true, force: true });
}

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` :: ${result.detail}` : ""}`);
const failed = results.filter((result) => !result.passed);
if (failed.length) process.exitCode = 1;
