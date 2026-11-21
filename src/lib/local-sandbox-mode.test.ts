import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLocalSandboxPrincipalRuntime } from "./local-sandbox-principal-runtime";

const boundary = vi.hoisted(() => ({ listener: vi.fn(), database: vi.fn() }));
vi.mock("./auth/local-sandbox-listener.mjs", () => ({ createLocalListenerVerifier: () => boundary.listener }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: boundary.database }));
afterEach(() => vi.clearAllMocks());

it.each(["integrated", "standalone"] as const)("loads a fixed shared-daily profile in %s mode before listener and database access", async mode => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pdm-mode-profile-"));
  try {
    await mkdir(path.join(root, "control"));
    const databaseUrl = "postgresql://local_runtime:fake_local_password@127.0.0.1:51870/jenfu_local_shared_daily";
    const profile = { profileVersion: "ai-pdm.local-runtime.v1", applicationId: "ai-pdm", sandboxId: "shared-daily",
      origin: "http://localhost:1020", platformOrigin: "http://localhost:1000", bindHost: "127.0.0.1",
      databaseUrl, runtimeRole: "local_runtime", sandboxRoot: root, dataDirectory: path.join(root, "data"),
      repositoryDirectory: path.join(root, "repository"), fixture: { version: "fixture.v1", hash: "b".repeat(64), path: path.join(root, "control", "fixtures.json") },
      nativeSessionContractVersion: "jenfu.ai-pdm-session.v2", platformClient: { clientId: "ai-pdm", key: Buffer.alloc(32, 17).toString("base64url") },
      principalSessionKey: { keyId: "local", secret: Buffer.alloc(32, 29).toString("base64url") },
      catalogBindings: [{ catalogVersion: "local.v1", catalogSha256: "c".repeat(64), stableRoleId: "rd", roleDefinitionHash: "d".repeat(64), companyId: "jenfu", scopeKind: "workspace", scopeRef: "jenfu" }] };
    await writeFile(path.join(root, "control", "ai-pdm-runtime.json"), JSON.stringify(profile));
    const environment = { NODE_ENV: "development", PDM_AUTH_MODE: "firebase_bff", PDM_JENFU_PLATFORM_AUTH_MODE: "on",
      PDM_JENFU_ENTITLEMENT_MODE: "enforce", PDM_LOCAL_PRINCIPAL_SANDBOX: "1", JENFU_LOCAL_SANDBOX_ENABLED: "1",
      JENFU_LOCAL_SANDBOX_MODE: mode, JENFU_LOCAL_SANDBOX_ID: "shared-daily", JENFU_LOCAL_SANDBOX_BIND_HOST: "127.0.0.1",
      JENFU_LOCAL_SANDBOX_ORIGIN: `http://localhost:${mode === "standalone" ? 1021 : 1020}`,
      JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: `http://localhost:${mode === "standalone" ? 1001 : 1000}`,
      JENFU_LOCAL_SANDBOX_DATABASE_URL: databaseUrl, JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: "local_runtime", JENFU_LOCAL_SANDBOX_ROOT: root,
      PDM_DB_PROVIDER: "postgres", PDM_POSTGRES_URL: databaseUrl, PDM_DATA_DIR: profile.dataDirectory, PDM_REPOSITORY_DIR: profile.repositoryDirectory };
    // Stop at the verified listener boundary; this fixture never connects to PostgreSQL.
    boundary.listener.mockRejectedValueOnce(new Error("TEST_LISTENER_BOUNDARY"));
    await expect(getLocalSandboxPrincipalRuntime(environment)).rejects.toThrow("TEST_LISTENER_BOUNDARY");
    expect(boundary.listener).toHaveBeenCalledWith(expect.objectContaining({ mode, origin: environment.JENFU_LOCAL_SANDBOX_ORIGIN,
      platformOrigin: environment.JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN }));
    expect(boundary.database).not.toHaveBeenCalled();
  } finally {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("pdm-mode-profile-")) throw new Error("TEST_CLEANUP_TARGET_INVALID");
    await rm(root, { recursive: true, force: true });
  }
});
