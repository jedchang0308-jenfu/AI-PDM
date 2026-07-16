import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "./db-async-provider";

export const PDM_MIGRATION_ADVISORY_LOCK_ID = 7_104_604_601;

export interface GuardedMigration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export function migrationChecksum(sql: string) {
  return crypto.createHash("sha256").update(sql.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}

export function defineGuardedMigration(input: Omit<GuardedMigration, "checksum">): GuardedMigration {
  return { ...input, checksum: migrationChecksum(input.sql) };
}

export function validateGuardedMigrations(migrations: GuardedMigration[]) {
  const versions = new Set<string>();
  for (const migration of migrations) {
    if (!/^\d{3,14}$/u.test(migration.version)) throw new Error(`MIGRATION_VERSION_INVALID:${migration.version}`);
    if (versions.has(migration.version)) throw new Error(`MIGRATION_VERSION_DUPLICATE:${migration.version}`);
    versions.add(migration.version);
    if (migrationChecksum(migration.sql) !== migration.checksum) throw new Error(`MIGRATION_CHECKSUM_INVALID:${migration.version}`);
    if (/\bCREATE\s+INDEX\s+CONCURRENTLY\b/iu.test(migration.sql)) throw new Error(`MIGRATION_NON_TRANSACTIONAL_DDL_FORBIDDEN:${migration.version}`);
  }
}

export async function runSingletonMigrations(client: AsyncDatabaseClient, migrations: GuardedMigration[]) {
  if (client.kind === "sqlite") throw new Error("MIGRATION_RUNNER_POSTGRES_REQUIRED");
  validateGuardedMigrations(migrations);
  return client.transaction(async (transaction) => {
    const lock = await transaction.queryOne<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(:lockId) AS acquired",
      { lockId: PDM_MIGRATION_ADVISORY_LOCK_ID }
    );
    if (!lock?.acquired) throw new Error("MIGRATION_RUNNER_ALREADY_ACTIVE");
    await transaction.execute(`
      CREATE TABLE IF NOT EXISTS pdm_schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = await transaction.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM pdm_schema_migrations ORDER BY version"
    );
    const appliedByVersion = new Map(applied.map((row) => [row.version, row.checksum]));
    const appliedNow: string[] = [];
    for (const migration of migrations) {
      const existingChecksum = appliedByVersion.get(migration.version);
      if (existingChecksum && existingChecksum !== migration.checksum) throw new Error(`MIGRATION_HISTORY_CHECKSUM_MISMATCH:${migration.version}`);
      if (existingChecksum) continue;
      await transaction.execute(migration.sql);
      await transaction.execute(
        "INSERT INTO pdm_schema_migrations (version, name, checksum) VALUES (:version, :name, :checksum)",
        { version: migration.version, name: migration.name, checksum: migration.checksum }
      );
      appliedNow.push(migration.version);
    }
    return { appliedVersions: appliedNow };
  });
}

export function scanApplicationStartupDdl(entries: Array<{ path: string; source: string }>) {
  const violations: string[] = [];
  for (const entry of entries) {
    if (!/^src\/(?:app|middleware|proxy|instrumentation)/u.test(entry.path.replaceAll("\\", "/"))) continue;
    if (/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|INDEX|SCHEMA|TYPE|POLICY|TRIGGER)\b/iu.test(entry.source)) {
      violations.push(entry.path);
    }
  }
  return violations;
}
