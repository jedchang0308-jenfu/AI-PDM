export interface CloudSqlRuntimeConfig {
  kind: "cloud_sql_postgres";
  instanceConnectionName: string;
  host: "127.0.0.1";
  port: number;
  database: string;
  user: string;
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
  queryTimeoutMillis: number;
}

export interface CloudSqlCapacityInput {
  maxInstancesPerRevision: number;
  maximumConcurrentRevisions: number;
  effectiveMaximumInstances: number;
  containerConcurrency: number;
  poolMax: number;
  migrationAdminReserve: number;
  maxConnections: number;
  minimumReserveRatio: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  queryTimeoutMs: number;
}

export interface CloudSqlCapacityResult {
  valid: boolean;
  errors: string[];
  requiredConnections: number;
  allowedApplicationConnections: number;
  reserveConnections: number;
  utilizationRatio: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const normalized = value?.trim();
  const parsed = normalized ? Number.parseInt(normalized, 10) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`CLOUD_SQL_${name}_INVALID`);
  return parsed;
}

export function resolveCloudSqlRuntimeConfig(env: NodeJS.ProcessEnv = process.env): CloudSqlRuntimeConfig {
  const forbiddenSecrets = [env.PDM_CLOUD_SQL_PASSWORD, env.PDM_POSTGRES_URL, env.PDM_POSTGRES_ADMIN_URL].filter((value) => value?.trim());
  if (forbiddenSecrets.length > 0) throw new Error("CLOUD_SQL_STATIC_DATABASE_SECRET_FORBIDDEN");
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) throw new Error("CLOUD_SQL_SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");

  const instanceConnectionName = env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{4,29}:asia-east1:[a-z][a-z0-9-]{0,97}$/u.test(instanceConnectionName)) {
    throw new Error("CLOUD_SQL_INSTANCE_CONNECTION_NAME_INVALID");
  }
  const host = env.PDM_CLOUD_SQL_HOST?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED");
  const database = env.PDM_CLOUD_SQL_DATABASE?.trim() || "ai_pdm";
  const user = env.PDM_CLOUD_SQL_USER?.trim() ?? "";
  if (!/^[A-Za-z0-9_.@-]{3,63}$/u.test(user)) throw new Error("CLOUD_SQL_IAM_DATABASE_USER_INVALID");

  return {
    kind: "cloud_sql_postgres",
    instanceConnectionName,
    host,
    port: positiveInteger(env.PDM_CLOUD_SQL_PORT, 5432, "PORT"),
    database,
    user,
    maxConnections: positiveInteger(env.PDM_CLOUD_SQL_POOL_MAX, 5, "POOL_MAX"),
    connectionTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS, 10_000, "CONNECTION_TIMEOUT"),
    idleTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_IDLE_TIMEOUT_MS, 600_000, "IDLE_TIMEOUT"),
    statementTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS, 30_000, "STATEMENT_TIMEOUT"),
    queryTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS, 35_000, "QUERY_TIMEOUT")
  };
}

export function validateCloudSqlCapacity(input: CloudSqlCapacityInput): CloudSqlCapacityResult {
  const errors: string[] = [];
  const integerFields: Array<keyof Omit<CloudSqlCapacityInput, "minimumReserveRatio">> = [
    "maxInstancesPerRevision",
    "maximumConcurrentRevisions",
    "effectiveMaximumInstances",
    "containerConcurrency",
    "poolMax",
    "migrationAdminReserve",
    "maxConnections",
    "connectionTimeoutMs",
    "idleTimeoutMs",
    "statementTimeoutMs",
    "queryTimeoutMs"
  ];
  for (const field of integerFields) {
    if (!Number.isInteger(input[field]) || input[field] <= 0) errors.push(`CLOUD_SQL_CAPACITY_${field.toUpperCase()}_INVALID`);
  }
  if (input.minimumReserveRatio < 0.3 || input.minimumReserveRatio >= 1) errors.push("CLOUD_SQL_CAPACITY_RESERVE_RATIO_INVALID");
  if (input.effectiveMaximumInstances < input.maxInstancesPerRevision * input.maximumConcurrentRevisions) {
    errors.push("CLOUD_SQL_CAPACITY_EFFECTIVE_INSTANCES_UNDERSTATED");
  }
  if (input.poolMax > 100) errors.push("CLOUD_SQL_CAPACITY_CLOUD_RUN_PER_INSTANCE_LIMIT_EXCEEDED");
  if (input.statementTimeoutMs >= input.queryTimeoutMs) errors.push("CLOUD_SQL_CAPACITY_QUERY_TIMEOUT_ORDER_INVALID");
  if (input.connectionTimeoutMs > input.queryTimeoutMs) errors.push("CLOUD_SQL_CAPACITY_CONNECTION_TIMEOUT_ORDER_INVALID");

  const requiredConnections = input.effectiveMaximumInstances * input.poolMax + input.migrationAdminReserve;
  const allowedApplicationConnections = Math.floor(input.maxConnections * (1 - input.minimumReserveRatio));
  const reserveConnections = input.maxConnections - requiredConnections;
  const utilizationRatio = requiredConnections / input.maxConnections;
  if (requiredConnections > allowedApplicationConnections) errors.push("CLOUD_SQL_CAPACITY_RESERVE_BREACHED");
  return { valid: errors.length === 0, errors, requiredConnections, allowedApplicationConnections, reserveConnections, utilizationRatio };
}
