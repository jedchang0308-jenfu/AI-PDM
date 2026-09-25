import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companyGuard: vi.fn(),
  listJobs: vi.fn(), getJob: vi.fn(), listReports: vi.fn(), getReport: vi.fn()
}));
vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.companyGuard
}));
vi.mock("@/lib/numbering-async", () => ({
  createNumberingExportJobAsync: vi.fn(), generateMonthlyNumberingAuditReportAsync: vi.fn(),
  listNumberingExportJobsAsync: mocks.listJobs,
  getNumberingExportJobAsync: mocks.getJob,
  listMonthlyNumberingAuditReportsAsync: mocks.listReports,
  getMonthlyNumberingAuditReportAsync: mocks.getReport
}));

import { GET as listJobs } from "@/app/api/numbering/export-jobs/route";
import { GET as getJob } from "@/app/api/numbering/export-jobs/[jobId]/route";
import { GET as listReports } from "@/app/api/numbering/monthly-audit-reports/route";
import { GET as getReport } from "@/app/api/numbering/monthly-audit-reports/[reportId]/route";

const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const request = (path: string) => new Request(`https://example.test${path}`);

describe("DEV-121 report reads use only the verified principal company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companyGuard.mockResolvedValue({ company, response: null });
    mocks.listJobs.mockResolvedValue([]);
    mocks.getJob.mockResolvedValue({ id: "job-1" });
    mocks.listReports.mockResolvedValue([]);
    mocks.getReport.mockResolvedValue({ id: "report-1" });
  });

  it("scopes both report lists and individual readbacks", async () => {
    expect((await listJobs(request("/api/numbering/export-jobs"))).status).toBe(200);
    expect((await getJob(request("/api/numbering/export-jobs/job-1"),
      { params: Promise.resolve({ jobId: "job-1" }) })).status).toBe(200);
    expect((await listReports(request("/api/numbering/monthly-audit-reports"))).status).toBe(200);
    expect((await getReport(request("/api/numbering/monthly-audit-reports/report-1"),
      { params: Promise.resolve({ reportId: "report-1" }) })).status).toBe(200);
    expect(mocks.companyGuard).toHaveBeenCalledTimes(4);
    expect(mocks.listJobs).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-jenfu" }));
    expect(mocks.getJob).toHaveBeenCalledWith("job-1", "company-jenfu");
    expect(mocks.listReports).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-jenfu" }));
    expect(mocks.getReport).toHaveBeenCalledWith("report-1", "company-jenfu");
  });

  it("does not query report data after principal company denial", async () => {
    mocks.companyGuard.mockResolvedValue({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    expect((await listJobs(request("/api/numbering/export-jobs"))).status).toBe(403);
    expect((await getJob(request("/api/numbering/export-jobs/job-1"),
      { params: Promise.resolve({ jobId: "job-1" }) })).status).toBe(403);
    expect((await listReports(request("/api/numbering/monthly-audit-reports"))).status).toBe(403);
    expect((await getReport(request("/api/numbering/monthly-audit-reports/report-1"),
      { params: Promise.resolve({ reportId: "report-1" }) })).status).toBe(403);
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
});
