#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const sourcePath = path.join(root, "src", "lib", "repositories", "system-settings-async-repository.ts");
const helperPath = path.join(root, "src", "lib", "system-settings-async.ts");
const authAsyncPath = path.join(root, "src", "lib", "auth-async.ts");
const settingsRoutePath = path.join(root, "src", "app", "api", "settings", "route.ts");
const gdriveFoldersRoutePath = path.join(root, "src", "app", "api", "settings", "gdrive", "folders", "route.ts");
const gdriveVerifyRoutePath = path.join(root, "src", "app", "api", "settings", "gdrive", "folders", "verify", "route.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const helperSource = fs.readFileSync(helperPath, "utf8");
const authAsyncSource = fs.readFileSync(authAsyncPath, "utf8");
const settingsRouteSource = fs.readFileSync(settingsRoutePath, "utf8");
const gdriveFoldersRouteSource = fs.readFileSync(gdriveFoldersRoutePath, "utf8");
const gdriveVerifyRouteSource = fs.readFileSync(gdriveVerifyRoutePath, "utf8");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function extractSqlConstant(name) {
  const stringMatch = source.match(new RegExp(`export const ${name} = "([^"]+)"`, "u"));
  if (stringMatch) return stringMatch[1];
  const templateMatch = source.match(new RegExp(`export const ${name} = ` + "`" + `([\\s\\S]*?)` + "`", "u"));
  return templateMatch?.[1] ?? "";
}

record("SYS-ASYNC-001 repository imports AsyncDatabaseClient", source.includes("AsyncDatabaseClient"), "system-settings-async-repository.ts");
record("SYS-ASYNC-002 repository avoids sync getDb", !source.includes("getDb("), "system-settings-async-repository.ts");
record("SYS-ASYNC-003 repository avoids better-sqlite3 import", !source.includes("better-sqlite3"), "system-settings-async-repository.ts");
record("SYS-ASYNC-004 repository defines async class", source.includes("export class AsyncSystemSettingsRepository"), "system-settings-async-repository.ts");
record("SYS-ASYNC-005 repository exposes portable SQL constants", ["SELECT_SYSTEM_SETTING_SQL", "SELECT_ALL_SYSTEM_SETTINGS_SQL", "UPSERT_SYSTEM_SETTING_SQL"].every((name) => source.includes(name)), "system-settings-async-repository.ts");
record(
  "SYS-ASYNC-006 helper uses runtime async provider selector",
  helperSource.includes("getAsyncDatabaseClient") &&
    helperSource.includes("AsyncSystemSettingsRepository") &&
    helperSource.includes("getAllSystemSettingsAsync") &&
    helperSource.includes("setSystemSettingAsync") &&
    !helperSource.includes("SQLiteAsyncDatabaseClient") &&
    !helperSource.includes("getDb(") &&
    !helperSource.includes("getAllSystemSettings(") &&
    !helperSource.includes("setSystemSetting("),
  "system-settings-async.ts"
);
record(
  "SYS-ASYNC-007 auth async exposes role guard",
  authAsyncSource.includes("export async function requireRoleAsync") &&
    authAsyncSource.includes("roles.includes(auth.user.role)") &&
    authAsyncSource.includes("requireAuthAsync(request)") &&
    authAsyncSource.includes("response: forbidden()"),
  "auth-async.ts"
);
record(
  "SYS-ASYNC-008 auth async preserves forbidden role semantics",
  authAsyncSource.includes('import { forbidden, unauthorized } from "@/lib/auth"') &&
    authAsyncSource.includes("response: forbidden()") &&
    !authAsyncSource.includes("!roles.includes(auth.user.role)) return { user: auth.user, response: unauthorized() }"),
  "auth-async.ts"
);
record(
  "SYS-ASYNC-009 settings route uses async auth/settings/audit",
  settingsRouteSource.includes("requireRoleAsync") &&
    settingsRouteSource.includes("await requireRoleAsync") &&
    settingsRouteSource.includes("getAllSystemSettingsAsync") &&
    settingsRouteSource.includes("await getAllSystemSettingsAsync") &&
    settingsRouteSource.includes("setSystemSettingAsync") &&
    settingsRouteSource.includes("await setSystemSettingAsync") &&
    settingsRouteSource.includes("createAuditLogAsync") &&
    settingsRouteSource.includes("await createAuditLogAsync") &&
    !settingsRouteSource.includes('from "@/lib/db"') &&
    !settingsRouteSource.includes("getAllSystemSettings()") &&
    !settingsRouteSource.includes("setSystemSetting(") &&
    !settingsRouteSource.includes("createAuditLog("),
  "src/app/api/settings/route.ts"
);
record(
  "SYS-ASYNC-010 gdrive settings routes use async admin guard",
  [gdriveFoldersRouteSource, gdriveVerifyRouteSource].every(
    (routeSource) =>
      routeSource.includes("requireRoleAsync") &&
      routeSource.includes('await requireRoleAsync(request, ["Admin"])') &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/auth"') &&
      !routeSource.includes('from "@/lib/db"')
  ),
  "src/app/api/settings/gdrive/folders routes"
);

const selectOneSql = extractSqlConstant("SELECT_SYSTEM_SETTING_SQL");
const selectAllSql = extractSqlConstant("SELECT_ALL_SYSTEM_SETTINGS_SQL");
const upsertSql = extractSqlConstant("UPSERT_SYSTEM_SETTING_SQL");
record("SYS-ASYNC-011 extracted select/upsert SQL", Boolean(selectOneSql && selectAllSql && upsertSql), "system-settings-async-repository.ts");
record("SYS-ASYNC-012 upsert uses named params", [":key", ":value", ":updatedAt", ":updatedBy"].every((param) => upsertSql.includes(param)), upsertSql);
record("SYS-ASYNC-013 upsert uses conflict update", upsertSql.includes("ON CONFLICT(key) DO UPDATE"), upsertSql);

try {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY
    );
    INSERT INTO users (id) VALUES ('user-admin-demo');
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );
  `);

  database.prepare(upsertSql).run({
    key: "gdrive_pending_folder_id",
    value: "folder-a",
    updatedAt: "2026-06-08T00:00:00.000Z",
    updatedBy: "user-admin-demo"
  });
  database.prepare(upsertSql).run({
    key: "gdrive_pending_folder_id",
    value: "folder-b",
    updatedAt: "2026-06-08T00:01:00.000Z",
    updatedBy: "user-admin-demo"
  });
  database.prepare(upsertSql).run({
    key: "gdrive_released_folder_id",
    value: "folder-r",
    updatedAt: "2026-06-08T00:02:00.000Z",
    updatedBy: "user-admin-demo"
  });

  const pending = database.prepare(selectOneSql).get({ key: "gdrive_pending_folder_id" });
  const missing = database.prepare(selectOneSql).get({ key: "missing_key" });
  const rows = database.prepare(selectAllSql).all();

  record("SYS-ASYNC-014 SQLite semantic upsert updates existing setting", pending?.value === "folder-b", JSON.stringify(pending));
  record("SYS-ASYNC-015 SQLite semantic missing setting returns undefined", missing === undefined, JSON.stringify(missing));
  record("SYS-ASYNC-016 SQLite semantic get-all returns two settings", rows.length === 2 && rows[0].key === "gdrive_pending_folder_id" && rows[1].key === "gdrive_released_folder_id", JSON.stringify(rows));
  database.close();
} catch (error) {
  record("SYS-ASYNC-014 SQLite semantic upsert updates existing setting", false, error instanceof Error ? error.message : String(error));
  record("SYS-ASYNC-015 SQLite semantic missing setting returns undefined", false, "semantic setup failed");
  record("SYS-ASYNC-016 SQLite semantic get-all returns two settings", false, "semantic setup failed");
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
