import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Provider = typeof import("./db-async-provider");
const loaded: Provider[] = [];
async function loadProvider() {
  vi.resetModules();
  const provider = await import("./db-async-provider");
  loaded.push(provider);
  return provider;
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
});
