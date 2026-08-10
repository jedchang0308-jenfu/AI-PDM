"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Download, Eye, FileText, RefreshCw, RotateCcw, ShieldAlert, X } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { PdmDetailDrawer, useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
import { formatStatusErrorForUser } from "@/lib/status-display";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { downloadJsonFile as downloadJson } from "@/lib/client-json-download";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type ExportMode = "no_audit" | "last_change_summary" | "full_change_summary";
type ReportTab = "company" | "rd" | "pdm_admin" | "qa_document" | "project";

type NumberingExportJob = {
  id: string;
  exportMode: ExportMode;
  status: "queued" | "running" | "completed" | "failed";
  result: Record<string, unknown>;
  generatedBy: string | null;
  generatedAt: string;
  completedAt: string | null;
};

type ReportCounts = {
  roots?: number;
  parts?: number;
  drawings?: number;
  openTasks?: number;
  approvalRules?: number;
};

type DepartmentPage = {
  key: ReportTab;
  label: string;
  roles?: string[];
  counts?: ReportCounts;
};

type ProjectBucket = {
  projectCode: string;
  totalTasks: number;
  openTasks: number;
  criticalTasks: number;
};

type MonthlyReportQuery = {
  reportMonth?: string;
  scheduledDay?: number;
  counts?: ReportCounts;
  departmentPages?: DepartmentPage[];
  projectBuckets?: ProjectBucket[];
};

type MonthlyAuditReport = {
  id: string;
  reportType: string;
  reportMonth: string;
  generationMode: "auto" | "manual";
  generatedBy: string | null;
  status: "queued" | "running" | "completed" | "failed";
  query: MonthlyReportQuery;
  createdAt: string;
};

const exportModes: Array<{ value: ExportMode; label: string }> = [
  { value: "no_audit", label: "不含稽核" },
  { value: "last_change_summary", label: "最後異動摘要" },
  { value: "full_change_summary", label: "完整異動摘要" }
];

const reportTabs: Array<{ value: ReportTab; label: string }> = [
  { value: "company", label: "全公司總覽" },
  { value: "rd", label: "研發" },
  { value: "pdm_admin", label: "PDM 管理" },
  { value: "qa_document", label: "QA / 文件" },
  { value: "project", label: "專案分頁" }
];

export default function NumberingReportsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [reports, setReports] = useState<MonthlyAuditReport[]>([]);
  const [exportJobs, setExportJobs] = useState<NumberingExportJob[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const reportListRef = useRef<HTMLDivElement | null>(null);
  const [isReportDetailOpen, setIsReportDetailOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [exportMode, setExportMode] = useState<ExportMode>("last_change_summary");
  const [activeTab, setActiveTab] = useState<ReportTab>("company");
  const [busy, setBusy] = useState<"report" | "export" | null>(null);
  const [error, setError] = useState("");
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-report-detail-drawer-width" });

  const selectedReport = useMemo(() => (selectedReportId ? reports.find((report) => report.id === selectedReportId) ?? null : null), [reports, selectedReportId]);
  const selectedDepartmentPage = selectedReport?.query.departmentPages?.find((page) => page.key === activeTab) ?? null;

  const loadData = useCallback(async () => {
    setState("loading");
    setError("");
    const [reportResponse, exportResponse] = await Promise.all([
      fetch("/api/numbering/monthly-audit-reports?limit=20"),
      fetch("/api/numbering/export-jobs?limit=20")
    ]);
    if (reportResponse.status === 401 || exportResponse.status === 401) {
      setState("unauthorized");
      return;
    }
    if (reportResponse.status === 403 || exportResponse.status === 403) {
      setState("forbidden");
      return;
    }
    const [reportBody, exportBody] = await Promise.all([reportResponse.json().catch(() => ({})), exportResponse.json().catch(() => ({}))]);
    if (!reportResponse.ok || !exportResponse.ok) {
      setError(formatStatusErrorForUser(reportBody.error ?? exportBody.error ?? "稽核報表讀取失敗", "jobStatus"));
      setState("error");
      return;
    }
    const nextReports = (reportBody.reports ?? []) as MonthlyAuditReport[];
    setReports(nextReports);
    setSelectedReportId((current) => {
      const nextSelection = current && nextReports.some((report) => report.id === current) ? current : null;
      setIsReportDetailOpen((open) => open && Boolean(nextSelection));
      return nextSelection;
    });
    setExportJobs((exportBody.jobs ?? []) as NumberingExportJob[]);
    setState("ready");
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openReportDetail = useCallback((report: MonthlyAuditReport) => {
    setSelectedReportId(report.id);
    setIsReportDetailOpen(true);
  }, []);

  const selectReport = useCallback((report: MonthlyAuditReport, options: { openDetail: boolean }) => {
    setSelectedReportId(report.id);
    if (options.openDetail) setIsReportDetailOpen(true);
  }, []);

  const closeReportDetail = useCallback(() => {
    setIsReportDetailOpen(false);
  }, []);

  const reportShortcuts = useListKeyboardShortcuts({
    items: reports,
    selectedKey: selectedReportId,
    listRef: reportListRef,
    rowSelector: "[data-monthly-report-row='true']",
    getKey: (report) => report.id,
    getCopyText: (report) => report.reportMonth,
    onSelect: selectReport,
    onOpenDetail: openReportDetail,
    onCloseDetail: closeReportDetail,
    isDetailOpen: isReportDetailOpen
  });

  useEffect(() => {
    if (!isReportDetailOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-monthly-report-row='true']")) return;
      setIsReportDetailOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isReportDetailOpen]);

  async function regenerateReport() {
    setBusy("report");
    const response = await fetch("/api/numbering/monthly-audit-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportMonth })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "月報重產失敗", "jobStatus"));
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    setReports((current) => [body as MonthlyAuditReport, ...current.filter((report) => report.id !== body.id)]);
    setSelectedReportId(body.id);
    setIsReportDetailOpen(true);
    setState("ready");
  }

  async function createExportJob() {
    setBusy("export");
    const response = await fetch("/api/numbering/export-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exportMode })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "總表匯出失敗", "jobStatus"));
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    const job = body as NumberingExportJob;
    setExportJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    downloadJson(job.result, `numbering-export-${job.exportMode}-${job.generatedAt.slice(0, 10)}.json`);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖號稽核報表 <StatusScopeHelp scope="reportCenter" /></h1>
          <p>圖料號總覽、部門分頁、總表匯出與月報重產。</p>
        </div>
        <div style={actionGroupStyle}>
          <button className="secondary-button" type="button" onClick={loadData}>
            <RotateCcw size={16} />
            重新整理
          </button>
        </div>
      </div>

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看圖號稽核報表。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="只有研發主管或系統管理員可以查看報表；手動重產需系統管理員權限。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadData} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入稽核報表...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>月報重產</h2>
                <p style={mutedTextStyle}>每月 1 日為預設產生日，可由管理員手動重產指定月份。</p>
              </div>
              <div style={actionGroupStyle}>
                <input
                  aria-label="報表月份"
                  className="dropdown-select"
                  type="month"
                  value={reportMonth}
                  onChange={(event) => setReportMonth(event.target.value)}
                />
                <button className="primary-button" type="button" disabled={busy === "report"} onClick={regenerateReport}>
                  <RefreshCw size={16} />
                  重產月報
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>總表匯出</h2>
                <p style={mutedTextStyle}>依目前資料即時產生 JSON 匯出檔，可選擇稽核摘要範圍。</p>
              </div>
              <div style={actionGroupStyle}>
                <select className="dropdown-select" value={exportMode} onChange={(event) => setExportMode(event.target.value as ExportMode)}>
                  {exportModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <button className="primary-button" type="button" disabled={busy === "export"} onClick={createExportJob}>
                  <Download size={16} />
                  匯出下載
                </button>
              </div>
            </div>
            <ExportJobTable jobs={exportJobs} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>近期月報</h2>
                <p style={mutedTextStyle}>切換查看歷次月報，主管可直接下載 JSON 證據。</p>
              </div>
            </div>
            <div
              aria-keyshortcuts={reportShortcuts.shortcuts}
              aria-label="近期月報清單"
              onKeyDown={reportShortcuts.handleKeyDown}
              ref={reportListRef}
              role="region"
              tabIndex={0}
            >
              <MonthlyReportTable reports={reports} selectedId={selectedReportId} onSelect={openReportDetail} />
            </div>
          </section>

          <PdmDetailDrawer
            open={isReportDetailOpen && Boolean(selectedReport)}
            width={drawerWidth}
            ariaLabel="月報明細"
            onClose={closeReportDetail}
            onStartResize={startDrawerResize}
          >
            <section className="panel pdm-master-detail-panel">
              <div className="panel-header">
                <div>
                  <h2>{selectedReport ? `${selectedReport.reportMonth} 月報明細` : "月報明細"}</h2>
                  <p style={mutedTextStyle}>依部門、專案與主資料數量檢視月報內容。</p>
                </div>
                <button className="icon-button" type="button" aria-label="關閉月報明細" onClick={closeReportDetail}>
                  <X size={16} />
                </button>
              </div>
              <ReportOverview report={selectedReport} activeTab={activeTab} selectedDepartmentPage={selectedDepartmentPage} onTabChange={setActiveTab} />
            </section>
          </PdmDetailDrawer>
        </div>
      ) : null}
    </>
  );
}

function ReportOverview({
  report,
  activeTab,
  selectedDepartmentPage,
  onTabChange
}: {
  report: MonthlyAuditReport | null;
  activeTab: ReportTab;
  selectedDepartmentPage: DepartmentPage | null;
  onTabChange: (tab: ReportTab) => void;
}) {
  if (!report) {
    return <EmptyBlock icon="report" text="尚未產生月報" />;
  }
  const counts = report.query.counts ?? {};
  return (
    <div style={{ display: "grid", gap: "0.75rem", padding: "12px 16px 16px" }}>
      <div className="metrics" style={{ marginBottom: 0 }}>
        <Metric label="主根號" value={counts.roots ?? 0} />
        <Metric label="料號" value={counts.parts ?? 0} />
        <Metric label="圖號" value={counts.drawings ?? 0} />
        <Metric label="未結待辦" value={counts.openTasks ?? 0} />
      </div>
      <div className="status-tabs">
        {reportTabs.map((tab) => (
          <button className={activeTab === tab.value ? "active" : undefined} key={tab.value} type="button" onClick={() => onTabChange(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "project" ? <ProjectBuckets buckets={report.query.projectBuckets ?? []} /> : <DepartmentPanel page={selectedDepartmentPage} />}
      <div style={reportMetaStyle}>
        <span>月份 {report.reportMonth}</span>
        <span>產生方式 {report.generationMode === "manual" ? "手動" : "自動"}</span>
        <span>預設日 {report.query.scheduledDay ?? 1}</span>
        <button className="secondary-button" type="button" onClick={() => downloadJson(report, `numbering-monthly-audit-${report.reportMonth}.json`)}>
          <Download size={16} />
          下載月報 JSON
        </button>
      </div>
    </div>
  );
}

function DepartmentPanel({ page }: { page: DepartmentPage | null }) {
  if (!page) {
    return (
      <NextStepState
        compact
        eyebrow="不用處理"
        title="此分頁目前尚無資料"
        body="目前沒有可彙整的部門資料。若要追查來源，請回圖料模組或待辦清單確認是否有未結項目。"
        actions={[
          { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
          { href: "/numbering/tasks", label: "查看待辦" }
        ]}
      />
    );
  }
  const counts = page.counts ?? {};
  return (
    <div style={departmentPanelStyle}>
      <div>
        <Building2 size={20} aria-hidden="true" />
        <strong>{page.label}</strong>
        <p style={bodyTextStyle}>{page.roles?.length ? `角色：${page.roles.join(", ")}` : "全公司圖料號總覽"}</p>
      </div>
      <div className="metrics" style={{ marginBottom: 0 }}>
        <Metric label="未結待辦" value={counts.openTasks ?? 0} />
        <Metric label="審核規則" value={counts.approvalRules ?? 0} />
        <Metric label="主根號" value={counts.roots ?? 0} />
        <Metric label="圖號" value={counts.drawings ?? 0} />
      </div>
    </div>
  );
}

function ProjectBuckets({ buckets }: { buckets: ProjectBucket[] }) {
  if (buckets.length === 0) {
    return (
      <NextStepState
        compact
        eyebrow="不用處理"
        title="目前沒有專案待辦資料"
        body="專案沒有未結待辦時不需要處理。若你在找特定圖號或料號，請回圖料模組重新查詢。"
        actions={[
          { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
          { href: "/numbering/tasks", label: "查看待辦" }
        ]}
      />
    );
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "720px" }}>
        <thead>
          <tr>
            <th>專案 / 部門代碼</th>
            <th>待辦總數</th>
            <th>未結待辦</th>
            <th>Critical</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.projectCode}>
              <td>{bucket.projectCode}</td>
              <td>{bucket.totalTasks}</td>
              <td>{bucket.openTasks}</td>
              <td>{bucket.criticalTasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportJobTable({ jobs }: { jobs: NumberingExportJob[] }) {
  if (jobs.length === 0) {
    return <EmptyBlock icon="export" text="尚未產生總表匯出" />;
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>匯出模式</th>
            <th>
              <StatusColumnHeader label="執行狀態" context="jobStatus" />
            </th>
            <th>產生時間</th>
            <th>資料量</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{exportModeLabel(job.exportMode)}</td>
              <td>
                <StatusBadge status={job.status} context="jobStatus" />
              </td>
              <td>{formatDateTime(job.generatedAt)}</td>
              <td>{resultSummary(job.result)}</td>
              <td>
                <button className="secondary-button" type="button" onClick={() => downloadJson(job.result, `numbering-export-${job.exportMode}-${job.generatedAt.slice(0, 10)}.json`)}>
                  <Download size={16} />
                  下載
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyReportTable({
  reports,
  selectedId,
  onSelect
}: {
  reports: MonthlyAuditReport[];
  selectedId: string | null;
  onSelect: (report: MonthlyAuditReport) => void;
}) {
  if (reports.length === 0) {
    return <EmptyBlock icon="report" text="尚未產生月報" />;
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>月份</th>
            <th>
              <StatusColumnHeader label="執行狀態" context="jobStatus" />
            </th>
            <th>產生方式</th>
            <th>建立時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr
              className={selectedId === report.id ? "selected-row" : undefined}
              data-monthly-report-row="true"
              key={report.id}
              onClick={() => onSelect(report)}
            >
              <td>{report.reportMonth}</td>
              <td>
                <StatusBadge status={report.status} context="jobStatus" />
              </td>
              <td>{report.generationMode === "manual" ? "手動" : "自動"}</td>
              <td>{formatDateTime(report.createdAt)}</td>
              <td>
                <div style={actionGroupStyle}>
                  <button className="secondary-button" type="button" onClick={() => onSelect(report)}>
                    <Eye size={16} />
                    查看
                  </button>
                  <button className="secondary-button" type="button" onClick={() => downloadJson(report, `numbering-monthly-audit-${report.reportMonth}.json`)}>
                    <Download size={16} />
                    下載
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>報表暫時無法讀取</h2>
        <p>{message} 現在請重試；若仍失敗，請回待辦或圖料模組確認來源資料，或請 Admin 協助。</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            重試
          </button>
        </div>
      </div>
    </section>
  );
}

function EmptyBlock({ icon, text }: { icon: "department" | "export" | "report"; text: string }) {
  const Icon = icon === "department" ? Building2 : icon === "export" ? Download : FileText;
  return (
    <div className="empty">
      <Icon size={22} aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function exportModeLabel(value: ExportMode) {
  return exportModes.find((mode) => mode.value === value)?.label ?? value;
}

function resultSummary(result: Record<string, unknown>) {
  const roots = Array.isArray(result.roots) ? result.roots.length : 0;
  const parts = Array.isArray(result.parts) ? result.parts.length : 0;
  const drawings = Array.isArray(result.drawings) ? result.drawings.length : 0;
  return `主根號 ${roots} / 料號 ${parts} / 圖號 ${drawings}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}

const mutedTextStyle = {
  margin: 0,
  color: "var(--muted)",
  fontSize: "0.82rem"
} as const;

const bodyTextStyle = {
  margin: "0.25rem 0 0",
  color: "var(--muted)",
  fontSize: "0.86rem",
  lineHeight: 1.45
} as const;

const actionGroupStyle = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center"
} as const;

const departmentPanelStyle = {
  display: "grid",
  gap: "0.75rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "12px",
  background: "#fbfcfd"
} as const;

const reportMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  alignItems: "center",
  color: "var(--muted)",
  fontSize: "0.84rem"
} as const;
