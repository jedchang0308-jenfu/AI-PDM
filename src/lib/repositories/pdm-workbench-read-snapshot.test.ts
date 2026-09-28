import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";

describe("canonical workbench read snapshot", () => {
  it("reuses a verified Principal transaction without changing its isolation after admission reads", async () => {
    const pinned = {
      kind: "postgres",
      transactionScope: "postgres",
      queryOne: vi.fn().mockResolvedValue({ isolation_level: "repeatable read", read_only: "on" }),
      execute: vi.fn(),
      transaction: vi.fn()
    } as unknown as AsyncDatabaseClient;
    const read = vi.fn().mockResolvedValue("rows");

    await expect(withPdmWorkbenchReadSnapshot(pinned, read)).resolves.toBe("rows");
    expect(read).toHaveBeenCalledWith(pinned);
    expect(pinned.transaction).not.toHaveBeenCalled();
    expect(pinned.execute).not.toHaveBeenCalled();
  });

  it("rejects a pinned transaction that is not a read-only stable snapshot", async () => {
    const pinned = {
      kind: "postgres",
      transactionScope: "postgres",
      queryOne: vi.fn().mockResolvedValue({ isolation_level: "read committed", read_only: "off" })
    } as unknown as AsyncDatabaseClient;
    const read = vi.fn();

    await expect(withPdmWorkbenchReadSnapshot(pinned, read))
      .rejects.toThrow("PDM_WORKBENCH_READ_SNAPSHOT_REQUIRED");
    expect(read).not.toHaveBeenCalled();
  });

  it("opens a repeatable-read read-only transaction for standalone reads", async () => {
    const snapshot = { kind: "postgres", transactionScope: "postgres" } as AsyncDatabaseClient;
    const client = {
      kind: "postgres",
      transaction: vi.fn(async (read: (tx: AsyncDatabaseClient) => Promise<unknown>) => read(snapshot))
    } as unknown as AsyncDatabaseClient;
    const read = vi.fn().mockResolvedValue("rows");

    await expect(withPdmWorkbenchReadSnapshot(client, read)).resolves.toBe("rows");
    expect(client.transaction).toHaveBeenCalledWith(read,
      { isolationLevel: "repeatable_read", readOnly: true });
    expect(read).toHaveBeenCalledWith(snapshot);
  });
});
