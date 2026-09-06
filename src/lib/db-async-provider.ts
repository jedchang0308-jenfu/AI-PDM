import type { SqliteDatabase } from "@/lib/db-provider";
import { getDb } from "@/lib/db";
import { resolveCloudSqlRuntimeConfig } from "@/lib/cloud-sql-contract";
import type { CloudSqlStartupTarget } from "@/lib/cloud-sql-contract";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type AsyncDatabaseProviderKind = "sqlite" | "postgres";
type RuntimeAsyncDatabaseProviderKind = AsyncDatabaseProviderKind | "cloud_sql_postgres";
export type AsyncDatabaseQueryParams = readonly unknown[] | Record<string, unknown>;
export type AsyncDatabaseTransactionOptions = {
  serializable?: boolean;
};

function isRetryablePostgresTransactionError(error: unknown) {
  const candidate = error as { code?: unknown } | null;
  return candidate?.code === "40001" || candidate?.code === "40P01";
}

export interface AsyncDatabaseClient {
  readonly kind: AsyncDatabaseProviderKind;
  query<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T[]>;
  queryOne<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null>;
  execute(sql: string, params?: AsyncDatabaseQueryParams): Promise<void>;
  transaction<T>(
    fn: (client: AsyncDatabaseClient) => T | Promise<T>,
    options?: AsyncDatabaseTransactionOptions
  ): Promise<T>;
  close(): Promise<void>;
}

export type CreateAsyncDatabaseClientInput =
  | {
      kind: "sqlite";
      database: SqliteDatabase;
    }
  | {
      kind: "postgres";
      connectionString?: string;
      poolerMode?: string;
      maxConnections?: number;
      connectionTimeoutMillis?: number;
      idleTimeoutMillis?: number;
      statementTimeoutMillis?: number;
      queryTimeoutMillis?: number;
      applicationName?: string;
      searchPath?: string;
    }
  | {
      kind: "cloud_sql_postgres";
      host: "127.0.0.1";
      port: number;
      database: string;
      user: string;
      maxConnections: number;
      connectionTimeoutMillis: number;
      idleTimeoutMillis: number;
      statementTimeoutMillis: number;
      queryTimeoutMillis: number;
      applicationName?: string;
      searchPath?: string;
      startupTarget?: CloudSqlStartupTarget;
    };

function bindAll<T>(database: SqliteDatabase, sql: string, params: AsyncDatabaseQueryParams | undefined): T[] {
  const statement = database.prepare(sql);
  if (!params) {
    return statement.all() as T[];
  }
  if (Array.isArray(params)) {
    return statement.all(...params) as T[];
  }
  return statement.all(params) as T[];
}

function bindGet<T>(database: SqliteDatabase, sql: string, params: AsyncDatabaseQueryParams | undefined): T | null {
  const statement = database.prepare(sql);
  const row = !params ? statement.get() : Array.isArray(params) ? statement.get(...params) : statement.get(params);
  return (row ?? null) as T | null;
}

function bindRun(database: SqliteDatabase, sql: string, params: AsyncDatabaseQueryParams | undefined): void {
  const statement = database.prepare(sql);
  if (!params) {
    statement.run();
    return;
  }
  if (Array.isArray(params)) {
    statement.run(...params);
    return;
  }
  statement.run(params);
}

function normalizePostgresQuery(sql: string, params: AsyncDatabaseQueryParams | undefined) {
  if (!params) {
    return { text: sql, values: [] };
  }
  if (Array.isArray(params)) {
    return { text: sql, values: [...params] };
  }

  const namedParams = params as Record<string, unknown>;
  const indexes = new Map<string, number>();
  const values: unknown[] = [];
  const text = sql.replace(/(?<!:)([:@])([A-Za-z_][A-Za-z0-9_]*)/gu, (_match, _prefix: string, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(namedParams, name)) {
      throw new Error(`POSTGRES_NAMED_PARAMETER_MISSING: ${name}`);
    }

    const existing = indexes.get(name);
    if (existing) {
      return `$${existing}`;
    }

    values.push(namedParams[name]);
    const index = values.length;
    indexes.set(name, index);
    return `$${index}`;
  });

  return { text, values };
}

async function runPostgresQuery<T extends QueryResultRow>(
  queryable: Pick<Pool | PoolClient, "query">,
  sql: string,
  params: AsyncDatabaseQueryParams | undefined
): Promise<T[]> {
  const query = normalizePostgresQuery(sql, params);
  const result = await queryable.query<T>(query.text, query.values);
  return result.rows;
}

class SQLiteTransactionClient implements AsyncDatabaseClient {
  readonly kind = "sqlite";

  constructor(private readonly database: SqliteDatabase) {}

  async query<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T[]> {
    return bindAll<T>(this.database, sql, params);
  }

  async queryOne<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null> {
    return bindGet<T>(this.database, sql, params);
  }

  async execute(sql: string, params?: AsyncDatabaseQueryParams): Promise<void> {
    bindRun(this.database, sql, params);
  }

  async transaction<T>(
    fn: (client: AsyncDatabaseClient) => T | Promise<T>,
    _options?: AsyncDatabaseTransactionOptions
  ): Promise<T> {
    // A transaction client is already inside the outer transaction.  Keeping
    // this passthrough preserves callers that compose repository transactions
    // without opening a second SQLite transaction.
    return await fn(this);
  }

  async close(): Promise<void> {
    return;
  }
}

export class SQLiteAsyncDatabaseClient implements AsyncDatabaseClient {
  readonly kind = "sqlite";
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(private readonly database: SqliteDatabase) {}

  async query<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T[]> {
    return bindAll<T>(this.database, sql, params);
  }

  async queryOne<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null> {
    return bindGet<T>(this.database, sql, params);
  }

  async execute(sql: string, params?: AsyncDatabaseQueryParams): Promise<void> {
    bindRun(this.database, sql, params);
  }

  async transaction<T>(
    fn: (client: AsyncDatabaseClient) => T | Promise<T>,
    _options?: AsyncDatabaseTransactionOptions
  ): Promise<T> {
    // better-sqlite3 exposes one connection to the Next runtime.  Awaited
    // repository work can otherwise interleave two BEGIN IMMEDIATE scopes on
    // that connection, causing a generic 400 (or partial state) under two-tab
    // races.  Queue top-level transactions and expose a separate nested client
    // so only the outer scope owns BEGIN/COMMIT/ROLLBACK.
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(new SQLiteTransactionClient(this.database));
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    return;
  }
}

class PostgresTransactionClient implements AsyncDatabaseClient {
  readonly kind = "postgres";

  constructor(private readonly client: PoolClient) {}

  async query<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T[]> {
    return runPostgresQuery<T & QueryResultRow>(this.client, sql, params) as Promise<T[]>;
  }

  async queryOne<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params?: AsyncDatabaseQueryParams): Promise<void> {
    await runPostgresQuery<QueryResultRow>(this.client, sql, params);
  }

  async transaction<T>(
    fn: (client: AsyncDatabaseClient) => T | Promise<T>,
    _options?: AsyncDatabaseTransactionOptions
  ): Promise<T> {
    return await fn(this);
  }

  async close(): Promise<void> {
    return;
  }
}

export class PostgresAsyncDatabaseClient implements AsyncDatabaseClient {
  readonly kind = "postgres";
  private readonly pool: Pool;
  private readonly startupTarget: CloudSqlStartupTarget | undefined;
  private startupReadback: Promise<void> | null = null;

  constructor(input: Extract<CreateAsyncDatabaseClientInput, { kind: "postgres" | "cloud_sql_postgres" }>) {
    if (input.kind === "postgres") {
      this.startupTarget = undefined;
      const connectionString = input.connectionString?.trim();
      if (!connectionString) throw new Error("POSTGRES_CONNECTION_STRING_REQUIRED");
      this.pool = new Pool({
        application_name: input.applicationName ?? "ai-pdm-postgres-runtime",
        connectionString,
        max: input.maxConnections ?? 8,
        connectionTimeoutMillis: input.connectionTimeoutMillis ?? 10_000,
        idleTimeoutMillis: input.idleTimeoutMillis ?? 600_000,
        options: input.searchPath ? `-c search_path=${input.searchPath}` : undefined,
        statement_timeout: input.statementTimeoutMillis ?? 30_000,
        query_timeout: input.queryTimeoutMillis ?? 35_000
      });
      return;
    }

    if (input.host !== "127.0.0.1") throw new Error("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED");
    this.startupTarget = input.startupTarget;
    this.pool = new Pool({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      password: undefined,
      ssl: false,
      max: input.maxConnections,
      connectionTimeoutMillis: input.connectionTimeoutMillis,
      idleTimeoutMillis: input.idleTimeoutMillis,
      statement_timeout: input.statementTimeoutMillis,
      query_timeout: input.queryTimeoutMillis,
      application_name: input.applicationName ?? "ai-pdm-cloud-run",
      options: input.searchPath ? `-c search_path=${input.searchPath}` : undefined
    });
  }

  private async assertStartupReady(): Promise<void> {
    const target = this.startupTarget;
    if (!target) return;
    this.startupReadback ??= (async () => {
      const result = await this.pool.query<{
        database: string;
        environment_marker: string | null;
        postgres_major: number;
        schema_ready: boolean;
        user: string;
      }>(`SELECT
        current_database() AS database,
        current_user AS user,
        current_setting('server_version_num')::integer / 10000 AS postgres_major,
        to_regnamespace($1) IS NOT NULL AS schema_ready,
        pg_catalog.shobj_description(database.oid, 'pg_database') AS environment_marker
      FROM pg_catalog.pg_database AS database
      WHERE database.datname = current_database()`, [target.schema]);
      const row = result.rows[0];
      if (
        !row ||
        row.database !== target.database ||
        row.user !== target.user ||
        Number(row.postgres_major) !== target.postgresMajor ||
        row.schema_ready !== true ||
        row.environment_marker !== target.environmentMarker
      ) throw new Error("DEV010_N1C_AI_PDM_DATABASE_READBACK_MISMATCH");
    })();
    await this.startupReadback;
  }

  async query<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T[]> {
    await this.assertStartupReady();
    return runPostgresQuery<T & QueryResultRow>(this.pool, sql, params) as Promise<T[]>;
  }

  async queryOne<T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params?: AsyncDatabaseQueryParams): Promise<void> {
    await this.assertStartupReady();
    await runPostgresQuery<QueryResultRow>(this.pool, sql, params);
  }

  async transaction<T>(
    fn: (client: AsyncDatabaseClient) => T | Promise<T>,
    options?: AsyncDatabaseTransactionOptions
  ): Promise<T> {
    await this.assertStartupReady();
    const client = await this.pool.connect();
    const maxAttempts = options?.serializable ? 3 : 1;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await client.query(options?.serializable ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN");
          const transactionClient = new PostgresTransactionClient(client);
          const result = await fn(transactionClient);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          if (attempt < maxAttempts && options?.serializable && isRetryablePostgresTransactionError(error)) continue;
          throw error;
        }
      }
      throw new Error("POSTGRES_TRANSACTION_RETRY_EXHAUSTED");
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createAsyncDatabaseClient(input: CreateAsyncDatabaseClientInput): AsyncDatabaseClient {
  if (input.kind === "sqlite") {
    return new SQLiteAsyncDatabaseClient(input.database);
  }

  return new PostgresAsyncDatabaseClient(input);
}

let runtimeClient: AsyncDatabaseClient | null = null;
let runtimeClientSignature = "";

function normalizeRuntimeProviderKind(provider: string | undefined): RuntimeAsyncDatabaseProviderKind {
  const normalized = (provider ?? "sqlite").trim().toLowerCase();
  if (normalized === "sqlite" || normalized === "postgres" || normalized === "cloud_sql_postgres") return normalized;
  throw new Error(`UNSUPPORTED_ASYNC_DB_PROVIDER: ${normalized}`);
}

function parseMaxConnections(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`INVALID_PDM_POSTGRES_MAX_CONNECTIONS: ${value}`);
  }
  return parsed;
}

function getRuntimeClientSignature(kind: RuntimeAsyncDatabaseProviderKind) {
  if (kind === "sqlite") return "sqlite";
  if (kind === "cloud_sql_postgres") {
    return [
      kind,
      process.env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME?.trim() ?? "",
      process.env.PDM_CLOUD_SQL_HOST?.trim() ?? "",
      process.env.PDM_CLOUD_SQL_PORT?.trim() ?? "",
      process.env.PDM_CLOUD_SQL_DATABASE?.trim() ?? "",
      process.env.PDM_CLOUD_SQL_USER?.trim() ?? "",
      process.env.PDM_CLOUD_SQL_POOL_MAX?.trim() ?? "",
      process.env.DEV010_N1C_TARGET_GUARD?.trim() ?? "",
      process.env.DEV010_N1C_RUN_ID?.trim() ?? "",
      process.env.PDM_DEPLOYMENT_ENV?.trim() ?? "",
      process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "",
      process.env.GOOGLE_CLOUD_REGION?.trim() ?? "",
      process.env.PDM_DATABASE_ENVIRONMENT_MARKER?.trim() ?? "",
      process.env.DEV010_N2_DATABASE_BOUNDARY?.trim() ?? "",
      process.env.DEV010_N2_RUN_ID?.trim() ?? ""
    ].join("|");
  }
  return [
    "postgres",
    process.env.PDM_POSTGRES_URL?.trim() ?? "",
    process.env.PDM_POSTGRES_POOLER_MODE?.trim() ?? "",
    process.env.PDM_POSTGRES_MAX_CONNECTIONS?.trim() ?? "",
    process.env.DEV010_N2_DATABASE_BOUNDARY?.trim() ?? "",
    process.env.DEV010_N2_RUN_ID?.trim() ?? ""
  ].join("|");
}

export function getAsyncDatabaseClient(): AsyncDatabaseClient {
  const kind = normalizeRuntimeProviderKind(process.env.PDM_DB_PROVIDER);
  const signature = getRuntimeClientSignature(kind);
  if (runtimeClient && runtimeClientSignature === signature) return runtimeClient;

  if (kind === "sqlite") {
    runtimeClient = createAsyncDatabaseClient({ kind, database: getDb() });
  } else if (kind === "cloud_sql_postgres") {
    runtimeClient = createAsyncDatabaseClient(resolveCloudSqlRuntimeConfig());
  } else {
    runtimeClient = createAsyncDatabaseClient({
      kind,
      connectionString: process.env.PDM_POSTGRES_URL,
      poolerMode: process.env.PDM_POSTGRES_POOLER_MODE,
      maxConnections: parseMaxConnections(process.env.PDM_POSTGRES_MAX_CONNECTIONS) ?? 8,
      applicationName: process.env.DEV010_N2_RUN_ID?.trim()
        ? `dev010-n2-ai-pdm-${process.env.DEV010_N2_RUN_ID.trim().replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 80)}`
        : "ai-pdm-postgres-runtime",
      searchPath: process.env.DEV010_N2_DATABASE_BOUNDARY === "required" ? "ai_pdm_core,pg_catalog" : undefined
    });
  }
  runtimeClientSignature = signature;
  return runtimeClient;
}

export async function verifyAsyncDatabaseReadiness(): Promise<void> {
  const client = getAsyncDatabaseClient();
  if (client.kind !== "postgres") throw new Error("DEV010_N1C_AI_PDM_POSTGRES_REQUIRED");
  await client.queryOne<{ ready: number }>("SELECT 1 AS ready");
}

export async function closeAsyncDatabaseClient(): Promise<void> {
  await runtimeClient?.close();
  runtimeClient = null;
  runtimeClientSignature = "";
}
