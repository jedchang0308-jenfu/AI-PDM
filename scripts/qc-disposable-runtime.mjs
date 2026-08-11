import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const demoEmails = [
  "admin@example.com",
  "engineer@example.com",
  "manager@example.com",
  "manufacturing@example.com",
  "procurement@example.com"
];

export async function prepareDisposableSqliteRuntime(root, prefix) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repositoryDir = path.join(dataDir, "repository");
  const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
  const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
  const sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(fixtureDbPath);
  } finally {
    sourceDb.close();
  }

  const fixtureDb = new Database(fixtureDbPath);
  try {
    const placeholders = demoEmails.map(() => "?").join(", ");
    fixtureDb
      .prepare(
        `UPDATE users
         SET password_hash = NULL,
             account_status = 'active',
             system_role_enabled = 1,
             account_status_changed_at = NULL,
             account_status_changed_by = NULL,
             account_status_reason = NULL
         WHERE lower(email) IN (${placeholders})`
      )
      .run(...demoEmails);
    fixtureDb
      .prepare(
        `UPDATE auth_identities
         SET status = 'active'
         WHERE lower(login_identifier) IN (${placeholders})`
      )
      .run(...demoEmails);
  } finally {
    fixtureDb.close();
  }

  const env = {
    PDM_AUTH_MODE: "demo",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_PRODUCTION_SLICE_MODE: ""
  };
  Object.assign(process.env, env);

  return {
    dataDir,
    repositoryDir,
    env,
    cleanup() {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
  };
}
