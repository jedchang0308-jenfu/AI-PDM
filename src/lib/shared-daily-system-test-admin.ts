import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export const SHARED_DAILY_SYSTEM_TEST_ADMIN = Object.freeze({
  format: "ai-pdm.shared-daily-system-test-admin.v1",
  sandboxId: "shared-daily",
  databaseName: "jenfu_local_shared_daily",
  principalId: "local-active",
  employeeId: "employee-local-active",
  roleCode: "system_admin",
  expectedPermissionCount: 66,
});

export const SHARED_DAILY_SYSTEM_TEST_ADMIN_FILENAME = "shared-daily-system-test-admin.json";

export function requireSharedDailySystemTestAdminOperations(role: {
  stableRoleId: string;
  roleCode: string;
  permissions: readonly { kind: "page" | "action"; code: string; allowed: boolean }[];
}) {
  const operations = role.stableRoleId === "role-system-admin" &&
    role.roleCode === SHARED_DAILY_SYSTEM_TEST_ADMIN.roleCode
    ? role.permissions.filter(permission => permission.allowed === true) : [];
  if (operations.length !== SHARED_DAILY_SYSTEM_TEST_ADMIN.expectedPermissionCount ||
    new Set(operations.map(({ kind, code }) => `${kind}:${code}`)).size !== operations.length) {
    throw new Error("SHARED_DAILY_SYSTEM_TEST_ADMIN_CATALOG_INVALID");
  }
  return operations;
}

type Marker = {
  format: string;
  sandboxId: string;
  databaseName: string;
  generation: string;
  fixtureHash: string;
  targetFingerprint: string;
  principalId: string;
  employeeId: string;
  roleCode: string;
  expectedPermissionCount: number;
  createdAt: string;
};

type TargetRow = {
  database_name: string;
  runtime_role: string;
  sandbox_id: string;
  generation: string;
  fixture_hash: string;
  target_fingerprint: string;
  status: string;
};

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;

function fail(): never {
  throw new Error("SHARED_DAILY_SYSTEM_TEST_ADMIN_PROFILE_INVALID");
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value as object).sort().join(",") === [...keys].sort().join(","));
}

function samePath(left: string, right: string) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function localEnvironment(environment: Record<string, string | undefined>) {
  if (environment.NODE_ENV !== "development" || environment.K_SERVICE || environment.K_REVISION ||
    environment.FUNCTION_TARGET || environment.FUNCTION_NAME || environment.FIREBASE_CONFIG ||
    environment.JENFU_LOCAL_SANDBOX_ENABLED !== "1" ||
    environment.JENFU_LOCAL_SANDBOX_ID !== SHARED_DAILY_SYSTEM_TEST_ADMIN.sandboxId) return null;
  const root = environment.JENFU_LOCAL_SANDBOX_ROOT;
  if (!root || !path.isAbsolute(root)) return null;
  let database: URL;
  let origin: URL;
  try {
    database = new URL(environment.PDM_POSTGRES_URL ?? "invalid:");
    origin = new URL(environment.JENFU_LOCAL_SANDBOX_ORIGIN ?? "invalid:");
  } catch {
    return null;
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(database.hostname) ||
    decodeURIComponent(database.pathname.slice(1)) !== SHARED_DAILY_SYSTEM_TEST_ADMIN.databaseName ||
    !database.username || database.hash || origin.protocol !== "http:" ||
    !["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname) ||
    !["1020", "1021"].includes(origin.port)) return null;
  return { root: path.resolve(root), runtimeRole: decodeURIComponent(database.username) };
}

function validateMarker(value: unknown): Marker {
  const keys = ["format", "sandboxId", "databaseName", "generation", "fixtureHash", "targetFingerprint",
    "principalId", "employeeId", "roleCode", "expectedPermissionCount", "createdAt"] as const;
  if (!exactKeys(value, keys)) fail();
  const marker = value as Marker;
  if (marker.format !== SHARED_DAILY_SYSTEM_TEST_ADMIN.format ||
    marker.sandboxId !== SHARED_DAILY_SYSTEM_TEST_ADMIN.sandboxId ||
    marker.databaseName !== SHARED_DAILY_SYSTEM_TEST_ADMIN.databaseName ||
    marker.principalId !== SHARED_DAILY_SYSTEM_TEST_ADMIN.principalId ||
    marker.employeeId !== SHARED_DAILY_SYSTEM_TEST_ADMIN.employeeId ||
    marker.roleCode !== SHARED_DAILY_SYSTEM_TEST_ADMIN.roleCode ||
    marker.expectedPermissionCount !== SHARED_DAILY_SYSTEM_TEST_ADMIN.expectedPermissionCount ||
    !UUID.test(marker.generation) || !HASH.test(marker.fixtureHash) || !HASH.test(marker.targetFingerprint) ||
    !Number.isFinite(Date.parse(marker.createdAt)) || new Date(marker.createdAt).toISOString() !== marker.createdAt) fail();
  return marker;
}

async function readMarker(root: string): Promise<Marker | null> {
  const control = path.join(root, "control");
  const filename = path.join(control, SHARED_DAILY_SYSTEM_TEST_ADMIN_FILENAME);
  const stat = await lstat(filename).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 16 * 1024 ||
    !samePath(await realpath(control), control) || !samePath(await realpath(filename), filename)) fail();
  let value: unknown;
  try { value = JSON.parse(await readFile(filename, "utf8")); } catch { fail(); }
  return validateMarker(value);
}

/** Explicit local-only system-test authority. It never changes OrgMaster grants
 * or production authorization and is re-bound to the current native fixture on
 * every fresh Principal login. */
export async function isSharedDailySystemTestAdministrator(
  client: AsyncDatabaseClient,
  actor: { principalId: string; employeeId: string },
  environment: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const context = localEnvironment(environment);
  if (!context || actor.principalId !== SHARED_DAILY_SYSTEM_TEST_ADMIN.principalId ||
    actor.employeeId !== SHARED_DAILY_SYSTEM_TEST_ADMIN.employeeId) return false;
  const marker = await readMarker(context.root);
  if (!marker) return false;
  const rows = await client.query<TargetRow>(`
    SELECT current_database() AS database_name, current_user AS runtime_role,
      sandbox_id, generation::text, fixture_hash, target_fingerprint, status
    FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id='ai-pdm' AND sandbox_id=:sandboxId
  `, { sandboxId: SHARED_DAILY_SYSTEM_TEST_ADMIN.sandboxId });
  const row = rows.length === 1 ? rows[0] : null;
  if (!row || row.database_name !== marker.databaseName || row.runtime_role !== context.runtimeRole ||
    row.sandbox_id !== marker.sandboxId || row.generation !== marker.generation ||
    row.fixture_hash !== marker.fixtureHash || row.target_fingerprint !== marker.targetFingerprint ||
    row.status !== "ready") fail();
  return true;
}
