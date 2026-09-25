import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), exportList: vi.fn(), exportOne: vi.fn(),
  auditList: vi.fn(), auditOne: vi.fn(), companyGuard: vi.fn(), legacyAction: vi.fn(),
  legacyExportList: vi.fn(), legacyExportOne: vi.fn(),
  legacyAuditList: vi.fn(), legacyAuditOne: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(readonly snapshot: unknown) {}
    listNumberingExportJobs(input: unknown) { return mocks.exportList(this.snapshot, input); }
    getNumberingExportJob(id: string, companyId: string) { return mocks.exportOne(this.snapshot, id, companyId); }
    listMonthlyNumberingAuditReports(input: unknown) { return mocks.auditList(this.snapshot, input); }
    getMonthlyNumberingAuditReport(id: string, companyId: string) { return mocks.auditOne(this.snapshot, id, companyId); }
  }
}));
vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.companyGuard
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingActionAsync: mocks.legacyAction
}));
vi.mock("@/lib/numbering-async", () => ({
  listNumberingExportJobsAsync: mocks.legacyExportList,
  getNumberingExportJobAsync: mocks.legacyExportOne,
  createNumberingExportJobAsync: vi.fn(),
  listMonthlyNumberingAuditReportsAsync: mocks.legacyAuditList,
  getMonthlyNumberingAuditReportAsync: mocks.legacyAuditOne,
  generateMonthlyNumberingAuditReportAsync: vi.fn()
}));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: vi.fn()
}));

import { GET as listExports } from "@/app/api/numbering/export-jobs/route";
import { GET as getExport } from "@/app/api/numbering/export-jobs/[jobId]/route";
import { GET as listAudits } from "@/app/api/numbering/monthly-audit-reports/route";
import { GET as getAudit } from "@/app/api/numbering/monthly-audit-reports/[reportId]/route";

const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const url = (path: string) => new Request(`https://example.test/api/numbering/${path}`);

describe("principal report read snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principalRead.mockImplementation(async (_request, _code, read) => read(snapshot, company));
    mocks.exportList.mockResolvedValue([{ id: "export-1" }]);
    mocks.auditList.mockResolvedValue([{ id: "audit-1" }]);
    mocks.exportOne.mockResolvedValue({ id: "export-1" });
    mocks.auditOne.mockResolvedValue({ id: "audit-1" });
  });

  it("uses one verified snapshot and company for both report lists", async () => {
    expect((await listExports(url("export-jobs?limit=4"))).status).toBe(200);
    expect((await listAudits(url("monthly-audit-reports?reportMonth=2026-09"))).status).toBe(200);
    expect(mocks.exportList).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", limit: 4 }));
    expect(mocks.auditList).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", reportMonth: "2026-09" }));
    expect(mocks.principalRead).toHaveBeenCalledTimes(2);
    expect(mocks.companyGuard).not.toHaveBeenCalled();
    expect(mocks.legacyExportList).not.toHaveBeenCalled();
    expect(mocks.legacyAuditList).not.toHaveBeenCalled();
  });

  it("does not resolve a report ID outside the principal's company", async () => {
    mocks.exportOne.mockResolvedValue(null);
    mocks.auditOne.mockResolvedValue(null);
    const exportResponse = await getExport(url("export-jobs/foreign"),
      { params: Promise.resolve({ jobId: "foreign" }) });
    const auditResponse = await getAudit(url("monthly-audit-reports/foreign"),
      { params: Promise.resolve({ reportId: "foreign" }) });
    expect(exportResponse.status).toBe(404);
    expect(auditResponse.status).toBe(404);
    expect(mocks.exportOne).toHaveBeenCalledWith(snapshot, "foreign", "company-jenfu");
    expect(mocks.auditOne).toHaveBeenCalledWith(snapshot, "foreign", "company-jenfu");
    expect(mocks.companyGuard).not.toHaveBeenCalled();
    expect(mocks.legacyExportOne).not.toHaveBeenCalled();
    expect(mocks.legacyAuditOne).not.toHaveBeenCalled();
  });
});
