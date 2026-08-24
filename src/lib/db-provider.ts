import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = import("better-sqlite3").Database;
export type DatabaseProviderKind = "sqlite";
export type DatabaseInitializer = (database: SqliteDatabase) => void;

export interface DatabaseProvider {
  readonly kind: DatabaseProviderKind;
  getConnection(): SqliteDatabase;
  close(): void;
}

export type SQLiteDatabaseProviderInput = {
  databasePath: string;
  dataDir: string;
  repositoryDir: string;
  initialize: DatabaseInitializer;
};

type SQLiteInitializerLock = {
  fd: number;
  lockPath: string;
  token: string;
};

type SQLiteInitializerLockMetadata = {
  token?: string;
  pid?: number;
  acquiredAt?: string;
};

const initLockPollMs = 50;
const initLockStaleGraceMs = 5_000;
const initLockInvalidMetadataStaleMs = 5 * 60_000;

function waitSynchronously(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function lockTimeoutMs() {
  const configured = Number.parseInt(process.env.PDM_SQLITE_INIT_LOCK_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : 120_000;
}

function acquireSQLiteInitializerLock(databasePath: string): SQLiteInitializerLock {
  const resolvedDatabasePath = path.resolve(databasePath);
  const lockPath = `${resolvedDatabasePath}.init.lock`;
  const token = crypto.randomUUID();
  const startedAt = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, `${JSON.stringify({ token, pid: process.pid, databasePath: resolvedDatabasePath, acquiredAt: new Date().toISOString() })}\n`, "utf8");
      fs.fsyncSync(fd);
      return { fd, lockPath, token };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      let owner: SQLiteInitializerLockMetadata | null = null;
      let ageMs = 0;
      try {
        const stat = fs.statSync(lockPath);
        ageMs = Date.now() - stat.mtimeMs;
        owner = JSON.parse(fs.readFileSync(lockPath, "utf8")) as SQLiteInitializerLockMetadata;
      } catch {
        // A live owner may still be writing metadata. Only an old invalid lock
        // is eligible for recovery.
      }

      const ownerAgeMs = owner?.acquiredAt ? Date.now() - Date.parse(owner.acquiredAt) : ageMs;
      const deadOwner = Boolean(owner?.pid) && !processIsAlive(Number(owner?.pid)) && ownerAgeMs >= initLockStaleGraceMs;
      const invalidStaleLock = !owner?.token && ageMs >= initLockInvalidMetadataStaleMs;
      if (deadOwner || invalidStaleLock) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch (unlinkError) {
          if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
          continue;
        }
      }

      if (Date.now() - startedAt >= lockTimeoutMs()) {
        throw new Error(`PDM_SQLITE_INIT_LOCK_TIMEOUT:${lockPath}:owner=${JSON.stringify(owner)}`);
      }
      waitSynchronously(initLockPollMs);
    }
  }
}

function releaseSQLiteInitializerLock(lock: SQLiteInitializerLock) {
  fs.closeSync(lock.fd);
  let currentToken: string | undefined;
  try {
    currentToken = (JSON.parse(fs.readFileSync(lock.lockPath, "utf8")) as { token?: string }).token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (currentToken !== lock.token) throw new Error(`PDM_SQLITE_INIT_LOCK_OWNERSHIP_LOST:${lock.lockPath}`);
  fs.unlinkSync(lock.lockPath);
}

export class SQLiteDatabaseProvider implements DatabaseProvider {
  readonly kind = "sqlite";
  #connection: SqliteDatabase | null = null;
  #initialized = false;

  constructor(private readonly input: SQLiteDatabaseProviderInput) {}

  getConnection() {
    if (!this.#connection) {
      fs.mkdirSync(this.input.dataDir, { recursive: true });
      fs.mkdirSync(this.input.repositoryDir, { recursive: true });
      this.#connection = new Database(this.input.databasePath);
    }

    if (!this.#initialized) {
      const lock = acquireSQLiteInitializerLock(this.input.databasePath);
      try {
        this.input.initialize(this.#connection);
        this.#initialized = true;
      } catch (error) {
        this.#connection.close();
        this.#connection = null;
        throw error;
      } finally {
        releaseSQLiteInitializerLock(lock);
      }
    }

    return this.#connection;
  }

  close() {
    if (this.#connection) {
      this.#connection.close();
      this.#connection = null;
    }
    this.#initialized = false;
  }
}

export type CreateDefaultDatabaseProviderInput = SQLiteDatabaseProviderInput & {
  provider?: string;
};

export function createDefaultDatabaseProvider(input: CreateDefaultDatabaseProviderInput): DatabaseProvider {
  const provider = (input.provider ?? process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (provider !== "sqlite") {
    throw new Error(`UNSUPPORTED_DB_PROVIDER: ${provider}. Only sqlite is available in this build.`);
  }

  return new SQLiteDatabaseProvider(input);
}
