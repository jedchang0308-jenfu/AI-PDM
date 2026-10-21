import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { ReviewPackageEnvelope, ReviewPackageRequestKind } from "@/lib/pdm-review-package-contract";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const mocks = vi.hoisted(() => ({ dynamic: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/principal-resource-capability", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/principal-resource-capability")>(),
  isDynamicRolePolicyInSnapshot: mocks.dynamic
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/pdm-review-package", () => ({
  verifyReviewPackageIntegrity: (value: unknown) => value
}));

import { requirePrincipalReviewResourceCapabilitiesInSnapshot,
  resolvePrincipalReviewResourceGroupsInSnapshot } from "@/lib/pdm-principal-review-resource";

const hash = "a".repeat(64);
const frozenFile = { id: "binding-one", bindingId: "binding-one",
  sourceFileAssetId: "asset-one", fileName: "part.sldprt", displayName: null,
  role: "original", mimeType: "application/octet-stream", fileSize: 10,
  contentHash: hash, isPrimary: true, currentRevisionUpload: true, ordinal: 0 };

type FixtureOptions = { entityType?: "drawing" | "part"; category?: string;
  linkedEntityId?: string; contentHash?: string | null; inactive?: boolean };

function input(options: FixtureOptions = {}) {
  const entityType = options.entityType ?? "drawing";
  const entityId = entityType === "drawing" ? "drawing-one" : "part-one";
  const requestKind: ReviewPackageRequestKind = entityType === "drawing" ? "drawing_revision" : "part_change";
  const workspace = entityType === "drawing"
    ? { kind: "drawing", entityId, revisionId: "revision-new", files: [frozenFile], attachments: [] }
    : { kind: "part", entityId, revisionId: null, files: [], attachments: [{ ...frozenFile,
      id: "asset-one", bindingId: "asset-one", sourceFileAssetId: "asset-one" }] };
  const envelope = { requestKind, primaryTargetKey: `${entityType}:${entityId}`,
    packageHash: "package-hash", targets: [{ targetKey: `${entityType}:${entityId}`,
      scope: "submitted", markers: { submitted: true }, workspace }] } as unknown as ReviewPackageEnvelope;
  const canonical = entityType === "drawing"
    ? { id: "binding-one", binding_id: "binding-one", source_file_asset_id: "asset-one",
      content_hash: options.contentHash === undefined ? hash : options.contentHash, binding_content_hash: hash,
      hash_algorithm: "SHA-256", linked_entity_type: "drawing_revision",
      linked_entity_id: options.linkedEntityId ?? "revision-source",
      binding_entity_id: "revision-source", parent_entity_id: entityId,
      document_category: options.category ?? "cad_3d", inactive: options.inactive ?? false }
    : { id: "asset-one", binding_id: "asset-one", source_file_asset_id: "asset-one",
      content_hash: options.contentHash === undefined ? hash : options.contentHash, hash_algorithm: "SHA-256",
      linked_entity_type: "part_number", linked_entity_id: entityId,
      binding_entity_id: entityId, parent_entity_id: entityId,
      document_category: options.category ?? "spec_sheet", inactive: options.inactive ?? false };
  const tx = { kind: "postgres", transactionScope: "postgres",
    query: vi.fn(async () => [canonical]) } as unknown as AsyncDatabaseClient;
  return { tx, canonical, verified: { session: { principalId: "reviewer-one" } } as VerifiedPrincipalRequest,
    reviewInput: { companyId: "company-one", requestKind, entityType, entityId,
      workId: entityType === "drawing" ? "work-one" : "part-work-one", envelope } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dynamic.mockResolvedValue(true);
  mocks.evaluate.mockImplementation(async (_tx, verified, permissions) => permissions.map((permission: { permissionCode: string }) => ({
    allowed: true, principalId: verified.session.principalId,
    permissionCode: permission.permissionCode
  })));
});

describe("canonical Principal review resources", () => {
  it("derives drawing plus model from a valid CAD attachment even when it references the source revision", async () => {
    const fixture = input();
    await expect(resolvePrincipalReviewResourceGroupsInSnapshot(fixture.tx, fixture.reviewInput))
      .resolves.toEqual(["drawing", "model"]);
    expect(fixture.tx.query).toHaveBeenCalledWith(expect.stringContaining(
      "file.drawing_revision_id AS binding_entity_id"), expect.objectContaining({
      companyId: "company-one", entityId: "drawing-one", revisionId: "revision-new",
      workId: "work-one"
    }));
  });

  it("requires only the parent review action for a canonical non-CAD attachment", async () => {
    const fixture = input({ entityType: "part", category: "spec_sheet" });
    await expect(resolvePrincipalReviewResourceGroupsInSnapshot(fixture.tx, fixture.reviewInput))
      .resolves.toEqual(["part"]);
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      fixture.tx, fixture.verified, fixture.reviewInput)).resolves.toEqual(["part"]);
    expect(mocks.evaluate).toHaveBeenCalledWith(fixture.tx, fixture.verified, [
      { permissionKind: "action", permissionCode: "approval.request.decide", resourceGroup: "part" }
    ]);
  });

  it.each([
    ["unknown category", { category: "invented_category" }],
    ["missing hash", { contentHash: null }],
    ["hash mismatch", { contentHash: "b".repeat(64) }],
    ["wrong source revision link", { linkedEntityId: "other-revision" }]
  ])("rejects an unverifiable submitted attachment (%s)", async (_label, overrides) => {
    const fixture = input(overrides as FixtureOptions);
    await expect(resolvePrincipalReviewResourceGroupsInSnapshot(fixture.tx, fixture.reviewInput))
      .rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ["hash drift", { contentHash: "b".repeat(64) }],
    ["soft delete", { inactive: true }]
  ])("allows a reviewer to return a changed attachment for correction (%s), while approve stays blocked", async (_label, overrides) => {
    const fixture = input(overrides as FixtureOptions);
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      fixture.tx, fixture.verified, fixture.reviewInput, { strictSnapshot: false }
    )).resolves.toEqual(["drawing", "model"]);
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      fixture.tx, fixture.verified, fixture.reviewInput
    )).rejects.toMatchObject({ status: 409 });
    expect(fixture.tx.query).toHaveBeenNthCalledWith(1, expect.any(String),
      expect.objectContaining({ includeInactive: true }));
    expect(fixture.tx.query).toHaveBeenNthCalledWith(2, expect.any(String),
      expect.objectContaining({ includeInactive: false }));
  });

  it("still requires model review to return a drifted CAD attachment", async () => {
    const fixture = input({ contentHash: "b".repeat(64) });
    mocks.evaluate.mockImplementation(async (_tx, verified, permissions) => permissions.map((permission: { permissionCode: string }) => ({
      allowed: permission.permissionCode !== "pdm.model.review",
      principalId: verified.session.principalId, permissionCode: permission.permissionCode
    })));
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      fixture.tx, fixture.verified, fixture.reviewInput, { strictSnapshot: false }
    )).rejects.toMatchObject({ status: 403 });
  });

  it("ignores old inactive files outside the submitted package but counts active CAD additions", async () => {
    const oldDeleted = {
      id: "old-deleted", binding_id: "old-deleted", source_file_asset_id: "old-deleted-asset",
      content_hash: hash, binding_content_hash: hash, hash_algorithm: "SHA-256",
      linked_entity_type: "drawing_revision", linked_entity_id: "revision-source",
      binding_entity_id: "revision-source", parent_entity_id: "drawing-one",
      document_category: "cad_3d", inactive: true
    };
    const nonCadFixture = input({ category: "pdf" });
    vi.mocked(nonCadFixture.tx.query).mockResolvedValue([nonCadFixture.canonical, oldDeleted]);
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      nonCadFixture.tx, nonCadFixture.verified, nonCadFixture.reviewInput, { strictSnapshot: false }
    )).resolves.toEqual(["drawing"]);

    const activeAddition = { ...oldDeleted, id: "new-active", binding_id: "new-active",
      source_file_asset_id: "new-active-asset", inactive: false };
    const additionFixture = input({ category: "pdf" });
    vi.mocked(additionFixture.tx.query).mockResolvedValue([additionFixture.canonical, activeAddition]);
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      additionFixture.tx, additionFixture.verified, additionFixture.reviewInput,
      { strictSnapshot: false }
    )).resolves.toEqual(["drawing", "model"]);
  });

  it("requires a PostgreSQL transaction snapshot for capability classification", async () => {
    const fixture = input();
    const nonSnapshot: AsyncDatabaseClient = { ...fixture.tx, transactionScope: undefined };
    await expect(resolvePrincipalReviewResourceGroupsInSnapshot(nonSnapshot, fixture.reviewInput))
      .rejects.toThrow("PRINCIPAL_REVIEW_RESOURCE_SNAPSHOT_REQUIRED");
  });

  it.each([
    ["parent denial", "approval.request.decide"],
    ["model denial", "pdm.model.review"]
  ])("requires parent and model approval together (%s)", async (_label, deniedPermission) => {
    const fixture = input();
    mocks.evaluate.mockImplementation(async (_tx, verified, permissions) => permissions.map((permission: { permissionCode: string }) => ({
      allowed: permission.permissionCode !== deniedPermission,
      principalId: verified.session.principalId, permissionCode: permission.permissionCode
    })));
    await expect(requirePrincipalReviewResourceCapabilitiesInSnapshot(
      fixture.tx, fixture.verified, fixture.reviewInput)).rejects.toMatchObject({ status: 403 });
    expect(mocks.evaluate).toHaveBeenCalledWith(fixture.tx, fixture.verified, [
      { permissionKind: "action", permissionCode: "approval.request.decide", resourceGroup: "drawing" },
      { permissionKind: "action", permissionCode: "pdm.model.review", resourceGroup: "model" }
    ]);
  });
});
