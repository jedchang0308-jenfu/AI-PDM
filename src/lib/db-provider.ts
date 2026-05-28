import fs from "node:fs";
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
      this.input.initialize(this.#connection);
      this.#initialized = true;
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
