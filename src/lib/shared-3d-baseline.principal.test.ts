import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

const mocks = vi.hoisted(() => ({
  database: { kind: "postgres" },
  owner: vi.fn(),
  file: vi.fn(),
  byHash: vi.fn(),
  byRevision: vi.fn(),
  insert: vi.fn(),
  list: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => mocks.database }));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.audit }));
vi.mock("@/lib/repositories/shared-3d-baseline-async-repository", () => ({
  AsyncShared3dBaselineRepository: class {
    constructor(readonly client: unknown) {}
    getOwnerByPartNumber(...args: unknown[]) { return mocks.owner(...args); }
    getOwnerByRootCode(...args: unknown[]) { return mocks.owner(...args); }
    getFileAsset(...args: unknown[]) { return mocks.file(...args); }
    listSharedModels(...args: unknown[]) { return mocks.list(...args); }
    findSharedModelsByHash(...args: unknown[]) { return mocks.byHash(...args); }
    findSharedModelsByRevision(...args: unknown[]) { return mocks.byRevision(...args); }
    insertSharedModel(...args: unknown[]) { return mocks.insert(...args); }
  }
}));

import {
  createSharedModelVersionAsync,
  listSharedModelVersionsAsync
} from "@/lib/shared-3d-baseline";

const owner = {
  companyId: "company-jenfu",
  ownerScope: "part_number" as const,
  ownerId: "part-number-one",
  partRootId: "part-root-one",
  partNumberId: "part-number-one",
  ownerCode: "PN-001"
};

const source = {
  id: "asset-one",
  linkedEntityType: "part_number",
  linkedEntityId: "part-number-one",
  documentCategory: "cad_3d",
  fileName: "model.step",
  contentHash: "hash-one",
  hashAlgorithm: "SHA-256"
};

const asClient = (value: unknown) => value as AsyncDatabaseClient;

describe("shared model principal snapshot domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue(owner);
    mocks.file.mockResolvedValue(source);
    mocks.byHash.mockResolvedValue([]);
    mocks.byRevision.mockResolvedValue([]);
    mocks.insert.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([]);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("uses the supplied transaction snapshot and server company for list", async () => {
    const snapshot = asClient({ kind: "postgres", id: "same-snapshot" });
    mocks.list.mockResolvedValue([{ id: "model-one" }]);

    const result = await listSharedModelVersionsAsync(
      { ownerScope: "part_number", ownerCode: "PN-001" },
      { client: snapshot, companyId: "company-jenfu" }
    );

    expect(result.models).toEqual([{ id: "model-one" }]);
    expect(mocks.owner).toHaveBeenCalledWith("PN-001", "company-jenfu");
  });

  it("rejects a source asset linked to another part before any model or audit write", async () => {
    mocks.file.mockResolvedValue({ ...source, linkedEntityId: "part-number-other" });

    await expect(createSharedModelVersionAsync({
      ownerScope: "part_number",
      ownerCode: "PN-001",
      sourceFileAssetId: "asset-one",
      modelRevision: "R1",
      actorId: "pdm-user-one",
      status: "Draft"
    }, { client: asClient({ kind: "postgres" }), companyId: "company-jenfu" }))
      .rejects.toMatchObject({ code: "SHARED_MODEL_SOURCE_OWNER_MISMATCH", status: 409, details: undefined });
    expect(mocks.byHash).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("inserts and audits a principal create on the same transaction client", async () => {
    const snapshot = asClient({ kind: "postgres", id: "same-snapshot" });
    const beforeNewRelease = vi.fn().mockResolvedValue(undefined);
    const result = await createSharedModelVersionAsync({
      ownerScope: "part_number",
      ownerCode: "PN-001",
      sourceFileAssetId: "asset-one",
      modelRevision: "R1",
      actorId: "pdm-user-one",
      status: "Released"
    }, {
      client: snapshot,
      companyId: "company-jenfu",
      principalAudit: { principalId: "principal-one", companyId: "company-jenfu" },
      beforeNewRelease
    });

    expect(result.reused).toBe(false);
    expect(beforeNewRelease).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu",
      ownerId: "part-number-one",
      sourceFileAssetId: "asset-one",
      status: "Released"
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "SharedCadModelVersionCreated",
      actorId: "pdm-user-one",
      companyId: "company-jenfu",
      scopeKind: "tenant",
      detail: expect.objectContaining({
        securityActor: { kind: "verified_principal", principalId: "principal-one" }
      })
    }), snapshot);
  });

  it("audits a same-hash retry without creating a duplicate model", async () => {
    mocks.byHash.mockResolvedValue([{
      id: "model-one", modelRevision: "R1", contentHash: "hash-one", status: "Released"
    }]);
    const snapshot = asClient({ kind: "postgres", id: "same-snapshot" });
    const beforeNewRelease = vi.fn().mockResolvedValue(undefined);

    const result = await createSharedModelVersionAsync({
      ownerScope: "part_number", ownerCode: "PN-001", sourceFileAssetId: "asset-one",
      modelRevision: "R1", actorId: "pdm-user-one", status: "Released"
    }, {
      client: snapshot,
      companyId: "company-jenfu",
      principalAudit: { principalId: "principal-one", companyId: "company-jenfu" },
      beforeNewRelease
    });

    expect(result.reused).toBe(true);
    expect(beforeNewRelease).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SharedCadModelVersionReused" }), snapshot);
  });
});
