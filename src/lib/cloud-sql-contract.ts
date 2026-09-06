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
  applicationName?: string;
  searchPath?: string;
  startupTarget?: CloudSqlStartupTarget;
}

export interface CloudSqlStartupTarget {
  database: "jenfu_stg";
  environmentMarker: "JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C";
  postgresMajor: 17;
  schema: "ai_pdm_core";
  user: "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam";
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

  const n1cTargetRequired = env.DEV010_N1C_TARGET_GUARD === "required";
  if (n1cTargetRequired) {
    const exact = {
      environment: env.PDM_DEPLOYMENT_ENV?.trim(),
      projectId: env.GOOGLE_CLOUD_PROJECT?.trim(),
      region: env.GOOGLE_CLOUD_REGION?.trim(),
      instanceConnectionName,
      database,
      user,
      environmentMarker: env.PDM_DATABASE_ENVIRONMENT_MARKER?.trim(),
    };
    if (
      exact.environment !== "staging" ||
      exact.projectId !== "jenfu-platform-nonprod" ||
      exact.region !== "asia-east1" ||
      exact.instanceConnectionName !== "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg" ||
      exact.database !== "jenfu_stg" ||
      exact.user !== "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam" ||
      exact.environmentMarker !== "JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C"
    ) throw new Error("DEV010_N1C_AI_PDM_WRONG_TARGET");
  }

  const maxConnections = positiveInteger(env.PDM_CLOUD_SQL_POOL_MAX, 8, "POOL_MAX");
  if (n1cTargetRequired && maxConnections !== 2) throw new Error("DEV010_N1C_AI_PDM_POOL_BOUNDARY_INVALID");
  return {
    kind: "cloud_sql_postgres",
    instanceConnectionName,
    host,
    port: positiveInteger(env.PDM_CLOUD_SQL_PORT, 5432, "PORT"),
    database,
    user,
    maxConnections,
    connectionTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS, 10_000, "CONNECTION_TIMEOUT"),
    idleTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_IDLE_TIMEOUT_MS, 600_000, "IDLE_TIMEOUT"),
    statementTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS, 30_000, "STATEMENT_TIMEOUT"),
    queryTimeoutMillis: positiveInteger(env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS, 35_000, "QUERY_TIMEOUT"),
    applicationName: n1cTargetRequired
      ? `dev010-n1c-ai-pdm-${(env.DEV010_N1C_RUN_ID?.trim() || "runtime").replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 80)}`
      : env.DEV010_N2_RUN_ID?.trim()
        ? `dev010-n2-ai-pdm-${env.DEV010_N2_RUN_ID.trim().replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 80)}`
        : "ai-pdm-cloud-run",
    searchPath: n1cTargetRequired || env.DEV010_N2_DATABASE_BOUNDARY === "required" ? "ai_pdm_core,pg_catalog" : undefined,
    startupTarget: n1cTargetRequired ? {
      database: "jenfu_stg",
      environmentMarker: "JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C",
      postgresMajor: 17,
      schema: "ai_pdm_core",
      user: "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam"
    } : undefined
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
