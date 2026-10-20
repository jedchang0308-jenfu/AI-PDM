import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  principalRead: vi.fn(),
  dynamicPolicy: vi.fn(),
  authorizeResult: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/principal-resource-capability", () => ({
  isDynamicRolePolicyInSnapshot: mocks.dynamicPolicy
}));
vi.mock("@/lib/numbering-export-job-capability", () => ({
  authorizeNumberingExportJobResultInSnapshot: mocks.authorizeResult
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(readonly snapshot: unknown) {}
    listNumberingExportJobs(input: unknown) { return mocks.listJobs(this.snapshot, input); }
    getNumberingExportJob(id: string, companyId: string) { return mocks.getJob(this.snapshot, id, companyId); }
  }
}));

import { GET as listExports } from "@/app/api/numbering/export-jobs/route";
import { GET as getExport } from "@/app/api/numbering/export-jobs/[jobId]/route";

const snapshot = { id: "snapshot-a" };
const verified = { session: { principalId: "principal-a" } };
const company = { companyId: "company-a", companyCode: "JENFU", companyKind: "business" };
const job = {
  id: "job-a",
  exportMode: "no_audit",
  status: "completed",
  result: { exportMode: "no_audit", companyId: "company-a", roots: [{ root_code: "R-1" }] },
  generatedBy: "profile-a",
  generatedAt: "2026-10-21T00:00:00.000Z",
  completedAt: "2026-10-21T00:00:00.000Z"
};
const request = (path: string) => new Request(`https://example.test${path}`, {
  headers: { "x-principal-session": "principal-session" }
});

describe("numbering export job dynamic result delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.dynamicPolicy.mockResolvedValue(true);
    mocks.authorizeResult.mockResolvedValue(null);
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company, verified));
    mocks.listJobs.mockResolvedValue([job]);
    mocks.getJob.mockResolvedValue(job);
  });

  it("returns metadata-only list items for dynamic roles", async () => {
    const response = await listExports(request("/api/numbering/export-jobs?limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toEqual([{
      id: "job-a",
      exportMode: "no_audit",
      status: "completed",
      generatedBy: "profile-a",
      generatedAt: job.generatedAt,
      completedAt: job.completedAt
    }]);
    expect(body.jobs[0]).not.toHaveProperty("result");
    expect(mocks.listJobs).toHaveBeenCalledWith(snapshot, { companyId: "company-a", limit: 5 });
  });

  it("retains list results for legacy publications", async () => {
    mocks.dynamicPolicy.mockResolvedValue(false);
    const response = await listExports(request("/api/numbering/export-jobs"));
    const body = await response.json();

    expect(body.jobs[0].result).toEqual(job.result);
  });

  it("does not return a detail result when the same snapshot denies its content", async () => {
    mocks.authorizeResult.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await getExport(request("/api/numbering/export-jobs/job-a"), {
      params: Promise.resolve({ jobId: "job-a" })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "permission_not_granted" });
    expect(mocks.authorizeResult).toHaveBeenCalledWith(snapshot, verified, job.result);
    expect(mocks.getJob).toHaveBeenCalledWith(snapshot, "job-a", "company-a");
  });

  it("returns the original DTO only after the same snapshot allows its result", async () => {
    const response = await getExport(request("/api/numbering/export-jobs/job-a"), {
      params: Promise.resolve({ jobId: "job-a" })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(job);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.authorizeResult).toHaveBeenCalledWith(snapshot, verified, job.result);
  });
});
