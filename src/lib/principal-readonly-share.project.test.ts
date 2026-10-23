import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getShare: vi.fn(), record: vi.fn(), getSubmission: vi.fn(), authorize: vi.fn(), catalog: vi.fn(), permissions: vi.fn() }));
vi.mock("@/lib/repositories/release-async-repository", () => ({
  AsyncReleaseRepository: class {
    getReadonlyShareByTokenHash = mocks.getShare
    recordReadonlyShareAccess = mocks.record
  }
}));
vi.mock("@/lib/repositories/submission-list-async-repository", () => ({
  AsyncSubmissionListRepository: class { getSubmission = mocks.getSubmission }
}));
vi.mock("@/lib/principal-submission-access", () => ({
  authorizePrincipalSubmissionReadInSnapshot: mocks.authorize
}));
vi.mock("@/lib/readonly-share-async", () => ({ hashShareTokenAsync: () => "hash" }));
vi.mock('@/lib/principal-submission-file-capability', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/principal-submission-file-capability')>(),
  authorizeSubmissionOriginalsInSnapshot: vi.fn(async () => null)
}));

vi.mock("@/lib/jenfu-principal-role-catalog", () => ({ requirePublishedPrincipalCatalog: mocks.catalog }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalResourcePermissionsInSnapshot: mocks.permissions,
  evaluatePrincipalWorkspacePermissionsInSnapshot: vi.fn()
}));
import { getAuthorizedPublicShareInSnapshot } from "@/lib/principal-readonly-share";

describe("DEV-123 readonly share project binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({ catalogVersion: "ai-pdm.role-policy.10000000-0000-4000-8000-000000000001" });
    mocks.permissions.mockResolvedValue([{ allowed: false }]);
    mocks.getShare.mockResolvedValue({ id: "share-one", submission_id: "submission-one",
      project_scope_key: "P-001", status: "active" });
    mocks.authorize.mockResolvedValue({ company_id: "company-jenfu", submitted_by: "owner", project_code: "P-001" });
    mocks.getSubmission.mockResolvedValue({ id: "submission-one", company_id: "company-jenfu",
      project_code: "P-001", status: "Released", release_package: { id: "package-one" } });
  });

  it("allows only an exact non-null server-owned project binding", async () => {
    const result = await getAuthorizedPublicShareInSnapshot({} as never, {} as never, "A".repeat(24));
    expect(result).not.toBeInstanceOf(Response);
    expect(mocks.record).toHaveBeenCalledWith({ shareId: "share-one", submissionId: "submission-one" });
  });

  it('freezes the verified external project delivery context without exposing another assignment or package', async () => {
    const verified = { profile: { companyId: 'company-jenfu' }, session: { principalId: 'principal-one' } } as never;
    mocks.authorize.mockResolvedValue({ company_id: 'company-jenfu', project_code: 'P-001', externalAssignmentId: 'assignment-one' });
    mocks.getSubmission.mockResolvedValue({ id: 'submission-one', company_id: 'company-jenfu', status: 'Released',
      files: [{ id: 'file-one', sha256: 'b'.repeat(64), file_role: 'pdf' }],
      release_package: { id: 'package-one', submission_id: 'submission-one', sha256: 'a'.repeat(64),
        manifest_json: { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' },
          files: [{ id: 'file-one', sha256: 'b'.repeat(64), file_role: 'pdf' }] } } });
    const snapshot = { queryOne: vi.fn(async () => ({ decision_at: '2026-10-21T00:00:00Z' })) } as never;
    const result = await getAuthorizedPublicShareInSnapshot(snapshot, verified, 'A'.repeat(24));
    expect(result).toMatchObject({ externalProjectContext: { principalId: 'principal-one', companyId: 'company-jenfu',
      originalAssignmentId: 'assignment-one', projectScopeKey: 'P-001', shareId: 'share-one', submissionId: 'submission-one',
      releasePackageId: 'package-one', releasePackageSha256: 'a'.repeat(64), decisionAt: '2026-10-21T00:00:00Z' } });
  });

  it('rejects external metadata from files outside the delivered manifest', async () => {
    mocks.authorize.mockResolvedValue({ company_id: 'company-jenfu', project_code: 'P-001', externalAssignmentId: 'assignment-one' });
    mocks.getSubmission.mockResolvedValue({ id: 'submission-one', company_id: 'company-jenfu', status: 'Released',
      files: [{ id: 'not-delivered', sha256: 'b'.repeat(64), file_role: 'pdf' }],
      release_package: { id: 'package-one', manifest_json: { schema: 'ai-pdm-release-package.v1',
        submission: { id: 'submission-one' }, files: [] } } });
    const result = await getAuthorizedPublicShareInSnapshot({} as never, {} as never, 'A'.repeat(24));
    expect((result as Response).status).toBe(503);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("requires independent dynamic download permission before recording or returning a package", async () => {
    const verified = { profile: { companyId: "company-jenfu" }, session: { principalId: "principal-one" } } as never;
    const denied = await getAuthorizedPublicShareInSnapshot({} as never, verified, "A".repeat(24), { download: true });
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
    mocks.permissions.mockResolvedValue([{ allowed: true, permissionCode: "pdm.transfer.download", principalId: "principal-one" }]);
    await expect(getAuthorizedPublicShareInSnapshot({} as never, verified, "A".repeat(24), { download: true }))
      .resolves.not.toBeInstanceOf(Response);
    expect(mocks.permissions).toHaveBeenCalledWith({}, verified,
      [{ permissionKind: "action", permissionCode: "pdm.transfer.download" }],
      { workspaceCode: "company-jenfu", projectCode: "P-001" });
  });

  it.each([null, "P-OTHER"])("hides a share with project binding %s", async projectScopeKey => {
    mocks.getShare.mockResolvedValue({ id: "share-one", submission_id: "submission-one",
      project_scope_key: projectScopeKey, status: "active" });
    const result = await getAuthorizedPublicShareInSnapshot({} as never, {} as never, "A".repeat(24));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
