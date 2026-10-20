import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getShare: vi.fn(), record: vi.fn(), getSubmission: vi.fn(), authorize: vi.fn() }));
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

import { getAuthorizedPublicShareInSnapshot } from "@/lib/principal-readonly-share";

describe("DEV-123 readonly share project binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([null, "P-OTHER"])("hides a share with project binding %s", async projectScopeKey => {
    mocks.getShare.mockResolvedValue({ id: "share-one", submission_id: "submission-one",
      project_scope_key: projectScopeKey, status: "active" });
    const result = await getAuthorizedPublicShareInSnapshot({} as never, {} as never, "A".repeat(24));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
