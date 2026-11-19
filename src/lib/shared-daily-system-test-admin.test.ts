import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isSharedDailySystemTestAdministrator,
  requireSharedDailySystemTestAdminOperations,
  SHARED_DAILY_SYSTEM_TEST_ADMIN,
  SHARED_DAILY_SYSTEM_TEST_ADMIN_FILENAME,
} from "@/lib/shared-daily-system-test-admin";
import catalog from "../../config/access-control/jenfu-role-catalog.v7.json";

const roots: string[] = [];
const generation = "11111111-1111-4111-8111-111111111111";
const fixtureHash = "a".repeat(64);
const targetFingerprint = "b".repeat(64);

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "aipdm-shared-daily-admin-")));
  roots.push(root);
  await mkdir(path.join(root, "control"));
  const marker = { ...SHARED_DAILY_SYSTEM_TEST_ADMIN, generation, fixtureHash, targetFingerprint,
    createdAt: "2026-11-19T00:00:00.000Z", ...overrides };
  await writeFile(path.join(root, "control", SHARED_DAILY_SYSTEM_TEST_ADMIN_FILENAME), JSON.stringify(marker));
  const environment = { NODE_ENV: "development", JENFU_LOCAL_SANDBOX_ENABLED: "1",
    JENFU_LOCAL_SANDBOX_ID: "shared-daily", JENFU_LOCAL_SANDBOX_ROOT: root,
    JENFU_LOCAL_SANDBOX_ORIGIN: "http://localhost:1020",
    PDM_POSTGRES_URL: "postgresql://local_runtime:private@127.0.0.1:51870/jenfu_local_shared_daily" };
  const query = async () => [{ database_name: "jenfu_local_shared_daily", runtime_role: "local_runtime",
    sandbox_id: "shared-daily", generation, fixture_hash: fixtureHash,
    target_fingerprint: targetFingerprint, status: "ready" }];
  return { root, environment, client: { query } as never };
}

describe("shared-daily explicit system-test administrator", () => {
  it("binds the exact hidden system administrator profile with 66 unique permissions", () => {
    const role = catalog.roles.find(candidate => candidate.stableRoleId === "role-system-admin") as
      Parameters<typeof requireSharedDailySystemTestAdminOperations>[0] | undefined;
    expect(role).toBeDefined();
    const operations = requireSharedDailySystemTestAdminOperations(role!);
    expect(operations).toHaveLength(66);
    expect(new Set(operations.map(({ kind, code }) => `${kind}:${code}`)).size).toBe(66);
  });

  it("admits only the exact active Principal against the bound ready target", async () => {
    const f = await fixture();
    await expect(isSharedDailySystemTestAdministrator(f.client,
      { principalId: "local-active", employeeId: "employee-local-active" }, f.environment)).resolves.toBe(true);
    await expect(isSharedDailySystemTestAdministrator(f.client,
      { principalId: "local-other", employeeId: "employee-local-active" }, f.environment)).resolves.toBe(false);
  });

  it("does not activate outside the exact local shared-daily environment", async () => {
    const f = await fixture();
    await expect(isSharedDailySystemTestAdministrator(f.client,
      { principalId: "local-active", employeeId: "employee-local-active" },
      { ...f.environment, NODE_ENV: "production" })).resolves.toBe(false);
    await expect(isSharedDailySystemTestAdministrator(f.client,
      { principalId: "local-active", employeeId: "employee-local-active" },
      { ...f.environment, PDM_POSTGRES_URL: "postgresql://local_runtime:private@127.0.0.1:51870/other" })).resolves.toBe(false);
  });

  it("fails closed when the persisted marker and native target drift", async () => {
    const f = await fixture({ fixtureHash: "c".repeat(64) });
    await expect(isSharedDailySystemTestAdministrator(f.client,
      { principalId: "local-active", employeeId: "employee-local-active" }, f.environment))
      .rejects.toThrow("SHARED_DAILY_SYSTEM_TEST_ADMIN_PROFILE_INVALID");
  });
});
