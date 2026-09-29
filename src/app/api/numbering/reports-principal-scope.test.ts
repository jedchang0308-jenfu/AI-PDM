import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(),
  listJobs: vi.fn(), getJob: vi.fn(), listReports: vi.fn(), getReport: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    listNumberingExportJobs = mocks.listJobs;
    getNumberingExportJob = mocks.getJob;
    listMonthlyNumberingAuditReports = mocks.listReports;
    getMonthlyNumberingAuditReport = mocks.getReport;
  }
}));
vi.mock("@/lib/numbering-async", () => ({
  createNumberingExportJobAsync: vi.fn(), generateMonthlyNumberingAuditReportAsync: vi.fn()
}));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingActionAsync: vi.fn() }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: vi.fn()
}));

import { GET as listJobs } from "@/app/api/numbering/export-jobs/route";
import { GET as getJob } from "@/app/api/numbering/export-jobs/[jobId]/route";
import { GET as listReports } from "@/app/api/numbering/monthly-audit-reports/route";
import { GET as getReport } from "@/app/api/numbering/monthly-audit-reports/[reportId]/route";

const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const request = (path: string) => new Request("https://example.test" + path);
const readAll = async () => [
  await listJobs(request("/api/numbering/export-jobs?limit=5")),
  await getJob(request("/api/numbering/export-jobs/job-1"),
    { params: Promise.resolve({ jobId: "job-1" }) }),
  await listReports(request("/api/numbering/monthly-audit-reports?reportMonth=2026-09")),
  await getReport(request("/api/numbering/monthly-audit-reports/report-1"),
    { params: Promise.resolve({ reportId: "report-1" }) })
];

describe("DEV-121 Principal-only report reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company));
    mocks.listJobs.mockResolvedValue([{ id: "job-1" }]);
    mocks.getJob.mockResolvedValue({ id: "job-1" });
    mocks.listReports.mockResolvedValue([{ id: "report-1" }]);
    mocks.getReport.mockResolvedValue({ id: "report-1" });
  });

  it("scopes lists and individual readbacks to the verified company and snapshot", async () => {
    const responses = await readAll();
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.principalRead).toHaveBeenCalledTimes(4);
    expect(mocks.listJobs).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-jenfu", limit: 5 }));
    expect(mocks.getJob).toHaveBeenCalledWith("job-1", "company-jenfu");
    expect(mocks.listReports).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", reportMonth: "2026-09"
    }));
    expect(mocks.getReport).toHaveBeenCalledWith("report-1", "company-jenfu");
  });

  it("rejects missing or old sessions before any report read", async () => {
    mocks.token.mockReturnValue(null);
    const responses = await readAll();
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.getReport).not.toHaveBeenCalled();
  });

  it("does not read reports after Principal company or page denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const responses = await readAll();
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.getReport).not.toHaveBeenCalled();
  });

  it("fails closed when the Principal read dependency is unavailable", async () => {
    mocks.principalRead.mockResolvedValue(null);
    const responses = await readAll();
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503]);
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
});
