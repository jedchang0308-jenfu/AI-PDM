import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Provider = typeof import("./db-async-provider");
const loaded: Provider[] = [];
async function loadProvider() {
  vi.resetModules();
  const provider = await import("./db-async-provider");
  loaded.push(provider);
  return provider;
}

function cloudSqlEnvironment() {
  vi.stubEnv("PDM_DB_PROVIDER", "cloud_sql_postgres");
  for (const name of ["PDM_POSTGRES_URL", "PDM_POSTGRES_ADMIN_URL", "PDM_CLOUD_SQL_PASSWORD", "GOOGLE_APPLICATION_CREDENTIALS", "DEV010_N1C_TARGET_GUARD"]) vi.stubEnv(name, "");
  vi.stubEnv("PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME", "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg");
  vi.stubEnv("PDM_CLOUD_SQL_DATABASE", "jenfu_stg");
  vi.stubEnv("PDM_CLOUD_SQL_USER", "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam");
}

beforeEach(() => {
  vi.stubEnv("PDM_DB_PROVIDER", "postgres");
  // Pool construction is lazy: these tests never connect to a database.
  vi.stubEnv("PDM_POSTGRES_URL", "postgresql://runtime@127.0.0.1:1/test_pool_a");
  vi.stubEnv("PDM_POSTGRES_MAX_CONNECTIONS", "2");
});
afterEach(async () => {
  await Promise.all(loaded.splice(0).map(provider => provider.closeAsyncDatabaseClient()));
  vi.unstubAllEnvs();
});

describe("PostgreSQL runtime process ownership", () => {
  it("keeps all Cloud SQL timeout profiles distinct across module reloads", async () => {
    cloudSqlEnvironment();
    let previous = (await loadProvider()).getAsyncDatabaseClient();
    for (const name of ["PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS", "PDM_CLOUD_SQL_IDLE_TIMEOUT_MS", "PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS", "PDM_CLOUD_SQL_QUERY_TIMEOUT_MS"]) {
      vi.stubEnv(name, "11000");
      const current = (await loadProvider()).getAsyncDatabaseClient();
      expect(current).not.toBe(previous);
      previous = current;
    }
  });

  it("revalidates Cloud SQL secret restrictions before reusing a cached client", async () => {
    cloudSqlEnvironment();
    const provider = await loadProvider();
    provider.getAsyncDatabaseClient();
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "C:/unused-test-credential.json");
    expect(() => provider.getAsyncDatabaseClient()).toThrow("CLOUD_SQL_SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
  });

  it("reuses one client across independently evaluated route modules and replaces it after close", async () => {
    const firstModule = await loadProvider();
    const first = firstModule.getAsyncDatabaseClient();
    const secondModule = await loadProvider();
    expect(secondModule.getAsyncDatabaseClient()).toBe(first);
    await firstModule.closeAsyncDatabaseClient();
    expect(secondModule.getAsyncDatabaseClient()).not.toBe(first);
  });

  it("keeps distinct target configurations separate and closes each shared client once", async () => {
    const firstModule = await loadProvider();
    const first = firstModule.getAsyncDatabaseClient();
    vi.stubEnv("PDM_POSTGRES_URL", "postgresql://runtime@127.0.0.1:1/test_pool_b");
    const secondModule = await loadProvider();
    const second = secondModule.getAsyncDatabaseClient();
    expect(second).not.toBe(first);
    vi.stubEnv("PDM_POSTGRES_URL", "postgresql://runtime@127.0.0.1:1/test_pool_a");
    expect(secondModule.getAsyncDatabaseClient()).toBe(first);
    const closeFirst = vi.spyOn(first, "close");
    const closeSecond = vi.spyOn(second, "close");
    await Promise.all([firstModule.closeAsyncDatabaseClient(), secondModule.closeAsyncDatabaseClient()]);
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it("does not clear a replacement client when an earlier pool finishes draining", async () => {
    const firstModule = await loadProvider();
    const first = firstModule.getAsyncDatabaseClient();
    const originalClose = first.close.bind(first);
    let finishDrain!: () => void;
    const draining = new Promise<void>(resolve => { finishDrain = resolve; });
    vi.spyOn(first, "close").mockReturnValue(draining);
    const closing = firstModule.closeAsyncDatabaseClient();
    const secondModule = await loadProvider();
    const replacement = secondModule.getAsyncDatabaseClient();
    expect(replacement).not.toBe(first);
    finishDrain();
    await closing;
    expect(secondModule.getAsyncDatabaseClient()).toBe(replacement);
    await originalClose();
  });

  it("makes another module's close wait for an in-flight drain", async () => {
    const firstModule = await loadProvider();
    const first = firstModule.getAsyncDatabaseClient();
    const originalClose = first.close.bind(first);
    let finishDrain!: () => void;
    vi.spyOn(first, "close").mockReturnValue(new Promise<void>(resolve => { finishDrain = resolve; }));
    const closing = firstModule.closeAsyncDatabaseClient();
    const secondModule = await loadProvider();
    let secondFinished = false;
    const secondClosing = secondModule.closeAsyncDatabaseClient().then(() => { secondFinished = true; });
    await Promise.resolve();
    expect(secondFinished).toBe(false);
    finishDrain();
    await Promise.all([closing, secondClosing]);
    expect(secondFinished).toBe(true);
    await originalClose();
  });

  it("waits for every pool to settle before reporting a close failure", async () => {
    const provider = await loadProvider();
    const first = provider.getAsyncDatabaseClient();
    vi.stubEnv("PDM_POSTGRES_URL", "postgresql://runtime@127.0.0.1:1/test_pool_b");
    const second = provider.getAsyncDatabaseClient();
    const originals = [first.close.bind(first), second.close.bind(second)];
    const failure = new Error("POOL_CLOSE_FAILURE");
    vi.spyOn(first, "close").mockRejectedValue(failure);
    let finishDrain!: () => void;
    vi.spyOn(second, "close").mockReturnValue(new Promise<void>(resolve => { finishDrain = resolve; }));
    let finished = false;
    const closing = provider.closeAsyncDatabaseClient().catch(error => { finished = true; return error; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(finished).toBe(false);
    const otherClosing = (await loadProvider()).closeAsyncDatabaseClient().catch(error => error);
    finishDrain();
    expect(await closing).toBe(failure);
    expect(await otherClosing).toBe(failure);
    await Promise.all(originals.map(close => close()));
  });
});
