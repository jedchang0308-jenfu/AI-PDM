import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

const mocks = vi.hoisted(() => ({
  database: { kind: "postgres" },
  package: vi.fn(),
  model: vi.fn(),
  upsertBasis: vi.fn(),
  owner: vi.fn(),
  requiredDrawings: vi.fn(),
  releasedPackages: vi.fn(),
  insertBaseline: vi.fn(),
  baseline: vi.fn(),
  baselineItems: vi.fn(),
  releaseWithAudit: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => mocks.database }));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.audit }));
vi.mock("@/lib/repositories/shared-3d-baseline-async-repository", () => ({
  AsyncShared3dBaselineRepository: class {
    constructor(readonly client: unknown) {}
    getDrawingPackage(id: string) { return mocks.package(this.client, id); }
    getSharedModelById(id: string) { return mocks.model(this.client, id); }
    upsertPackageModelBasis(input: unknown) { return mocks.upsertBasis(this.client, input); }
    getOwnerByPartNumber(code: string, companyId?: string | null) {
      return mocks.owner(this.client, code, companyId);
    }
    getOwnerByRootCode(code: string, companyId?: string | null) {
      return mocks.owner(this.client, code, companyId);
    }
    listRequiredMaDrawings(owner: unknown) { return mocks.requiredDrawings(this.client, owner); }
    listReleasedPackagesForDrawings(companyId: string, ids: string[]) {
      return mocks.releasedPackages(this.client, companyId, ids);
    }
    insertManufacturingBaseline(baseline: unknown, items: unknown[]) {
      return mocks.insertBaseline(this.client, baseline, items);
    }
    getManufacturingBaseline(id: string) { return mocks.baseline(this.client, id); }
    listManufacturingBaselineItems(id: string) { return mocks.baselineItems(this.client, id); }
    releaseManufacturingBaselineWithAudit(input: unknown) {
      return mocks.releaseWithAudit(this.client, input);
    }
  }
}));

import {
  createManufacturingBaselineDraftAsync,
  releaseManufacturingBaselineAsync,
  setDrawingPackageModelBasisAsync
} from "@/lib/shared-3d-baseline";

const snapshot = { kind: "postgres", transactionScope: "postgres" } as AsyncDatabaseClient;
const principalOptions = {
  client: snapshot,
  companyId: "company-jenfu",
  principalAudit: { principalId: "principal-one", companyId: "company-jenfu" }
};
const owner = {
  companyId: "company-jenfu",
  ownerScope: "part_number" as const,
  ownerId: "part-one",
  partRootId: "root-one",
  partNumberId: "part-one",
  ownerCode: "PN-001"
};
const model = {
  id: "model-one",
  companyId: "company-jenfu",
  ownerScope: "part_number" as const,
  ownerId: "part-one",
  partRootId: "root-one",
  partNumberId: "part-one",
  sourceFileAssetId: "asset-one",
  modelRevision: "R1",
  contentHash: "hash-one",
  hashAlgorithm: "SHA-256",
  status: "Released" as const,
  createdBy: "profile-one",
  createdAt: "2026-10-25T00:00:00.000Z",
  releasedBy: "profile-one",
  releasedAt: "2026-10-25T00:00:00.000Z",
  releaseReason: null
};

describe("shared 3D Principal mutation domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.package.mockResolvedValue({
      id: "pkg-one", companyId: "company-jenfu", drawingNumberId: "drawing-one",
      drawingNumber: "D-1-MA1", drawingPurposeCode: "MA", drawingPartRootId: "root-one",
      revision: "1", status: "Draft"
    });
    mocks.model.mockResolvedValue(model);
    mocks.upsertBasis.mockResolvedValue(undefined);
    mocks.owner.mockResolvedValue(owner);
    mocks.requiredDrawings.mockResolvedValue([{
      id: "drawing-one", companyId: "company-jenfu", partRootId: "root-one",
      drawingNumber: "D-1-MA1", purposeCode: "MA", recordStatus: "Released"
    }]);
    mocks.releasedPackages.mockResolvedValue([{
      id: "pkg-one", companyId: "company-jenfu", drawingNumberId: "drawing-one",
      drawingNumber: "D-1-MA1", revision: "1", releasedAt: "2026-10-25T00:00:00.000Z"
    }]);
    mocks.insertBaseline.mockResolvedValue(undefined);
    mocks.baseline.mockResolvedValue({
      id: "baseline-one", companyId: "company-jenfu", ownerScope: "part_number",
      ownerId: "part-one", partRootId: "root-one", partNumberId: "part-one",
      baselineCode: "PN-001-MB-1", baselineRevision: "1", sharedModelVersionId: "model-one",
      status: "Draft", createdBy: "profile-one", createdAt: "2026-10-25T00:00:00.000Z",
      releasedBy: null, releasedAt: null, snapshotJson: "{}"
    });
    mocks.baselineItems.mockResolvedValue([{
      id: "item-one", baselineId: "baseline-one", drawingNumberId: "drawing-one",
      drawingNumber: "D-1-MA1", packageId: "pkg-one", packageRevision: "1",
      inclusionStatus: "included", selectionReason: null, reviewStatus: "approved",
      createdAt: "2026-10-25T00:00:00.000Z"
    }]);
    mocks.releaseWithAudit.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("writes model basis and Principal audit through the supplied transaction snapshot", async () => {
    const result = await setDrawingPackageModelBasisAsync({
      packageId: "pkg-one", actorId: "profile-one", sharedModelVersionId: "model-one"
    }, principalOptions);

    expect(result.sharedModelVersionId).toBe("model-one");
    expect(mocks.package).toHaveBeenCalledWith(snapshot, "pkg-one");
    expect(mocks.upsertBasis).toHaveBeenCalledWith(snapshot, expect.objectContaining({
      packageId: "pkg-one", createdBy: "profile-one"
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "DrawingPackageModelBasisSet", actorId: "profile-one",
      companyId: "company-jenfu", scopeKind: "tenant",
      detail: expect.objectContaining({
        securityActor: { kind: "verified_principal", principalId: "principal-one" }
      })
    }), snapshot);
  });

  it("rejects a package from another company before any mutation", async () => {
    mocks.package.mockResolvedValue({
      id: "pkg-foreign", companyId: "company-other", drawingPartRootId: "root-one"
    });

    await expect(setDrawingPackageModelBasisAsync({
      packageId: "pkg-foreign", actorId: "profile-one", sharedModelVersionId: "model-one"
    }, principalOptions)).rejects.toMatchObject({ code: "DRAWING_PACKAGE_COMPANY_MISMATCH", status: 403 });
    expect(mocks.upsertBasis).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("creates the baseline and its audit from the verified company snapshot", async () => {
    const result = await createManufacturingBaselineDraftAsync({
      ownerScope: "part_number", ownerCode: "PN-001", sharedModelVersionId: "model-one",
      baselineRevision: "1", actorId: "profile-one"
    }, principalOptions);

    expect(result.baseline.companyId).toBe("company-jenfu");
    expect(mocks.owner).toHaveBeenCalledWith(snapshot, "PN-001", "company-jenfu");
    expect(mocks.insertBaseline).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", createdBy: "profile-one" }),
      expect.any(Array));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "ManufacturingBaselineDraftCreated", actorId: "profile-one",
      companyId: "company-jenfu", scopeKind: "tenant",
      detail: expect.objectContaining({
        securityActor: { kind: "verified_principal", principalId: "principal-one" }
      })
    }), snapshot);
  });

  it("releases with the Principal-bound audit inside the supplied transaction", async () => {
    await releaseManufacturingBaselineAsync({
      baselineId: "baseline-one", actorId: "profile-one"
    }, principalOptions);

    expect(mocks.releaseWithAudit).toHaveBeenCalledWith(snapshot, expect.objectContaining({
      baselineId: "baseline-one",
      audit: expect.objectContaining({
        action: "ManufacturingBaselineReleased", actorId: "profile-one",
        companyId: "company-jenfu", scopeKind: "tenant",
        detail: expect.objectContaining({
          securityActor: { kind: "verified_principal", principalId: "principal-one" }
        })
      })
    }));
  });

  it("rejects a foreign baseline before reading its model or items", async () => {
    mocks.baseline.mockResolvedValue({
      id: "baseline-foreign", companyId: "company-other", status: "Draft",
      sharedModelVersionId: "model-one"
    });

    await expect(releaseManufacturingBaselineAsync({
      baselineId: "baseline-foreign", actorId: "profile-one"
    }, principalOptions)).rejects.toMatchObject({ code: "BASELINE_COMPANY_MISMATCH", status: 403 });
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.baselineItems).not.toHaveBeenCalled();
    expect(mocks.releaseWithAudit).not.toHaveBeenCalled();
  });

  it("rejects a released model from another company or part root", async () => {
    mocks.model.mockResolvedValue({ ...model, companyId: "company-other", partRootId: "root-other" });

    await expect(releaseManufacturingBaselineAsync({
      baselineId: "baseline-one", actorId: "profile-one"
    }, principalOptions)).rejects.toMatchObject({ code: "BASELINE_SHARED_MODEL_INVALID", status: 409 });
    expect(mocks.baselineItems).not.toHaveBeenCalled();
    expect(mocks.releaseWithAudit).not.toHaveBeenCalled();
  });

});
