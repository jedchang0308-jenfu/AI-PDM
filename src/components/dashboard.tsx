"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Bell,
  Check,
  ClipboardList,
  Copy,
  Download,
  Eye,
  Factory,
  FileText,
  Filter,
  GitBranch,
  GitPullRequestArrow,
  ListTree,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCcw,
  Search,
  Share2,
  ShieldAlert,
  Unlock,
  UploadCloud,
  X,
  type LucideIcon
} from "lucide-react";
import { AssistantPanel, FinderToolbar, NotificationDropdown, SubmissionDetailPanel, SubmissionTable, type ChatMessage } from "@/components/dashboard/layout-parts";
import { LifecycleMap, ObjectLifecycleStatusPanel, buildUploadPrefillHref, type LifecycleMetric, type LifecycleStageId } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { revisionPackageRoleLabel } from "@/lib/revision-package";
import { buildAdaptiveTaskFeed, type TaskSummary, type TaskSummarySeverity, type TaskSummarySource } from "@/lib/adaptive-task-feed";
import { formatDevelopmentPhaseForUser, formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
import type {
  ApprovalMatrixRequirement,
  BomDiffResult,
  AiSubmissionSummary,
  AiRiskReport,
  BomLine,
  ChangeRequest,
  ControlledHistoryEntry,
  DiscussionComment,
  DesignReuseCandidate,
  DuplicateGeometryCandidate,
  ItemRevisionHistoryEntry,
  NotificationItem,
  NotificationSummary,
  PhaseGateCheck,
  PdfMarkup,
  ProcurementSyncRun,
  ReadonlyShare,
  ReviewIssue,
  SandboxBranch,
  SubmissionDetail,
  SubmissionLifecycleRequest,
  SubmissionStatus,
  SubmissionSummary,
  SupplierPortalResponse,
  WhereUsedEntry
} from "@/lib/types";

function formatWorkflowStatus(value: string) {
  return formatStatusForUser(value, "workflow");
}

function formatFileAvailability(submission: SubmissionSummary) {
  const roles = new Set((submission.file_roles ?? "").split(",").filter(Boolean));
  const items = [];
  if (roles.has("pdf")) items.push("PDF");
  if (roles.has("dwg")) items.push("DWG");
  if (roles.has("sldprt") || roles.has("sldasm") || roles.has("slddrw")) items.push("SW");
  if (submission.has_release_package) items.push("發布包");
  return items.length > 0 ? items.join(" / ") : `${submission.file_count} 個檔案`;
}

function latestActivityAt(submission: SubmissionSummary) {
  return submission.released_at ?? submission.updated_at ?? submission.created_at;
}

function humanSubmissionActionError(value: unknown, fallbackAction = "操作未完成") {
  const text = String(value ?? "").trim();
  if (!text) return `${fallbackAction}。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。`;
  if (text === "FORBIDDEN" || text === "Insufficient role permission") return "你目前不能執行這個動作，請由主管或 Admin 處理。";
  if (text.includes("DUPLICATE_RELEASE_FILENAME")) return "發行失敗：附件檔名已被其他正式紀錄使用。請回送審工作台移除錯誤附件或更換正確檔案後，再建立修正送審。";
  if (text.includes("RELEASE_NOT_CONFIGURED")) return "發行失敗：系統尚未完成正式發行設定。請通知 Admin 檢查發行設定後再處理。";
  if (text.includes("LOCAL_GDRIVE_RELEASE_FAILED")) return "發行失敗：檔案移到正式資料夾時失敗。請通知主管或 Admin 檢查發行資料夾與檔案權限。";
  if (text.includes("主資料狀態同步失敗")) return "發行已嘗試完成，但主資料狀態同步未完成。請主管或 Admin 檢查主資料同步後再交接。";
  return formatStatusErrorForUser(text, "submission");
}

function alertSubmissionActionError(body: Record<string, unknown>, fallbackAction: string) {
  alert(humanSubmissionActionError(body.message ?? body.error ?? body.code, fallbackAction));
}

type ConditionFilter = "my" | "locked" | "missing_handoff";
type StatusFilterConfig = { label: string; status: SubmissionStatus | "All" };
type ConditionFilterConfig = { key: ConditionFilter; label: string };
type FinderFilters = {
  productLine: string;
  customer: string;
  projectCode: string;
  processName: string;
  machine: string;
  material: string;
  surfaceFinish: string;
  parentDrawing: string;
  childDrawingNumber: string;
  childPartNumber: string;
  bomIssue: "" | "unreleased" | "outdated";
};

type RecentDrawing = {
  id: string;
  drawing_number: string;
  part_number: string;
  part_name: string;
  revision: string;
  updated_at: string;
};

type NumberingDraftRecord = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  rootCode: string;
  coreName: string;
  displayCode: string;
  displayName: string;
  developmentPhase: string;
  recordStatus: string;
  partNumber: string | null;
  drawingNumber: string | null;
  primaryDrawingNumber: string | null;
};

type SavedFinderSearch = {
  id: string;
  name: string;
  query: string;
  status: SubmissionStatus | "All";
  filters: FinderFilters;
  created_at: string;
};

type DetailResourceGroup = "engineering" | "insights" | "collaboration" | "handoff";

const emptyDetailResourceFlags: Record<DetailResourceGroup, boolean> = {
  engineering: false,
  insights: false,
  collaboration: false,
  handoff: false
};

const recentSearchesStorageKey = "pdm.recentSearches";
const recentDrawingsStorageKey = "pdm.recentDrawings";
const favoriteDrawingsStorageKey = "pdm.favoriteDrawings";
const savedFinderSearchesStoragePrefix = "pdm.savedFinderSearches";
const submissionsPageSize = 100;
const virtualRowHeight = 57;
const virtualOverscan = 8;

const statusFilters: StatusFilterConfig[] = [
  { label: "全部", status: "All" },
  { label: "審核中", status: "Pending" },
  { label: "已發布", status: "Released" },
  { label: "已駁回", status: "Rejected" },
  { label: "發行未完成", status: "ReleaseFailed" }
];

const emptyFinderFilters: FinderFilters = {
  productLine: "",
  customer: "",
  projectCode: "",
  processName: "",
  machine: "",
  material: "",
  surfaceFinish: "",
  parentDrawing: "",
  childDrawingNumber: "",
  childPartNumber: "",
  bomIssue: ""
};

const finderFilterConfigs: Array<{
  key: keyof FinderFilters;
  label: string;
  param: string;
  type?: "text" | "select";
  options?: Array<{ value: FinderFilters["bomIssue"]; label: string }>;
}> = [
  { key: "productLine", label: "產品線", param: "productLine" },
  { key: "customer", label: "客戶", param: "customer" },
  { key: "projectCode", label: "專案", param: "projectCode" },
  { key: "processName", label: "製程", param: "processName" },
  { key: "machine", label: "機台", param: "machine" },
  { key: "material", label: "材質", param: "material" },
  { key: "surfaceFinish", label: "表處", param: "surfaceFinish" },
  { key: "parentDrawing", label: "父組合圖", param: "parentDrawing" },
  { key: "childDrawingNumber", label: "子件圖號", param: "childDrawingNumber" },
  { key: "childPartNumber", label: "子件料號", param: "childPartNumber" },
  {
    key: "bomIssue",
    label: "BOM 子件狀態",
    param: "bomIssue",
    type: "select",
    options: [
      { value: "", label: "全部" },
      { value: "unreleased", label: "含未發布 / 缺件" },
      { value: "outdated", label: "含舊版子件" }
    ]
  }
];

const conditionFilters: ConditionFilterConfig[] = [
  { key: "my", label: "我建立的" },
  { key: "locked", label: "編輯預約中" },
  { key: "missing_handoff", label: "缺交接檔" }
];

type WorkbenchLink = {
  href: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type WorkbenchSection = {
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  links: WorkbenchLink[];
};

function getPlatformWorkbenchSections({
  currentUser,
  notificationSummary,
  recentDrawings,
  favoriteDrawings
}: {
  currentUser: CurrentUser;
  notificationSummary: NotificationSummary;
  recentDrawings: RecentDrawing[];
  favoriteDrawings: RecentDrawing[];
}): WorkbenchSection[] {
  const recommendedLinks: WorkbenchLink[] =
    currentUser.role === "Engineer"
      ? [
          { href: "/upload", label: "上傳送審", detail: "建立新的圖料送審", icon: UploadCloud },
          { href: "/numbering/request", label: "領號申請", detail: "先取得料號 / 圖號", icon: ClipboardList },
          { href: "/bom/workbench", label: "BOM 工作台", detail: "建立或整理 BOM 草稿", icon: ListTree }
        ]
      : [
          { href: "/bom/reviews", label: "BOM 審核", detail: "處理審核中 BOM 差異", icon: ListTree },
          { href: "/numbering/approvals", label: "發行審核", detail: "審 DVT / 發布關卡", icon: GitPullRequestArrow },
          { href: "/numbering/reports", label: "圖號報表", detail: "檢視審核與稽核摘要", icon: FileText }
        ];

  return [
    {
      title: "我的待辦",
      description: "集中處理審核、通知與阻塞，不必先判斷功能位置。",
      badge: `${notificationSummary.total} 通知`,
      icon: Bell,
      links: [
        {
          href: "/numbering/tasks",
          label: "待辦中心",
          detail: `${notificationSummary.critical} 高風險 / ${notificationSummary.warning} 注意`,
          icon: Bell
        },
        { href: "/bom/reviews", label: "BOM 審核", detail: "主管與跨部門 BOM gate", icon: ListTree },
        { href: "/numbering/approvals", label: "發行審核", detail: "DVT / 發布決策", icon: GitPullRequestArrow }
      ]
    },
    {
      title: "我要開始",
      description: "從建立資料開始，覆蓋 RD、PM 協調與 PDM 管理的常見入口。",
      badge: "建立",
      icon: UploadCloud,
      links: [
        { href: "/upload", label: "上傳送審", detail: "圖面 / 文件 / CAD 檔", icon: UploadCloud },
        { href: "/numbering/request", label: "領號申請", detail: "料號、圖號、用途", icon: ClipboardList },
        { href: "/numbering/imports", label: "圖號總表匯入", detail: "既有主檔暫存", icon: FileText }
      ]
    },
    {
      title: "我要追蹤",
      description: "以物件為中心回到圖號、料號、BOM、影響範圍與近期活動。",
      badge: `${recentDrawings.length} 最近 / ${favoriteDrawings.length} 關注`,
      icon: Search,
      links: [
        { href: "/numbering/search", label: "圖料模組", detail: "圖號、料號、同圖多料號", icon: Search },
        { href: "/numbering/impact", label: "製造圖影響分析", detail: "作廢前先看影響", icon: ShieldAlert },
        { href: "/numbering/reports", label: "圖號報表", detail: "匯出、稽核、月報", icon: FileText }
      ]
    },
    {
      title: "我要交接輸出",
      description: "讓製造、採購、供應商與管理者從已發布狀態取得可用資料。",
      badge: "交接",
      icon: Factory,
      links: [
        { href: "/handoff", label: "製造交接", detail: "已發布圖料與交接包", icon: Factory },
        { href: "/bom/workbench", label: "BOM 工作台", detail: "BOM snapshot / 匯出", icon: ListTree },
        { href: "/numbering/reports", label: "報表輸出", detail: "跨角色狀態彙整", icon: FileText }
      ]
    },
    {
      title: "系統建議",
      description: "依目前角色先給高價值入口；後續可升級為自適應任務路由。",
      badge: roleLabels[currentUser.role],
      icon: MessageSquare,
      links: recommendedLinks
    }
  ];
}

const taskSeverityClass: Record<TaskSummarySeverity, string> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success"
};

const taskSourceIcons: Record<TaskSummarySource, LucideIcon> = {
  numbering_task: ClipboardList,
  notification: Bell,
  bom_review: ListTree,
  handoff_readiness: Factory,
  storage_evidence: Archive,
  submission: FileText
};

function AdaptiveTaskFeedPanel({ tasks }: { tasks: TaskSummary[] }) {
  return (
    <section className="platform-workbench adaptive-task-feed" aria-label="自適應任務排序">
      <div className="platform-workbench-header">
        <div>
          <span className="section-label">Adaptive task feed</span>
          <h2>下一個該處理的任務</h2>
          <p>依角色、風險、審核中、交接與系統異常排序。</p>
        </div>
      </div>
      <div className="platform-workbench-grid adaptive-task-feed-grid">
        {tasks.map((item) => {
          const Icon = taskSourceIcons[item.source];
          return (
            <article className={`platform-workbench-card adaptive-task-card ${taskSeverityClass[item.severity]}`} key={item.id}>
              <div className="platform-workbench-card-header">
                <span className="workbench-card-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <span className="metadata-badge">{item.signal}</span>
                  <h3>{item.title}</h3>
                </div>
              </div>
              <p>{item.detail}</p>
              <div className="workbench-link-list">
                <Link className="workbench-link" href={item.href}>
                  <GitBranch size={15} aria-hidden="true" />
                  <span>
                    <strong>{item.primaryActionLabel}</strong>
                    <small>{item.evidence}</small>
                  </span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NumberingDraftWorkbench({ drafts }: { drafts: NumberingDraftRecord[] }) {
  const uniqueDrafts = dedupeNumberingDrafts(drafts);
  if (uniqueDrafts.length === 0) return null;
  const firstDraft = uniqueDrafts[0];
  const firstDrawing = firstDraft.drawingNumber ?? firstDraft.primaryDrawingNumber;
  const firstPart = firstDraft.partNumber;
  return (
    <section className="platform-workbench" aria-label="我的開發中圖料">
      <ObjectLifecycleStatusPanel
        title="我的開發中圖料"
        objectName={`${firstDraft.rootCode} / ${firstPart ?? "未帶入料號"} / ${firstDrawing ?? "未帶入圖號"}`}
        status={firstDraft.recordStatus}
        phase={firstDraft.developmentPhase}
        owner="RD"
        identities={[
          { label: "待送審草稿", value: uniqueDrafts.length },
          { label: "主根號", value: firstDraft.rootCode },
          { label: "料號", value: firstPart ?? "-" },
          { label: "圖號", value: firstDrawing ?? "-" },
          { label: "品名", value: firstDraft.displayName || firstDraft.coreName }
        ]}
        blockers={["草稿已有號碼，但尚未形成審核中送審單", "未送審前不可作為正式 BOM、製造或採購交接資料"]}
        nextStep="從這裡接續上傳送審；送出後才會進入審核者的待辦與 release 流程。"
        primaryAction={{
          href: buildUploadPrefillHref({
            rootCode: firstDraft.rootCode,
            drawingNumber: firstDrawing,
            partNumber: firstPart,
            partName: firstDraft.displayName || firstDraft.coreName,
            developmentPhase: firstDraft.developmentPhase
          }),
          label: "接續送審"
        }}
        secondaryActions={[
          { href: "/numbering/tasks", label: "看全部草稿" },
          { href: `/numbering/search?query=${encodeURIComponent(firstDraft.rootCode)}`, label: "開主根明細" }
        ]}
      />
      {uniqueDrafts.length > 1 ? (
        <div className="workbench-link-list">
          {uniqueDrafts.slice(1, 5).map((draft) => {
            const drawingNumber = draft.drawingNumber ?? draft.primaryDrawingNumber;
            return (
              <Link
                className="workbench-link"
                href={buildUploadPrefillHref({
                  rootCode: draft.rootCode,
                  drawingNumber,
                  partNumber: draft.partNumber,
                  partName: draft.displayName || draft.coreName,
                  developmentPhase: draft.developmentPhase
                })}
                key={draft.rootCode}
              >
                <UploadCloud size={15} aria-hidden="true" />
                <span>
                  <strong>{draft.rootCode}</strong>
                  <small>
                    {draft.partNumber ?? "未帶入料號"} / {drawingNumber ?? "未帶入圖號"} / {formatDevelopmentPhaseForUser(draft.developmentPhase)}
                  </small>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ControlledHistoryPanel({
  entries,
  loading,
  onRefresh,
  onOpenEntry
}: {
  entries: ControlledHistoryEntry[];
  loading: boolean;
  onRefresh: () => void;
  onOpenEntry: (entry: ControlledHistoryEntry) => void;
}) {
  const entityLabels: Record<ControlledHistoryEntry["entity_type"], string> = {
    submission: "正式圖面",
    numbering_part_number: "正式料號",
    numbering_drawing_number: "正式圖號",
    bom_release: "正式 BOM"
  };

  return (
    <details className="controlled-history-panel" data-controlled-history-surface="true">
      <summary>
        <span>
          <Archive size={16} aria-hidden="true" />
          受控歷史
        </span>
        <span className="metadata-badge">{loading ? "載入中" : `${entries.length} 筆`}</span>
      </summary>
      <div className="controlled-history-body">
        <div className="controlled-history-toolbar">
          <p>已作廢或被正式生命週期取代的資料只供追溯，不提供刪除或還原。</p>
          <button className="secondary-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={14} aria-hidden="true" />
            重新整理
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="empty compact-empty">目前沒有受控歷史資料。</div>
        ) : (
          <div className="table-wrap controlled-history-table-wrap">
            <table className="controlled-history-table">
              <thead>
                <tr>
                  <th>資料</th>
                  <th>
                    <StatusColumnHeader context="masterRecord" />
                  </th>
                  <th>作廢時間</th>
                  <th>責任鏈</th>
                  <th>原因</th>
                  <th>動作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-controlled-history-row={entry.entity_type}>
                    <td>
                      <strong className="identity-primary">{entry.display_code}</strong>
                      <div className="metadata-list">
                        <span className="metadata-badge">{entityLabels[entry.entity_type]}</span>
                        <span className="metadata-badge">{entry.secondary_code}</span>
                        <span className="metadata-value">{entry.title}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge Obsolete">{entry.result_label}</span>
                      <div className="metadata-list">
                        <span className="metadata-badge">{entry.stage_label}</span>
                        <span className="metadata-badge">受控追溯</span>
                      </div>
                    </td>
                    <td>
                      <span className="metadata-value">{formatNullableDate(entry.history_at)}</span>
                    </td>
                    <td>
                      <div className="metadata-list vertical">
                        <span className="metadata-pair">
                          <span className="metadata-label">申請</span>
                          <span className="metadata-value">{entry.requested_by_name ?? "-"}</span>
                        </span>
                        <span className="metadata-pair">
                          <span className="metadata-label">審核</span>
                          <span className="metadata-value">{entry.reviewed_by_name ?? "-"}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="controlled-history-reason">{entry.history_reason}</span>
                      {entry.decision_reason ? <small>決策：{entry.decision_reason}</small> : null}
                    </td>
                    <td>
                      {entry.entity_type === "submission" ? (
                        <button className="secondary-button" type="button" onClick={() => onOpenEntry(entry)}>
                          <Eye size={14} aria-hidden="true" />
                          查看追溯
                        </button>
                      ) : (
                        <span className="metadata-badge">責任鏈已列出</span>
                      )}
                      <span
                        className="sr-only"
                        data-controlled-history-actions={`delete:${entry.actions.delete};restore:${entry.actions.restore};obsolete:${entry.actions.obsolete}`}
                      >
                        受控歷史不提供刪除、還原或再次作廢。
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function formatNullableDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function dedupeNumberingDrafts(drafts: NumberingDraftRecord[]) {
  const byRoot = new Map<string, NumberingDraftRecord>();
  for (const draft of drafts) {
    const current = byRoot.get(draft.rootCode);
    if (!current) {
      byRoot.set(draft.rootCode, draft);
      continue;
    }
    const currentScore = (current.partNumber ? 1 : 0) + (current.drawingNumber ?? current.primaryDrawingNumber ? 1 : 0);
    const nextScore = (draft.partNumber ? 1 : 0) + (draft.drawingNumber ?? draft.primaryDrawingNumber ? 1 : 0);
    if (nextScore > currentScore) byRoot.set(draft.rootCode, draft);
  }
  return Array.from(byRoot.values());
}

function parseFileRoles(submission: SubmissionSummary) {
  return new Set((submission.file_roles ?? "").split(",").filter(Boolean));
}

function getBomLineState(line: BomLine) {
  if (!line.child_submission_id) return { className: "missing", label: "缺件" };
  if (line.child_status !== "Released") return { className: "not-released", label: line.child_status ? formatStatusForUser(line.child_status, "submission") : "未發布" };
  if (
    line.child_latest_released_revision &&
    line.child_submission_revision &&
    line.child_latest_released_revision !== line.child_submission_revision
  ) {
    return { className: "outdated", label: `舊版；最新版 ${line.child_latest_released_revision}` };
  }
  return { className: "released", label: "已發布" };
}

function getWhereUsedState(entry: WhereUsedEntry) {
  if (!entry.child_submission_id) return { className: "missing", label: "缺件" };
  if (entry.child_status !== "Released") return { className: "not-released", label: entry.child_status ? formatStatusForUser(entry.child_status, "submission") : "未發布" };
  if (entry.child_is_outdated && entry.child_latest_released_revision) {
    return { className: "outdated", label: `受影響；最新版 ${entry.child_latest_released_revision}` };
  }
  return { className: "released", label: "已發布" };
}

function readStringList(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readRecentDrawings() {
  return readDrawingList(recentDrawingsStorageKey);
}

function readFavoriteDrawings() {
  return readDrawingList(favoriteDrawingsStorageKey);
}

function savedFinderSearchesStorageKey(userId: string) {
  return `${savedFinderSearchesStoragePrefix}.${userId}`;
}

function readSavedFinderSearches(userId: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(savedFinderSearchesStorageKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): SavedFinderSearch | null => {
        if (!item || typeof item !== "object") return null;
        const value = item as Partial<SavedFinderSearch>;
        if (!value.id || !value.name || typeof value.name !== "string") return null;
        return {
          id: String(value.id),
          name: value.name,
          query: typeof value.query === "string" ? value.query : "",
          status: isSubmissionStatusOrAll(value.status) ? value.status : "All",
          filters: normalizeFinderFilters(value.filters),
          created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString()
        };
      })
      .filter((item): item is SavedFinderSearch => Boolean(item))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function normalizeFinderFilters(value: unknown): FinderFilters {
  if (!value || typeof value !== "object") return emptyFinderFilters;
  const source = value as Partial<Record<keyof FinderFilters, unknown>>;
  return Object.fromEntries(
    finderFilterConfigs.map((filter) => {
      const rawValue = source[filter.key];
      if (filter.key === "bomIssue") return [filter.key, isBomIssueFilter(rawValue) ? rawValue : ""];
      return [filter.key, typeof rawValue === "string" ? String(rawValue) : ""];
    })
  ) as FinderFilters;
}

function isBomIssueFilter(value: unknown): value is FinderFilters["bomIssue"] {
  return value === "" || value === "unreleased" || value === "outdated";
}

function isSubmissionStatusOrAll(value: unknown): value is SubmissionStatus | "All" {
  return value === "All" || value === "Pending" || value === "Releasing" || value === "Released" || value === "Rejected" || value === "ReleaseFailed";
}

function readDrawingList(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is RecentDrawing => Boolean(item?.id && item?.drawing_number && item?.revision))
      : [];
  } catch {
    return [];
  }
}

function toRecentDrawing(submission: SubmissionSummary | SubmissionDetail): RecentDrawing {
  return {
    id: submission.id,
    drawing_number: submission.drawing_number,
    part_number: submission.part_number,
    part_name: submission.part_name,
    revision: submission.revision,
    updated_at: submission.updated_at
  };
}

const roleLabels = {
  Engineer: "工程師",
  "R&D Manager": "研發主管",
  Admin: "系統管理員"
} as const;

const sourceTypeLabels = {
  submission: "送審資料",
  metric: "統計資料",
  policy: "管理辦法",
  file: "檔案"
} as const;

const bomDiffLabels = {
  added: "新增",
  removed: "移除",
  changed: "變更",
  unchanged: "未變"
} as const;

function describeBomDiffLine(line: BomDiffResult["lines"][number]) {
  const revisionChanged = (line.from_revision ?? "") !== (line.to_revision ?? "");
  const quantityChanged = (line.from_quantity ?? "") !== (line.to_quantity ?? "");
  if (line.change_type === "added") return "新增子件";
  if (line.change_type === "removed") return "刪除子件";
  if (revisionChanged && quantityChanged) return "版次與數量變更";
  if (revisionChanged) return "版次變更";
  if (quantityChanged) return "數量變更";
  return "未變更";
}

const emptyNotificationSummary: NotificationSummary = {
  total: 0,
  critical: 0,
  warning: 0,
  info: 0
};

type CurrentUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: "Engineer" | "R&D Manager" | "Admin";
};

  type StorageEvidenceDashboard = {
  source: {
    available: boolean;
    error: string | null;
    evidenceMarkdownPath: string | null;
  };
  run: {
    period: string;
    status: string;
    severity: "normal" | "warning" | "critical" | "unknown";
    generatedAt: string | null;
    suggestedExitCode: number;
  } | null;
  summary: {
    metadataObjectCount: number;
    metadataStorageGb: number;
    duplicateRecoverableBytes: number;
    missingLocalObjectCount: number;
    hashMismatchCount: number;
    orphanLocalFileCount: number;
    auditedEgressGb: number;
    publicShareEgressBytes: number;
  } | null;
  readiness: {
    migrationReady: boolean;
    blockers: string[];
    warnings: string[];
  } | null;
    thresholdUsage: {
      storage: { includedGb: number; usageRatio: number } | null;
      egress: { includedGb: number; usageRatio: number } | null;
    };
    governance: {
      level: "stable" | "observe" | "review" | "control" | "blocked";
      label: string;
      reason: string;
      storageUsageRatio: number | null;
      egressUsageRatio: number | null;
      providerMigrationAllowed: boolean;
      lifecycleCleanupAllowed: boolean;
      alternateProviderReviewRecommended: boolean;
      nextReviewTrigger: string;
    } | null;
    recommendationCount: number;
    nextActions: string[];
  };

function formatStorageGb(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value === 0) return "0 GB";
  if (value < 0.01) return `${value.toFixed(6)} GB`;
  if (value < 1) return `${value.toFixed(3)} GB`;
  return `${value.toFixed(2)} GB`;
}

function formatByteSavings(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUsageRatio(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function StorageEvidencePanel({
  evidence,
  loading,
  onRefresh
}: {
  evidence: StorageEvidenceDashboard | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const severity = evidence?.run?.severity ?? (evidence?.source.available === false ? "warning" : "unknown");
  const severityClass = severity === "critical" ? "critical" : severity === "warning" ? "warning" : "normal";
  const blockerCount = evidence?.readiness?.blockers.length ?? 0;
  const warningCount = evidence?.readiness?.warnings.length ?? 0;
  const statusLabel = evidence?.run ? `${evidence.run.period} / ${formatStatusForUser(evidence.run.status, "fileSync")}` : evidence?.source.available === false ? "缺少證據" : "尚未載入";
  const primaryAction = evidence?.nextActions[0] ?? "執行每月儲存證據工作。";

  return (
    <section className={`panel storage-evidence-panel ${severityClass}`} aria-label="儲存成本證據">
      <div className="panel-header">
        <h2>
          <Archive size={16} aria-hidden="true" /> 儲存證據
        </h2>
        <div className="storage-evidence-actions">
          <span className={`metadata-badge storage-evidence-status ${severityClass}`}>{statusLabel}</span>
          <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} title="重新整理儲存證據" aria-label="重新整理儲存證據">
            <RefreshCcw size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {!evidence || !evidence.source.available ? (
        <NextStepState
          compact
          eyebrow="儲存證據"
          title={loading ? "正在載入每月證據" : "每月證據尚未完成"}
          body={loading ? "正在讀取最新受控儲存證據。" : primaryAction}
        />
      ) : (
        <div className="storage-evidence-body">
          <div className="storage-evidence-metrics" aria-label="儲存證據指標">
            <span className="compact-summary-item">
              <strong>{formatStorageGb(evidence.summary?.metadataStorageGb)}</strong>
              <span>中繼資料儲存</span>
            </span>
            <span className="compact-summary-item">
              <strong>{formatStorageGb(evidence.summary?.auditedEgressGb)}</strong>
              <span>已稽核流量</span>
            </span>
            <span className={blockerCount > 0 ? "compact-summary-item compact-summary-danger" : "compact-summary-item"}>
              <strong>{blockerCount}</strong>
              <span>阻擋</span>
            </span>
            <span className={warningCount > 0 ? "compact-summary-item compact-summary-warning" : "compact-summary-item"}>
              <strong>{warningCount}</strong>
              <span>注意</span>
            </span>
            <span className="compact-summary-item">
              <strong>{formatUsageRatio(evidence.thresholdUsage.storage?.usageRatio)}</strong>
              <span>儲存門檻</span>
            </span>
            <span className="compact-summary-item">
              <strong>{formatByteSavings(evidence.summary?.duplicateRecoverableBytes)}</strong>
              <span>可回收重複資料</span>
            </span>
          </div>
            <div className="storage-evidence-lists">
              <div>
                <span className="metadata-label">Next action</span>
                <strong>{primaryAction}</strong>
              </div>
              <div>
                <span className="metadata-label">Governance</span>
                <strong>{evidence.governance?.label ?? "Not classified"}</strong>
                <small>{evidence.governance?.nextReviewTrigger ?? "Run monthly storage evidence job."}</small>
              </div>
              <div className="metadata-list" aria-label="Storage evidence health">
              <span className="metadata-pair">
                <span className="metadata-label">Objects</span>
                <span className="metadata-value">{evidence.summary?.metadataObjectCount ?? 0}</span>
              </span>
              <span className="metadata-pair">
                <span className="metadata-label">Missing local</span>
                <span className="metadata-value">{evidence.summary?.missingLocalObjectCount ?? 0}</span>
              </span>
              <span className="metadata-pair">
                <span className="metadata-label">Hash mismatch</span>
                <span className="metadata-value">{evidence.summary?.hashMismatchCount ?? 0}</span>
              </span>
                <span className="metadata-pair">
                  <span className="metadata-label">Public share bytes</span>
                  <span className="metadata-value">{formatByteSavings(evidence.summary?.publicShareEgressBytes)}</span>
                </span>
                <span className="metadata-pair">
                  <span className="metadata-label">Provider review</span>
                  <span className="metadata-value">{evidence.governance?.alternateProviderReviewRecommended ? "Yes" : "No"}</span>
                </span>
              </div>
            </div>
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailRequestIdRef = useRef(0);
  const notificationDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const conditionFilterDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const submissionTableWrapRef = useRef<HTMLDivElement | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeConditionFilters, setActiveConditionFilters] = useState<ConditionFilter[]>([]);
  const [finderFilters, setFinderFilters] = useState<FinderFilters>(emptyFinderFilters);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentDrawings, setRecentDrawings] = useState<RecentDrawing[]>([]);
  const [favoriteDrawings, setFavoriteDrawings] = useState<RecentDrawing[]>([]);
  const [savedFinderSearches, setSavedFinderSearches] = useState<SavedFinderSearch[]>([]);
  const [savedFinderSearchName, setSavedFinderSearchName] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [controlledHistoryEntries, setControlledHistoryEntries] = useState<ControlledHistoryEntry[]>([]);
  const [controlledHistoryLoading, setControlledHistoryLoading] = useState(false);
  const [numberingDrafts, setNumberingDrafts] = useState<NumberingDraftRecord[]>([]);
  const [hasMoreSubmissions, setHasMoreSubmissions] = useState(false);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [isSubmissionTransitionPending, startSubmissionTransition] = useTransition();
  const [submissionTableScrollTop, setSubmissionTableScrollTop] = useState(0);
  const [submissionTableViewportHeight, setSubmissionTableViewportHeight] = useState(640);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { drawerWidth: detailDrawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-dashboard-detail-drawer-width" });
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [detailLayerOpen, setDetailLayerOpen] = useState({ engineering: false, collaboration: false });
  const [detailResourcesLoaded, setDetailResourcesLoaded] = useState<Record<DetailResourceGroup, boolean>>({ ...emptyDetailResourceFlags });
  const [detailResourceLoading, setDetailResourceLoading] = useState<Record<DetailResourceGroup, boolean>>({ ...emptyDetailResourceFlags });
  const [revisionHistory, setRevisionHistory] = useState<ItemRevisionHistoryEntry[]>([]);
  const [bomDiff, setBomDiff] = useState<BomDiffResult | null>(null);
  const [bomDiffMessage, setBomDiffMessage] = useState("");
  const [aiSummary, setAiSummary] = useState<AiSubmissionSummary | null>(null);
  const [aiRiskReport, setAiRiskReport] = useState<AiRiskReport | null>(null);
  const [reuseCandidates, setReuseCandidates] = useState<DesignReuseCandidate[]>([]);
  const [duplicateGeometryCandidates, setDuplicateGeometryCandidates] = useState<DuplicateGeometryCandidate[]>([]);
  const [whereUsed, setWhereUsed] = useState<WhereUsedEntry[]>([]);
  const [discussionComments, setDiscussionComments] = useState<DiscussionComment[]>([]);
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionFileId, setDiscussionFileId] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueFileId, setIssueFileId] = useState("");
  const [issueResolution, setIssueResolution] = useState<Record<string, string>>({});
  const [issueLoading, setIssueLoading] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [changeKind, setChangeKind] = useState<ChangeRequest["kind"]>("ECR");
  const [changeTitle, setChangeTitle] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [changeImpact, setChangeImpact] = useState("");
  const [changeDecision, setChangeDecision] = useState<Record<string, string>>({});
  const [changeLoading, setChangeLoading] = useState(false);
  const [phaseGateChecks, setPhaseGateChecks] = useState<PhaseGateCheck[]>([]);
  const [phaseGateLoading, setPhaseGateLoading] = useState(false);
  const [approvalMatrixRequirements, setApprovalMatrixRequirements] = useState<ApprovalMatrixRequirement[]>([]);
  const [approvalMatrixLoading, setApprovalMatrixLoading] = useState(false);
  const [pdfMarkups, setPdfMarkups] = useState<PdfMarkup[]>([]);
  const [markupFileId, setMarkupFileId] = useState("");
  const [markupPage, setMarkupPage] = useState("1");
  const [markupX, setMarkupX] = useState("50");
  const [markupY, setMarkupY] = useState("50");
  const [markupBody, setMarkupBody] = useState("");
  const [markupLoading, setMarkupLoading] = useState(false);
  const [readonlyShares, setReadonlyShares] = useState<ReadonlyShare[]>([]);
  const [supplierResponses, setSupplierResponses] = useState<SupplierPortalResponse[]>([]);
  const [procurementSyncRuns, setProcurementSyncRuns] = useState<ProcurementSyncRun[]>([]);
  const [procurementSyncTarget, setProcurementSyncTarget] = useState<ProcurementSyncRun["target_system"]>("procurement");
  const [shareLabel, setShareLabel] = useState("供應商 / 採購審閱");
  const [shareDays, setShareDays] = useState("14");
  const [lastShareUrl, setLastShareUrl] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [sandboxBranches, setSandboxBranches] = useState<SandboxBranch[]>([]);
  const [currentSandboxBranch, setCurrentSandboxBranch] = useState<SandboxBranch | null>(null);
  const [sandboxBranchName, setSandboxBranchName] = useState("原型試作");
  const [sandboxReason, setSandboxReason] = useState("工程試作分支");
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>(emptyNotificationSummary);
  const [storageEvidence, setStorageEvidence] = useState<StorageEvidenceDashboard | null>(null);
  const [storageEvidenceLoading, setStorageEvidenceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [obsoleteReason, setObsoleteReason] = useState("");
  const [obsoleteDecisionReason, setObsoleteDecisionReason] = useState("");
  const [obsoleteActionLoading, setObsoleteActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "可詢問審核中清單、統計數字、目前送審內容，或 PDM 圖號/料號/版次規則。" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const canReview = currentUser?.role === "R&D Manager" || currentUser?.role === "Admin";
  const canCheckout = currentUser?.role === "Engineer" || currentUser?.role === "Admin";
  const activeFinderFilterCount = finderFilterConfigs.filter((filter) => finderFilters[filter.key].trim()).length;
  const visibleSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      if (activeConditionFilters.includes("my") && submission.submitted_by !== currentUser?.id) return false;
      if (activeConditionFilters.includes("locked") && !submission.has_active_lock) return false;
      if (activeConditionFilters.includes("missing_handoff")) {
        const roles = parseFileRoles(submission);
        if (roles.has("pdf") && roles.has("dwg") && (submission.status !== "Released" || submission.has_release_package)) return false;
      }
      return true;
    });
  }, [activeConditionFilters, currentUser?.id, submissions]);
  const autocompleteSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 1) return [];
    return submissions
      .filter((submission) =>
        [
          submission.drawing_number,
          submission.part_number,
          submission.part_name,
          submission.revision,
          submission.material,
          submission.surface_finish,
          submission.document_type,
          submission.status,
          submission.submitted_by_name
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 6);
  }, [searchQuery, submissions]);
  const selectedSummary = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? (detail?.id === selectedId ? detail : null),
    [detail, selectedId, submissions]
  );
  const pendingSubmissionObsoleteRequest = useMemo<SubmissionLifecycleRequest | null>(() => {
    return detail?.lifecycle_requests.find((request) => request.action_code === "obsolete_submission" && request.request_status === "pending") ?? null;
  }, [detail?.lifecycle_requests]);
  const isDetailLoading = Boolean(loadingDetailId);
  const virtualTable = useMemo(() => {
    const visibleCount = Math.ceil(submissionTableViewportHeight / virtualRowHeight) + virtualOverscan * 2;
    const startIndex = Math.max(Math.floor(submissionTableScrollTop / virtualRowHeight) - virtualOverscan, 0);
    const endIndex = Math.min(startIndex + visibleCount, visibleSubmissions.length);
    return {
      rows: visibleSubmissions.slice(startIndex, endIndex),
      topHeight: startIndex * virtualRowHeight,
      bottomHeight: Math.max(visibleSubmissions.length - endIndex, 0) * virtualRowHeight,
      renderedCount: Math.max(endIndex - startIndex, 0)
    };
  }, [submissionTableScrollTop, submissionTableViewportHeight, visibleSubmissions]);

  const loadMe = useCallback(async () => {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      setCurrentUser(null);
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    const data = await response.json();
    setCurrentUser(data.user);
    setAuthChecked(true);
  }, []);

  const loadSubmissions = useCallback(async (nextStatus: SubmissionStatus | "All", query = "", filters: FinderFilters = emptyFinderFilters) => {
    setLoading(true);
    const trimmedQuery = query.trim();
    const activeFinderFilters = finderFilterConfigs.filter((filter) => filters[filter.key].trim());
    const params = new URLSearchParams();
    if (nextStatus !== "All") params.set("status", nextStatus);
    if (trimmedQuery.length >= 2) params.set("q", trimmedQuery);
    for (const filter of activeFinderFilters) {
      params.set(filter.param, filters[filter.key].trim());
    }
    const endpoint = trimmedQuery.length >= 2 || activeFinderFilters.length > 0 ? "/api/search" : "/api/submissions";
    if (endpoint === "/api/submissions") {
      params.set("limit", String(submissionsPageSize));
      params.set("offset", "0");
    }
    const response = await fetch(`${endpoint}${params.toString() ? `?${params}` : ""}`);
    if (response.status === 401) {
      setCurrentUser(null);
      setSubmissions([]);
      setHasMoreSubmissions(false);
      setLoading(false);
      return;
    }
    const data = await response.json();
    const nextSubmissions = data.submissions ?? [];
    startSubmissionTransition(() => {
      setSubmissions(nextSubmissions);
      setHasMoreSubmissions(endpoint === "/api/submissions" ? Boolean(data.pagination?.hasMore) : false);
      setSelectedId((current) =>
        current && nextSubmissions.some((submission: SubmissionSummary) => submission.id === current) ? current : null
      );
    });
    setLoading(false);
  }, [startSubmissionTransition]);

  const loadMoreSubmissions = useCallback(async () => {
    if (loadingMoreSubmissions || !hasMoreSubmissions) return;
    const trimmedQuery = debouncedSearchQuery.trim();
    const activeFinderFilters = finderFilterConfigs.filter((filter) => finderFilters[filter.key].trim());
    if (trimmedQuery.length >= 2 || activeFinderFilters.length > 0) return;

    setLoadingMoreSubmissions(true);
    const params = new URLSearchParams();
    if (status !== "All") params.set("status", status);
    params.set("limit", String(submissionsPageSize));
    params.set("offset", String(submissions.length));
    const response = await fetch(`/api/submissions?${params}`);
    if (response.status === 401) {
      setCurrentUser(null);
      setSubmissions([]);
      setHasMoreSubmissions(false);
      setLoadingMoreSubmissions(false);
      return;
    }
    const data = await response.json();
    const nextSubmissions = data.submissions ?? [];
    startSubmissionTransition(() => {
      setSubmissions((current) => [...current, ...nextSubmissions]);
      setHasMoreSubmissions(Boolean(data.pagination?.hasMore));
    });
    setLoadingMoreSubmissions(false);
  }, [debouncedSearchQuery, finderFilters, hasMoreSubmissions, loadingMoreSubmissions, startSubmissionTransition, status, submissions.length]);

  const resetDetailSideState = useCallback(() => {
    setRevisionHistory([]);
    setBomDiff(null);
    setBomDiffMessage("");
    setAiSummary(null);
    setAiRiskReport(null);
    setReuseCandidates([]);
    setDuplicateGeometryCandidates([]);
    setWhereUsed([]);
    setDiscussionComments([]);
    setDiscussionBody("");
    setDiscussionFileId("");
    setReviewIssues([]);
    setIssueTitle("");
    setIssueDescription("");
    setIssueFileId("");
    setIssueResolution({});
    setChangeRequests([]);
    setChangeKind("ECR");
    setChangeTitle("");
    setChangeReason("");
    setChangeImpact("");
    setChangeDecision({});
    setPhaseGateChecks([]);
    setApprovalMatrixRequirements([]);
    setPdfMarkups([]);
    setMarkupFileId("");
    setMarkupPage("1");
    setMarkupX("50");
    setMarkupY("50");
    setMarkupBody("");
    setReadonlyShares([]);
    setSupplierResponses([]);
    setProcurementSyncRuns([]);
    setShareLabel("供應商 / 採購審閱");
    setShareDays("14");
    setLastShareUrl("");
    setSandboxBranches([]);
    setCurrentSandboxBranch(null);
    setSandboxBranchName("原型試作");
    setSandboxReason("工程試作分支");
    setObsoleteReason("");
    setObsoleteDecisionReason("");
    setDetailResourcesLoaded({ ...emptyDetailResourceFlags });
    setDetailResourceLoading({ ...emptyDetailResourceFlags });
  }, []);

  const loadDetail = useCallback(async (id: string | null) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    const isCurrentRequest = () => detailRequestIdRef.current === requestId && !controller.signal.aborted;

    try {
      if (!id) {
        setLoadingDetailId(null);
        setDetail(null);
        resetDetailSideState();
        return;
      }
      setLoadingDetailId(id);
      const response = await fetch(`/api/submissions/${id}`, { signal: controller.signal });
      if (!isCurrentRequest()) return;
      if (!response.ok) {
        setDetail(null);
        resetDetailSideState();
        return;
      }
      const data = await response.json();
      if (!isCurrentRequest()) return;
      setDetail(data.submission ?? null);
      resetDetailSideState();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
    } finally {
      if (detailAbortRef.current === controller) {
        detailAbortRef.current = null;
        setLoadingDetailId(null);
      }
    }
  }, [resetDetailSideState]);

  const fetchResourceJson = useCallback(async <T,>(requestId: number, url: string): Promise<T | null> => {
    const response = await fetch(url);
    if (detailRequestIdRef.current !== requestId || !response.ok) return null;
    const result = (await response.json()) as T;
    return detailRequestIdRef.current === requestId ? result : null;
  }, []);

  const loadEngineeringResources = useCallback(async (id = selectedId) => {
    if (!id || !detail || detail.id !== id || detailResourcesLoaded.engineering || detailResourceLoading.engineering) return;
    const requestId = detailRequestIdRef.current;
    const encodedPartNumber = encodeURIComponent(detail.part_number);
    setDetailResourceLoading((current) => ({ ...current, engineering: true }));
    try {
      const [diffData, whereUsedData, historyData] = await Promise.all([
        fetch(`/api/submissions/${id}/bom/diff`)
          .then(async (response) => {
            const result = await response.json().catch(() => ({}));
            if (detailRequestIdRef.current !== requestId) return null;
            if (!response.ok) {
              setBomDiffMessage(typeof result?.error === "string" ? result.error : "BOM diff 尚無可比較資料");
              return null;
            }
            return result as { diff?: BomDiffResult | null };
          })
          .catch(() => null),
        fetchResourceJson<{ whereUsed?: WhereUsedEntry[] }>(requestId, `/api/items/${encodedPartNumber}/where-used`),
        fetchResourceJson<{ revisions?: ItemRevisionHistoryEntry[] }>(requestId, `/api/items/${encodedPartNumber}/revisions`)
      ]);
      if (detailRequestIdRef.current !== requestId) return;
      setBomDiff(diffData?.diff ?? null);
      setWhereUsed(whereUsedData?.whereUsed ?? []);
      setRevisionHistory(historyData?.revisions ?? []);
      setDetailResourcesLoaded((current) => ({ ...current, engineering: true }));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailResourceLoading((current) => ({ ...current, engineering: false }));
      }
    }
  }, [detail, detailResourceLoading.engineering, detailResourcesLoaded.engineering, fetchResourceJson, selectedId]);

  const loadInsightResources = useCallback(async (id = selectedId) => {
    if (!id || detailResourcesLoaded.insights || detailResourceLoading.insights) return;
    const requestId = detailRequestIdRef.current;
    setDetailResourceLoading((current) => ({ ...current, insights: true }));
    try {
      const [summaryData, riskData, reuseData, duplicateGeometryData] = await Promise.all([
        fetchResourceJson<{ summary?: AiSubmissionSummary | null }>(requestId, `/api/submissions/${id}/ai-summary`),
        fetchResourceJson<{ report?: AiRiskReport | null }>(requestId, `/api/submissions/${id}/ai-risks`),
        fetchResourceJson<{ candidates?: DesignReuseCandidate[] }>(requestId, `/api/submissions/${id}/reuse-candidates`),
        fetchResourceJson<{ candidates?: DuplicateGeometryCandidate[] }>(requestId, `/api/submissions/${id}/duplicate-geometry`)
      ]);
      if (detailRequestIdRef.current !== requestId) return;
      setAiSummary(summaryData?.summary ?? null);
      setAiRiskReport(riskData?.report ?? null);
      setReuseCandidates(reuseData?.candidates ?? []);
      setDuplicateGeometryCandidates(duplicateGeometryData?.candidates ?? []);
      setDetailResourcesLoaded((current) => ({ ...current, insights: true }));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailResourceLoading((current) => ({ ...current, insights: false }));
      }
    }
  }, [detailResourceLoading.insights, detailResourcesLoaded.insights, fetchResourceJson, selectedId]);

  const loadCollaborationResources = useCallback(async (id = selectedId) => {
    if (!id || detailResourcesLoaded.collaboration || detailResourceLoading.collaboration) return;
    const requestId = detailRequestIdRef.current;
    setDetailResourceLoading((current) => ({ ...current, collaboration: true }));
    try {
      const [sandboxData, discussionData, issueData, changeData, phaseGateData, approvalMatrixData, markupData] = await Promise.all([
        fetchResourceJson<{ branches?: SandboxBranch[]; current_branch?: SandboxBranch | null }>(requestId, `/api/submissions/${id}/sandbox`),
        fetchResourceJson<{ comments?: DiscussionComment[] }>(requestId, `/api/submissions/${id}/discussions`),
        fetchResourceJson<{ issues?: ReviewIssue[] }>(requestId, `/api/submissions/${id}/issues`),
        fetchResourceJson<{ changes?: ChangeRequest[] }>(requestId, `/api/submissions/${id}/changes`),
        fetchResourceJson<{ checks?: PhaseGateCheck[] }>(requestId, `/api/submissions/${id}/phase-gates`),
        fetchResourceJson<{ requirements?: ApprovalMatrixRequirement[] }>(requestId, `/api/submissions/${id}/approval-matrix`),
        fetchResourceJson<{ markups?: PdfMarkup[] }>(requestId, `/api/submissions/${id}/pdf-markups`)
      ]);
      if (detailRequestIdRef.current !== requestId) return;
      setSandboxBranches(sandboxData?.branches ?? []);
      setCurrentSandboxBranch(sandboxData?.current_branch ?? null);
      setDiscussionComments(discussionData?.comments ?? []);
      setReviewIssues(issueData?.issues ?? []);
      setChangeRequests(changeData?.changes ?? []);
      setPhaseGateChecks(phaseGateData?.checks ?? []);
      setApprovalMatrixRequirements(approvalMatrixData?.requirements ?? []);
      setPdfMarkups(markupData?.markups ?? []);
      setDetailResourcesLoaded((current) => ({ ...current, collaboration: true }));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailResourceLoading((current) => ({ ...current, collaboration: false }));
      }
    }
  }, [detailResourceLoading.collaboration, detailResourcesLoaded.collaboration, fetchResourceJson, selectedId]);

  const loadHandoffResources = useCallback(async (id = selectedId) => {
    if (!id || detailResourcesLoaded.handoff || detailResourceLoading.handoff) return;
    if (!canReview || detail?.status !== "Released" || !detail.release_package) {
      setDetailResourcesLoaded((current) => ({ ...current, handoff: true }));
      return;
    }
    const requestId = detailRequestIdRef.current;
    setDetailResourceLoading((current) => ({ ...current, handoff: true }));
    try {
      const [shareData, supplierData, procurementSyncData] = await Promise.all([
        fetchResourceJson<{ shares?: ReadonlyShare[] }>(requestId, `/api/submissions/${id}/shares`),
        fetchResourceJson<{ responses?: SupplierPortalResponse[] }>(requestId, `/api/submissions/${id}/supplier-responses`),
        fetchResourceJson<{ runs?: ProcurementSyncRun[] }>(requestId, `/api/integrations/procurement/sync-runs?submissionId=${encodeURIComponent(id)}`)
      ]);
      if (detailRequestIdRef.current !== requestId) return;
      setReadonlyShares(shareData?.shares ?? []);
      setSupplierResponses(supplierData?.responses ?? []);
      setProcurementSyncRuns(procurementSyncData?.runs ?? []);
      setDetailResourcesLoaded((current) => ({ ...current, handoff: true }));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailResourceLoading((current) => ({ ...current, handoff: false }));
      }
    }
  }, [canReview, detail?.release_package, detail?.status, detailResourceLoading.handoff, detailResourcesLoaded.handoff, fetchResourceJson, selectedId]);

  useEffect(() => {
    if (!detail || !detailLayerOpen.engineering) return;
    loadEngineeringResources(detail.id).catch(console.error);
  }, [detail, detailLayerOpen.engineering, loadEngineeringResources]);

  useEffect(() => {
    if (!detail || !detailLayerOpen.collaboration) return;
    loadCollaborationResources(detail.id).catch(console.error);
    loadInsightResources(detail.id).catch(console.error);
    loadHandoffResources(detail.id).catch(console.error);
  }, [detail, detailLayerOpen.collaboration, loadCollaborationResources, loadHandoffResources, loadInsightResources]);

  const loadNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (response.status === 401) {
      setNotifications([]);
      setNotificationSummary(emptyNotificationSummary);
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    setNotifications(data.notifications ?? []);
    setNotificationSummary(data.summary ?? emptyNotificationSummary);
  }, []);

  const loadStorageEvidence = useCallback(async () => {
    setStorageEvidenceLoading(true);
    try {
      const response = await fetch("/api/storage/evidence");
      if (response.status === 401 || response.status === 403) {
        setStorageEvidence(null);
        return;
      }
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      setStorageEvidence(data);
    } finally {
      setStorageEvidenceLoading(false);
    }
  }, []);

  const loadNumberingDrafts = useCallback(async () => {
    const response = await fetch("/api/numbering/search?recordStatus=Draft&limit=8");
    if (response.status === 401 || response.status === 403) {
      setNumberingDrafts([]);
      return;
    }
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setNumberingDrafts(data.results ?? []);
  }, []);

  const loadControlledHistory = useCallback(async () => {
    setControlledHistoryLoading(true);
    try {
      const response = await fetch("/api/lifecycle/controlled-history?limit=50");
      if (response.status === 401 || response.status === 403) {
        setControlledHistoryEntries([]);
        return;
      }
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      setControlledHistoryEntries(Array.isArray(data.entries) ? data.entries : []);
    } finally {
      setControlledHistoryLoading(false);
    }
  }, []);

  const rememberSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || typeof window === "undefined") return;
    if (recentSearches[0] === trimmed) return;
    const next = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 6);
    window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next));
    setRecentSearches(next);
  }, [recentSearches]);

  const rememberDrawing = useCallback((submission: SubmissionSummary | SubmissionDetail) => {
    if (typeof window === "undefined") return;
    const entry = toRecentDrawing(submission);
    const current = readRecentDrawings();
    const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 6);
    window.localStorage.setItem(recentDrawingsStorageKey, JSON.stringify(next));
    setRecentDrawings(next);
  }, []);

  const toggleFavoriteDrawing = useCallback((submission: SubmissionSummary) => {
    if (typeof window === "undefined") return;
    const current = readFavoriteDrawings();
    const exists = current.some((item) => item.id === submission.id);
    const next = exists ? current.filter((item) => item.id !== submission.id) : [toRecentDrawing(submission), ...current].slice(0, 12);
    window.localStorage.setItem(favoriteDrawingsStorageKey, JSON.stringify(next));
    setFavoriteDrawings(next);
  }, []);

  function applyStatusFilter(nextStatus: SubmissionStatus | "All") {
    setSearchQuery("");
    setStatus(nextStatus);
    setSelectedId(null);
  }

  function updateFinderFilter(key: keyof FinderFilters, value: string) {
    const nextValue = key === "bomIssue" ? (isBomIssueFilter(value) ? value : "") : value;
    setFinderFilters((current) => ({ ...current, [key]: nextValue }));
    setSelectedId(null);
  }

  function toggleConditionFilter(nextFilter: ConditionFilter) {
    setActiveConditionFilters((current) =>
      current.includes(nextFilter) ? current.filter((item) => item !== nextFilter) : [...current, nextFilter]
    );
    setSelectedId(null);
  }

  function clearConditionFilters() {
    setActiveConditionFilters([]);
    setSelectedId(null);
  }

  function clearFinderFilters() {
    setFinderFilters(emptyFinderFilters);
    setSelectedId(null);
  }

  function saveFinderSearch() {
    if (!currentUser || typeof window === "undefined") return;
    const name = savedFinderSearchName.trim();
    if (!name) return;
    const entry: SavedFinderSearch = {
      id: `finder-${Date.now()}`,
      name,
      query: searchQuery.trim(),
      status,
      filters: finderFilters,
      created_at: new Date().toISOString()
    };
    const next = [entry, ...savedFinderSearches.filter((item) => item.name !== name)].slice(0, 12);
    window.localStorage.setItem(savedFinderSearchesStorageKey(currentUser.id), JSON.stringify(next));
    setSavedFinderSearches(next);
    setSavedFinderSearchName("");
  }

  function applySavedFinderSearch(entry: SavedFinderSearch) {
    setActiveConditionFilters([]);
    setStatus(entry.status);
    setSearchQuery(entry.query);
    setFinderFilters(entry.filters);
    setSelectedId(null);
  }

  function deleteSavedFinderSearch(id: string) {
    if (!currentUser || typeof window === "undefined") return;
    const next = savedFinderSearches.filter((item) => item.id !== id);
    window.localStorage.setItem(savedFinderSearchesStorageKey(currentUser.id), JSON.stringify(next));
    setSavedFinderSearches(next);
  }

  function openRecentSearch(query: string) {
    setActiveConditionFilters([]);
    setFinderFilters(emptyFinderFilters);
    setStatus("All");
    setSearchQuery(query);
  }

  function openRecentDrawing(drawing: RecentDrawing) {
    setActiveConditionFilters([]);
    setFinderFilters(emptyFinderFilters);
    setStatus("All");
    setSearchQuery(drawing.drawing_number);
    setSelectedId(drawing.id);
  }

  function chooseSuggestion(submission: SubmissionSummary) {
    setActiveConditionFilters([]);
    setFinderFilters(emptyFinderFilters);
    setStatus("All");
    setSearchQuery(submission.drawing_number);
    setSelectedId(submission.id);
    setSearchFocused(false);
  }

  async function openControlledHistoryEntry(entry: ControlledHistoryEntry) {
    if (entry.entity_type !== "submission") return;
    setActiveConditionFilters([]);
    setFinderFilters(emptyFinderFilters);
    setStatus("All");
    setSearchQuery("");
    setSelectedId(entry.target_id);
    await loadDetail(entry.target_id);
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function openChildSubmission(submissionId: string | null | undefined) {
    if (!submissionId) return;
    setSelectedId(submissionId);
    await loadDetail(submissionId);
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    loadMe().catch(console.error);
  }, [loadMe]);

  useEffect(() => {
    setRecentSearches(readStringList(recentSearchesStorageKey).slice(0, 6));
    setRecentDrawings(readRecentDrawings().slice(0, 6));
    setFavoriteDrawings(readFavoriteDrawings().slice(0, 12));
  }, []);

  useEffect(() => {
    setSavedFinderSearches(currentUser ? readSavedFinderSearches(currentUser.id) : []);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const submissionId = (params.get("submissionId") ?? params.get("submission_id") ?? "").trim();
    if (!submissionId) return;

    window.location.replace(`/submissions/${encodeURIComponent(submissionId)}`);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadSubmissions(status, debouncedSearchQuery, finderFilters).catch(console.error);
    }
  }, [currentUser, debouncedSearchQuery, finderFilters, loadSubmissions, status]);

  useEffect(() => {
    setSubmissionTableScrollTop(0);
    submissionTableWrapRef.current?.scrollTo({ top: 0 });
  }, [activeConditionFilters, debouncedSearchQuery, finderFilters, status]);

  useEffect(() => {
    const element = submissionTableWrapRef.current;
    if (!element) return;
    function updateViewportHeight() {
      setSubmissionTableViewportHeight(Math.max(element?.clientHeight ?? 640, virtualRowHeight));
    }
    updateViewportHeight();
    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, visibleSubmissions.length]);

  useEffect(() => {
    if (currentUser) {
      loadNotifications().catch(console.error);
      loadNumberingDrafts().catch(console.error);
      loadControlledHistory().catch(console.error);
    }
  }, [currentUser, loadControlledHistory, loadNotifications, loadNumberingDrafts]);

  useEffect(() => {
    if (canReview) {
      loadStorageEvidence().catch(console.error);
    } else {
      setStorageEvidence(null);
    }
  }, [canReview, loadStorageEvidence]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery("");
      return;
    }

    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 280);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => rememberSearch(trimmed), 500);
    return () => window.clearTimeout(timer);
  }, [rememberSearch, searchQuery]);

  useEffect(() => {
    setSelectedId((current) =>
      current &&
      (visibleSubmissions.some((submission) => submission.id === current) ||
        controlledHistoryEntries.some((entry) => entry.target_id === current) ||
        detail?.id === current)
        ? current
        : null
    );
  }, [controlledHistoryEntries, detail?.id, visibleSubmissions]);

  useEffect(() => {
    if (currentUser) {
      loadDetail(selectedId).catch(console.error);
    }
  }, [currentUser, loadDetail, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function closeDetailOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", closeDetailOnEscape);
    return () => window.removeEventListener("keydown", closeDetailOnEscape);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    function closeDetailOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-dashboard-submission-row='true']")) return;
      setSelectedId(null);
    }

    document.addEventListener("pointerdown", closeDetailOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeDetailOnOutsidePointer);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetailLayerOpen({ engineering: false, collaboration: false });
    }
  }, [selectedId]);

  useLayoutEffect(() => {
    if (selectedSummary) rememberDrawing(selectedSummary);
  }, [rememberDrawing, selectedSummary]);

  useEffect(() => {
    function closeNotificationDropdown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!notificationDropdownRef.current?.contains(target)) {
        notificationDropdownRef.current?.removeAttribute("open");
      }
      if (!conditionFilterDropdownRef.current?.contains(target)) {
        conditionFilterDropdownRef.current?.removeAttribute("open");
      }
    }

    document.addEventListener("pointerdown", closeNotificationDropdown);
    return () => document.removeEventListener("pointerdown", closeNotificationDropdown);
  }, []);

  const openNotification = useCallback(
    async (notification: NotificationItem) => {
      if (!notification.submission_id) return;

      setActiveConditionFilters([]);
      setStatus("All");
      setSelectedId(notification.submission_id);
      await loadDetail(notification.submission_id);
      requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [loadDetail]
  );

  async function runAction(action: "approve" | "reject") {
    if (!selectedId) return;
    setActionLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: action === "approve" ? "由審核工作台核准" : "由審核工作台駁回",
        reason: "由審核工作台駁回"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, action === "approve" ? "核准未完成" : "駁回未完成");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadControlledHistory();
    await loadDetail(selectedId);
    await loadNotifications();
    setActionLoading(false);
  }

  async function requestSubmissionObsolete() {
    if (!selectedId) return;
    const reason = obsoleteReason.trim();
    if (!reason) return;
    setObsoleteActionLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/obsolete-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "申請作廢未完成");
    } else {
      setObsoleteReason("");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadControlledHistory();
    await loadDetail(selectedId);
    await loadNotifications();
    setObsoleteActionLoading(false);
  }

  async function decideSubmissionObsolete(requestId: string, decision: "approve" | "reject") {
    if (!selectedId) return;
    setObsoleteActionLoading(true);
    const response = await fetch(`/api/submission-lifecycle-requests/${requestId}/${decision}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decisionReason: obsoleteDecisionReason.trim() || undefined })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "作廢審核未完成");
    } else {
      setObsoleteDecisionReason("");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadControlledHistory();
    await loadDetail(selectedId);
    await loadNotifications();
    setObsoleteActionLoading(false);
  }

  async function runCheckout(action: "lock" | "unlock") {
    if (!selectedId) return;
    setCheckoutLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/checkout`, {
      method: action === "lock" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: action === "lock" ? JSON.stringify({ reason: "工程編輯預約", hours: 8 }) : undefined
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "編輯預約未完成");
    }
    await loadDetail(selectedId);
    await loadNotifications();
    setCheckoutLoading(false);
  }

  async function createSandboxBranchFromDetail() {
    if (!selectedId) return;
    setSandboxLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/sandbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchName: sandboxBranchName.trim(),
        reason: sandboxReason.trim()
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "建立試作分支未完成");
    } else if (body.submissionId) {
      setSelectedId(body.submissionId);
      await loadSubmissions(status, debouncedSearchQuery, finderFilters);
      await loadDetail(body.submissionId);
    }
    setSandboxLoading(false);
  }

  async function updateSandboxBranch(branchId: string, action: "promote" | "close") {
    if (!selectedId) return;
    setSandboxLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/sandbox/${branchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "更新試作分支未完成");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadDetail(selectedId);
    setSandboxLoading(false);
  }

  async function mergeSandboxBranch(branchId: string) {
    if (!selectedId) return;
    setSandboxLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/sandbox/${branchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "merge" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "合併試作分支未完成");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadDetail(selectedId);
    setSandboxLoading(false);
  }

  async function createReadonlyShare() {
    if (!selectedId) return;
    setShareLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: shareLabel.trim(),
        days: Number(shareDays)
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "建立唯讀分享未完成");
    } else {
      setLastShareUrl(body.public_url ?? "");
      setReadonlyShares((items) => [body.share, ...items].filter(Boolean));
    }
    setShareLoading(false);
  }

  async function revokeReadonlyShare(shareId: string) {
    if (!selectedId) return;
    setShareLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revoked: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "撤銷唯讀分享未完成");
    } else if (body.share) {
      setReadonlyShares((items) => items.map((item) => (item.id === shareId ? body.share : item)));
      setLastShareUrl("");
    }
    setShareLoading(false);
  }

  async function closeSupplierResponse(responseId: string) {
    if (!selectedId) return;
    setShareLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/supplier-responses/${responseId}`, {
      method: "PATCH"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "關閉供應商回覆未完成");
    } else if (body.response) {
      setSupplierResponses((items) => items.map((item) => (item.id === responseId ? body.response : item)));
      await loadDetail(selectedId);
    }
    setShareLoading(false);
  }

  async function createProcurementSyncRun() {
    if (!selectedId) return;
    setShareLoading(true);
    const response = await fetch("/api/integrations/procurement/sync-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: selectedId,
        targetSystem: procurementSyncTarget
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "建立外部系統同步未完成");
    } else if (body.run) {
      setProcurementSyncRuns((items) => [body.run, ...items]);
    }
    setShareLoading(false);
  }

  async function acknowledgeProcurementSyncRun(runId: string) {
    setShareLoading(true);
    const response = await fetch(`/api/integrations/procurement/sync-runs/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", message: "已由 PDM 工作台確認" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "確認外部系統同步未完成");
    } else if (body.run) {
      setProcurementSyncRuns((items) => items.map((item) => (item.id === runId ? body.run : item)));
    }
    setShareLoading(false);
  }

  async function copyReadonlyShareUrl() {
    if (!lastShareUrl || !navigator.clipboard) return;
    await navigator.clipboard.writeText(lastShareUrl);
  }

  async function submitDiscussion() {
    if (!selectedId || !discussionBody.trim()) return;
    setDiscussionLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/discussions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: discussionBody.trim(),
        fileId: discussionFileId || undefined
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "新增討論留言未完成");
    } else {
      setDiscussionBody("");
      setDiscussionFileId("");
      setDiscussionComments((items) => [...items, body.comment].filter(Boolean));
    }
    setDiscussionLoading(false);
  }

  async function resolveDiscussion(commentId: string) {
    if (!selectedId) return;
    setDiscussionLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/discussions/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "結案討論未完成");
    } else if (body.comment) {
      setDiscussionComments((items) => items.map((item) => (item.id === commentId ? body.comment : item)));
    }
    setDiscussionLoading(false);
  }

  async function submitIssue() {
    if (!selectedId || !issueTitle.trim() || !issueDescription.trim()) return;
    setIssueLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: issueTitle.trim(),
        description: issueDescription.trim(),
        fileId: issueFileId || undefined
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "建立審核問題未完成");
    } else {
      setIssueTitle("");
      setIssueDescription("");
      setIssueFileId("");
      setReviewIssues((items) => [...items, body.issue].filter(Boolean));
    }
    setIssueLoading(false);
  }

  async function resolveIssue(issueId: string) {
    if (!selectedId) return;
    setIssueLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/issues/${issueId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resolved: true,
        resolution: issueResolution[issueId]?.trim() || "審核時已結案"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "結案審核問題未完成");
    } else if (body.issue) {
      setReviewIssues((items) => items.map((item) => (item.id === issueId ? body.issue : item)));
      setIssueResolution((current) => {
        const next = { ...current };
        delete next[issueId];
        return next;
      });
    }
    setIssueLoading(false);
  }

  async function submitChangeRequest() {
    if (!selectedId || !changeTitle.trim() || !changeReason.trim() || !changeImpact.trim()) return;
    setChangeLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/changes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: changeKind,
        title: changeTitle.trim(),
        reason: changeReason.trim(),
        impact: changeImpact.trim()
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "建立變更需求未完成");
    } else {
      setChangeTitle("");
      setChangeReason("");
      setChangeImpact("");
      setChangeRequests((items) => [...items, body.change].filter(Boolean));
    }
    setChangeLoading(false);
  }

  async function decideChangeRequest(changeId: string, action: "approve" | "reject" | "close") {
    if (!selectedId) return;
    setChangeLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/changes/${changeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        comment: changeDecision[changeId]?.trim() || `變更審查時${action === "approve" ? "核准" : action === "reject" ? "駁回" : "關閉"}`
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "更新變更決議未完成");
    } else if (body.change) {
      setChangeRequests((items) => items.map((item) => (item.id === changeId ? body.change : item)));
      setChangeDecision((current) => {
        const next = { ...current };
        delete next[changeId];
        return next;
      });
    }
    setChangeLoading(false);
  }

  async function initializePhaseGates() {
    if (!selectedId) return;
    setPhaseGateLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/phase-gates`, {
      method: "POST"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "啟用階段關卡未完成");
    } else {
      setPhaseGateChecks(body.checks ?? []);
    }
    setPhaseGateLoading(false);
  }

  async function decidePhaseGate(checkId: string, action: "complete" | "waive") {
    if (!selectedId) return;
    setPhaseGateLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/phase-gates/${checkId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        comment: `階段關卡審查時${action === "complete" ? "完成" : "豁免"}`
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "更新階段關卡未完成");
    } else if (body.check) {
      setPhaseGateChecks((items) => items.map((item) => (item.id === checkId ? body.check : item)));
    }
    setPhaseGateLoading(false);
  }

  async function initializeApprovalMatrix() {
    if (!selectedId) return;
    setApprovalMatrixLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/approval-matrix`, {
      method: "POST"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "啟用簽核矩陣未完成");
    } else {
      setApprovalMatrixRequirements(body.requirements ?? []);
    }
    setApprovalMatrixLoading(false);
  }

  async function waiveApprovalMatrixRequirement(requirementId: string) {
    if (!selectedId) return;
    setApprovalMatrixLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/approval-matrix/${requirementId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "waive",
        comment: "簽核矩陣審查時已豁免"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "更新簽核矩陣未完成");
    } else if (body.requirement) {
      setApprovalMatrixRequirements((items) => items.map((item) => (item.id === requirementId ? body.requirement : item)));
    }
    setApprovalMatrixLoading(false);
  }

  async function submitPdfMarkup() {
    if (!selectedId || !markupFileId || !markupBody.trim()) return;
    setMarkupLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/pdf-markups`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileId: markupFileId,
        pageNumber: Number(markupPage),
        xPercent: Number(markupX),
        yPercent: Number(markupY),
        body: markupBody.trim()
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "新增 PDF 標註未完成");
    } else {
      setMarkupBody("");
      setPdfMarkups((items) => [...items, body.markup].filter(Boolean));
    }
    setMarkupLoading(false);
  }

  async function resolvePdfMarkup(markupId: string) {
    if (!selectedId) return;
    setMarkupLoading(true);
    const response = await fetch(`/api/submissions/${selectedId}/pdf-markups/${markupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alertSubmissionActionError(body, "結案 PDF 標註未完成");
    } else if (body.markup) {
      setPdfMarkups((items) => items.map((item) => (item.id === markupId ? body.markup : item)));
    }
    setMarkupLoading(false);
  }

  async function submitChat() {
    const content = chatInput.trim();
    if (!content) return;
    setChatMessages((items) => [...items, { role: "user", content }]);
    setChatInput("");
    setChatLoading(true);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: content, context: { currentSubmissionId: selectedId } })
    });
    const body = await response.json().catch(() => ({}));
    setChatMessages((items) => [
      ...items,
      {
        role: "assistant",
        content: body.answer ?? "沒有取得回答。",
        sources: Array.isArray(body.sources) ? body.sources : []
      }
    ]);
    setChatLoading(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!authChecked) {
    return <div className="empty">正在檢查登入狀態...</div>;
  }

  if (!currentUser) {
    return (
      <section className="panel">
        <div className="empty">
          <h2>需要登入</h2>
          <p>請先登入後再查看審核工作台。</p>
          <div className="empty-actions">
            <a className="primary-button" href="/login">
              前往登入
            </a>
          </div>
        </div>
      </section>
    );
  }

  const platformWorkbenchSections = getPlatformWorkbenchSections({
    currentUser,
    notificationSummary,
    recentDrawings,
    favoriteDrawings
  });
  const lifecycleActiveStage: LifecycleStageId =
    currentUser.role === "Engineer" ? "submission" : currentUser.role === "R&D Manager" ? "review" : "gate";
  const lifecycleMetrics: LifecycleMetric[] = [
    { label: "草稿", value: numberingDrafts.length, tone: numberingDrafts.length > 0 ? "warning" : "neutral" },
    { label: "審核中", value: visibleSubmissions.filter((submission) => submission.status === "Pending").length, tone: "warning" },
    {
      label: "發行未完成",
      value: visibleSubmissions.filter((submission) => submission.status === "ReleaseFailed" && !submission.resolved_by_submission_id).length,
      tone: visibleSubmissions.some((submission) => submission.status === "ReleaseFailed" && !submission.resolved_by_submission_id)
        ? "critical"
        : "neutral"
    },
    { label: "已發布", value: visibleSubmissions.filter((submission) => submission.status === "Released").length, tone: "success" }
  ];
  const adaptiveTaskFeed = buildAdaptiveTaskFeed({
    role: currentUser.role,
    submissions: visibleSubmissions,
    notificationSummary,
    notifications,
    numberingDraftCount: numberingDrafts.length,
    storageEvidence: storageEvidence
      ? {
          available: storageEvidence.source.available,
          severity: storageEvidence.run?.severity ?? "unknown",
          blockerCount: storageEvidence.readiness?.blockers.length ?? 0,
          warningCount: storageEvidence.readiness?.warnings.length ?? 0,
          migrationReady: storageEvidence.readiness?.migrationReady ?? false
        }
      : null,
    limit: 5
  });
  const canRequestSubmissionObsolete =
    Boolean(detail && detail.status === "Released" && !pendingSubmissionObsoleteRequest) &&
    (currentUser.role === "Engineer" || currentUser.role === "R&D Manager" || currentUser.role === "Admin");
  const canReviewSubmissionObsolete = Boolean(pendingSubmissionObsoleteRequest && canReview);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>PDM 圖面資料庫</h1>
          <p>快速查找圖號、料號、版次、正式檔案與製造交接資料。</p>
          <p>
            目前登入：{currentUser.display_name}（{roleLabels[currentUser.role]}）
          </p>
        </div>
        <div className="actions">
          <Link className="secondary-button" href="/handoff" title="製造交接">
            <Factory size={16} aria-hidden="true" />
            製造交接
          </Link>
          <button
            className="secondary-button"
            onClick={() => {
              loadSubmissions(status, debouncedSearchQuery, finderFilters).catch(console.error);
              loadControlledHistory().catch(console.error);
              loadNotifications().catch(console.error);
              if (canReview) loadStorageEvidence().catch(console.error);
            }}
            disabled={loading}
            title="重新整理"
          >
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
          <button className="secondary-button" onClick={logout} title="登出">
            <LogOut size={16} aria-hidden="true" />
            登出
          </button>
        </div>
      </div>

      <LifecycleMap activeStage={lifecycleActiveStage} roleLabel={roleLabels[currentUser.role]} metrics={lifecycleMetrics} />

      <AdaptiveTaskFeedPanel tasks={adaptiveTaskFeed} />

      {currentUser.role === "Engineer" || currentUser.role === "Admin" ? (
        <NumberingDraftWorkbench drafts={numberingDrafts} />
      ) : null}

      <section className="platform-workbench" aria-label="AI PDM multi-role workbench">
        <div className="platform-workbench-header">
          <div>
            <span className="section-label">多角色工作台</span>
            <h2>依任務、物件與阻塞決定下一步</h2>
            <p>從待辦、建立、追蹤、交接與角色建議進入，不再依賴功能清單記憶。</p>
          </div>
          <div className="platform-workbench-meta">
            <span className="metadata-badge">目前視角：{roleLabels[currentUser.role]}</span>
            <span className="metadata-badge">{visibleSubmissions.length} 筆目前清單</span>
          </div>
        </div>
        <div className="platform-workbench-grid">
          {platformWorkbenchSections.map((section) => {
            const Icon = section.icon;
            return (
              <article className="platform-workbench-card" key={section.title}>
                <div className="platform-workbench-card-header">
                  <span className="workbench-card-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="metadata-badge">{section.badge}</span>
                    <h3>{section.title}</h3>
                  </div>
                </div>
                <p>{section.description}</p>
                <div className="workbench-link-list">
                  {section.links.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                      <Link className="workbench-link" href={link.href} key={`${section.title}-${link.href}-${link.label}`}>
                        <LinkIcon size={15} aria-hidden="true" />
                        <span>
                          <strong>{link.label}</strong>
                          <small>{link.detail}</small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ControlledHistoryPanel
        entries={controlledHistoryEntries}
        loading={controlledHistoryLoading}
        onRefresh={() => {
          loadControlledHistory().catch(console.error);
        }}
        onOpenEntry={(entry) => {
          openControlledHistoryEntry(entry).catch(console.error);
        }}
      />

      <FinderToolbar>
      <section className="finder-summary-row" aria-label="找圖與摘要">
        <section className="search-bar primary-search" aria-label="PDM search">
          <Search size={22} aria-hidden="true" />
          <input
            value={searchQuery}
            placeholder="搜尋圖號、料號、品名、版次、材質、檔名、狀態或提交者"
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
          />
          {searchQuery.trim() ? (
            <button className="secondary-button" type="button" onClick={() => setSearchQuery("")}>
              清除
            </button>
          ) : null}
        </section>

        <NotificationDropdown
          notificationDropdownRef={notificationDropdownRef}
          notificationSummary={notificationSummary}
          notifications={notifications}
          onOpenNotification={(notification) => {
            openNotification(notification).catch(console.error);
          }}
        />
      </section>
      {searchFocused && autocompleteSuggestions.length > 0 ? (
        <section className="search-suggestions" aria-label="搜尋建議">
          {autocompleteSuggestions.map((submission) => (
            <button
              type="button"
              key={submission.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseSuggestion(submission)}
            >
              <strong className="identity-line">
                <span className="identity-primary">{submission.drawing_number}</span>
                <span className="metadata-badge">版次 {submission.revision}</span>
                <StatusBadge status={submission.status} context="submission" />
              </strong>
              <span className="metadata-list">
                <span className="metadata-pair">
                  <span className="metadata-label">料號</span>
                  <span className="metadata-value">{submission.part_number}</span>
                </span>
                <span className="metadata-pair">
                  <span className="metadata-label">品名</span>
                  <span className="metadata-value">{submission.part_name}</span>
                </span>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="quick-access" aria-label="找圖快速入口">
        <div className="filter-groups">
          <div className="filter-group status-filter-group" aria-label="狀態切換器">
            <span className="filter-group-label">狀態</span>
            <div className="quick-filter-list status-tabs">
              {statusFilters.map((filter) => (
                <button
                  className={status === filter.status ? "quick-chip active" : "quick-chip"}
                  type="button"
                  key={filter.status}
                  onClick={() => applyStatusFilter(filter.status)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <details className="filter-menu condition-filter-menu" ref={conditionFilterDropdownRef}>
            <summary className={activeConditionFilters.length > 0 ? "filter-menu-button active" : "filter-menu-button"}>
              <Filter size={14} aria-hidden="true" />
              篩選
              {activeConditionFilters.length > 0 ? <span>{activeConditionFilters.length}</span> : null}
            </summary>
            <div className="filter-menu-panel">
              <strong>可疊加條件</strong>
              {conditionFilters.map((filter) => (
                <label className="checkbox-filter" key={filter.key}>
                  <input
                    type="checkbox"
                    checked={activeConditionFilters.includes(filter.key)}
                    onChange={() => toggleConditionFilter(filter.key)}
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
              <button
                className="filter-clear-button"
                type="button"
                disabled={activeConditionFilters.length === 0}
                onClick={clearConditionFilters}
              >
                清除篩選
              </button>
            </div>
          </details>
          <details className="filter-menu finder-filter-menu">
            <summary className={activeFinderFilterCount > 0 ? "filter-menu-button active" : "filter-menu-button"}>
              <Search size={14} aria-hidden="true" />
              進階搜尋
              {activeFinderFilterCount > 0 ? <span>{activeFinderFilterCount}</span> : null}
            </summary>
            <div className="filter-menu-panel finder-filter-panel">
              <strong>自訂條件</strong>
              <div className="finder-filter-grid">
                {finderFilterConfigs.map((filter) => (
                  <label className="finder-filter-field" key={filter.key}>
                    <span>{filter.label}</span>
                    {filter.type === "select" ? (
                      <select value={finderFilters[filter.key]} onChange={(event) => updateFinderFilter(filter.key, event.target.value)}>
                        {filter.options?.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={finderFilters[filter.key]}
                        onChange={(event) => updateFinderFilter(filter.key, event.target.value)}
                        placeholder={filter.label}
                      />
                    )}
                  </label>
                ))}
              </div>
              <button
                className="filter-clear-button"
                type="button"
                disabled={activeFinderFilterCount === 0}
                onClick={clearFinderFilters}
              >
                清除進階搜尋
              </button>
              <div className="saved-finder-controls">
                <label className="finder-filter-field">
                  <span>常用條件名稱</span>
                  <input
                    aria-label="Saved finder search name"
                    value={savedFinderSearchName}
                    onChange={(event) => setSavedFinderSearchName(event.target.value)}
                    placeholder="輸入名稱"
                  />
                </label>
                <button className="filter-clear-button" type="button" disabled={!savedFinderSearchName.trim()} onClick={saveFinderSearch}>
                  儲存常用條件
                </button>
                {savedFinderSearches.length > 0 ? (
                  <div className="saved-finder-list">
                    {savedFinderSearches.map((entry) => (
                      <div className="saved-finder-item" key={entry.id}>
                        <button type="button" onClick={() => applySavedFinderSearch(entry)}>
                          {entry.name}
                        </button>
                        <button className="icon-button" type="button" aria-label={`刪除常用條件 ${entry.name}`} onClick={() => deleteSavedFinderSearch(entry.id)}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
                </div>
              </details>

        </div>
        <div className="recent-access">
          <div>
            <span>最近搜尋</span>
            <select
              className="dropdown-select recent-select"
              aria-label="最近搜尋"
              value=""
              disabled={recentSearches.length === 0}
              onChange={(event) => {
                if (event.target.value) openRecentSearch(event.target.value);
              }}
            >
              <option value="">{recentSearches.length === 0 ? "尚無紀錄" : "選擇紀錄"}</option>
              {recentSearches.map((query) => (
                <option value={query} key={query}>
                  {query}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span>最近瀏覽</span>
            <select
              className="dropdown-select recent-select"
              aria-label="最近瀏覽"
              value=""
              disabled={recentDrawings.length === 0}
              onChange={(event) => {
                const drawing = recentDrawings.find((item) => item.id === event.target.value);
                if (drawing) openRecentDrawing(drawing);
              }}
            >
              <option value="">{recentDrawings.length === 0 ? "尚無紀錄" : "選擇圖面"}</option>
              {recentDrawings.map((drawing) => (
                <option value={drawing.id} key={drawing.id}>
                  {drawing.drawing_number} 版次 {drawing.revision}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span>常用圖面</span>
            <select
              className="dropdown-select recent-select"
              aria-label="常用圖面"
              value=""
              disabled={favoriteDrawings.length === 0}
              onChange={(event) => {
                const drawing = favoriteDrawings.find((item) => item.id === event.target.value);
                if (drawing) openRecentDrawing(drawing);
              }}
            >
              <option value="">{favoriteDrawings.length === 0 ? "尚無收藏" : "選擇常用圖面"}</option>
              {favoriteDrawings.map((drawing) => (
                <option value={drawing.id} key={drawing.id}>
                  {drawing.drawing_number} 版次 {drawing.revision}
                </option>
              ))}
            </select>
            {favoriteDrawings.length > 0 ? (
              <div className="quick-chip-list">
                {favoriteDrawings.map((drawing) => (
                  <button className="quick-chip" type="button" key={drawing.id} onClick={() => openRecentDrawing(drawing)}>
                    {drawing.drawing_number} Rev {drawing.revision}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      </FinderToolbar>

      {canReview ? (
        <StorageEvidencePanel
          evidence={storageEvidence}
          loading={storageEvidenceLoading}
          onRefresh={() => {
            loadStorageEvidence().catch(console.error);
          }}
        />
      ) : null}

      <div className={selectedId ? "grid detail-focus-mode" : "grid"}>
        <SubmissionTable
          loading={loading}
          visibleSubmissions={visibleSubmissions}
          virtualTable={virtualTable}
          selectedId={selectedId}
          favoriteDrawings={favoriteDrawings}
          submissionTableWrapRef={submissionTableWrapRef}
          isSubmissionTransitionPending={isSubmissionTransitionPending}
          hasMoreSubmissions={hasMoreSubmissions}
          loadingMoreSubmissions={loadingMoreSubmissions}
          formatFileAvailability={formatFileAvailability}
          latestActivityAt={latestActivityAt}
          onScrollTopChange={setSubmissionTableScrollTop}
          onSelect={setSelectedId}
          onToggleFavorite={toggleFavoriteDrawing}
          onLoadMore={() => {
            loadMoreSubmissions().catch(console.error);
          }}
        />

        {selectedId ? (
          <SubmissionDetailPanel
            detailPanelRef={detailPanelRef}
            drawerWidth={detailDrawerWidth}
            isDetailLoading={isDetailLoading}
            selectedSummary={selectedSummary}
            onClose={() => setSelectedId(null)}
            onStartResize={startDrawerResize}
          >
          {detail ? (
            <div className="detail">
              <section className="detail-workflow-layer detail-quick-actions" aria-label="快速動作">
                <div>
                  <span className="section-label">快速動作</span>
                  <strong>檔案與發布包</strong>
                  <small>{detail.files.length} 個檔案可操作</small>
                </div>
                <RevisionPackageReviewWarningCard detail={detail} />
                {detail.status === "Pending" ? (
                  <div className="review-decision-card">
                    <div>
                      <span className="section-label">審核決策</span>
                      <strong>{canReview ? "這筆送審正在等待核准或駁回" : "這筆送審正在等待主管審核"}</strong>
                      <small>
                        {canReview
                          ? "審核後核准會進入發布流程；駁回後需由建立者修正後重送。"
                          : "只有 R&D Manager 或 Admin 可以在此核准或駁回。"}
                      </small>
                    </div>
                    <div className="actions">
                      {canReview ? (
                        <>
                          <button className="primary-button" type="button" onClick={() => runAction("approve")} disabled={actionLoading}>
                            <Check size={16} aria-hidden="true" />
                            {actionLoading ? "核准中..." : "核准發布"}
                          </button>
                          <button className="danger-button" type="button" onClick={() => runAction("reject")} disabled={actionLoading}>
                            <X size={16} aria-hidden="true" />
                            駁回送審
                          </button>
                        </>
                      ) : null}
                      <Link className="secondary-button" href={`/submissions/${encodeURIComponent(detail.id)}`}>
                        查看完整送審頁
                      </Link>
                    </div>
                  </div>
                ) : null}
                <div className="file-list detail-file-actions" aria-label="檔案">
                  <div className="section-label file-list-label">檔案</div>
                  {detail.files.map((file) => (
                    <div className="file-item" key={file.id}>
                      <strong className="file-title">
                        <FileText size={14} aria-hidden="true" />
                        <span className="file-kind-badge" aria-label={`檔案格式 ${file.file_role.toUpperCase()}`}>
                          {file.file_role.toUpperCase()}
                        </span>
                        <span className="file-name">{file.original_filename}</span>
                      </strong>
                      {revisionPackageFileForSubmissionFile(detail, file.id, file.original_filename) ? (
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">版次包類別</span>
                            <span className="metadata-value">
                              {revisionPackageRoleLabel(revisionPackageFileForSubmissionFile(detail, file.id, file.original_filename)?.role ?? "")}
                            </span>
                          </span>
                        </div>
                      ) : null}
                      <div className="file-actions">
                        {file.file_role === "pdf" ? (
                          <a
                            className="secondary-button"
                            href={`/api/submissions/${detail.id}/files/preview/${file.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="預覽 PDF"
                          >
                            <Eye size={14} aria-hidden="true" />
                            預覽
                          </a>
                        ) : null}
                        {file.file_role === "pdf" && file.gdrive_file_id ? (
                          <a
                            className="secondary-button"
                            href={drivePdfPreviewUrl(file.gdrive_file_id)}
                            target="_blank"
                            rel="noreferrer"
                            title="開啟 Google Drive PDF 預覽"
                          >
                            <Eye size={14} aria-hidden="true" />
                            Drive 預覽
                          </a>
                        ) : null}
                        <a className="secondary-button" href={`/api/submissions/${detail.id}/files/${file.id}`} title="下載檔案">
                          <Download size={14} aria-hidden="true" />
                          下載
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.release_package ? (
                  <div className="release-package-card">
                    <div>
                      <span className="section-label">發布包</span>
                      <strong className="file-title">
                        <Archive size={14} aria-hidden="true" />
                        <span className="file-kind-badge" aria-label="檔案格式 ZIP">
                          ZIP
                        </span>
                        <span className="file-name">{detail.release_package.package_filename}</span>
                      </strong>
                      <div className="metadata-list">
                        <span className="metadata-pair">
                          <span className="metadata-label">大小</span>
                          <span className="metadata-value">{(detail.release_package.file_size / 1024).toFixed(1)} KB</span>
                        </span>
                      </div>
                    </div>
                    <a className="secondary-button" href={`/api/submissions/${detail.id}/release-package`} title="下載發布包">
                      <Archive size={14} aria-hidden="true" />
                      發布包
                    </a>
                  </div>
                ) : detail.status === "Released" ? (
                  <div className="release-package-card missing">
                    <div>
                      <span className="section-label">發布包</span>
                      <small>製造端現在不能下載發布包。請 R&D Manager 或 Admin 回送審明細補齊發布包。</small>
                    </div>
                    <Link className="secondary-button" href={`/submissions/${encodeURIComponent(detail.id)}`}>
                      查看送審
                    </Link>
                  </div>
                ) : null}
              </section>

              <details
                className="detail-workflow-layer engineering-context"
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setDetailLayerOpen((current) => ({ ...current, engineering: isOpen }));
                  if (isOpen) loadEngineeringResources(detail.id).catch(console.error);
                }}
              >
                <summary>
                  <span>工程上下文</span>
                  <small>變更原因、材質、版次、BOM、Where-used</small>
                </summary>
                <div className="detail-section-body">
                  <div className="detail-row">
                    <span>變更原因</span>
                    <p>{detail.change_description}</p>
                  </div>
                  <div className="detail-row">
                    <span>材質 / 表面處理</span>
                    <div className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">材質</span>
                        <span className="metadata-value">{detail.material}</span>
                      </span>
                      <span className="metadata-pair">
                        <span className="metadata-label">表面處理</span>
                        <span className="metadata-value">{detail.surface_finish}</span>
                      </span>
                    </div>
                  </div>
                  {detailResourceLoading.engineering ? <small>載入工程上下文...</small> : null}
                  <div className="revision-history">
                    <div className="section-label">版次紀錄</div>
                    {revisionHistory.length === 0 ? (
                      <small>{detailResourcesLoaded.engineering ? "目前沒有可查看的版次紀錄。" : "展開後載入版次紀錄。"}</small>
                    ) : (
                      <div className="revision-list">
                        {revisionHistory.map((entry) => (
                          <div className="revision-item" key={entry.submission_id}>
                            <div>
                              <strong>版次 {entry.revision}</strong>
                            </div>
                            <div className="revision-status">
                              <StatusBadge status={entry.status} context="submission" />
                              {entry.status === "Obsolete" ? (
                                <small>廢止時間 {entry.obsolete_at ?? "-"}</small>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="reference-list">
                    <div className="section-label">CAD 引用關係</div>
                    {detail.references.length === 0 ? (
                      <small>尚未擷取 CAD 引用；Document Manager 介面卡就緒後會自動顯示組立件與圖面關聯。</small>
                    ) : (
                      detail.references.map((reference) => (
                        <div className="reference-item" key={reference.id}>
                          <strong className="identity-line">
                            <span className="identity-primary">{reference.source_filename}</span>
                            <span className="metadata-badge">{reference.reference_type}</span>
                          </strong>
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">引用檔</span>
                              <span className="metadata-value">{reference.referenced_filename}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">數量</span>
                              <span className="metadata-value">{reference.quantity}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">擷取</span>
                              <span className="metadata-value">{reference.extraction_method}</span>
                            </span>
                            <span className="metadata-badge">{reference.confidence}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="bom-list">
                    <div className="bom-header-row">
                      <div className="section-label">工程 BOM</div>
                      {detail.bom ? (
                        <div className="bom-export-actions">
                          <a className="secondary-button" href={`/api/submissions/${detail.id}/bom/export?format=csv`} title="匯出 BOM CSV">
                            <Download size={14} />
                            CSV
                          </a>
                          <a className="secondary-button" href={`/api/submissions/${detail.id}/bom/export?format=xls`} title="匯出 BOM Excel">
                            <Download size={14} />
                            Excel
                          </a>
                        </div>
                      ) : null}
                    </div>
                    {!detail.bom ? (
                      <small>目前沒有 BOM 草稿。現在請 RD 從組立件 CAD 引用或 BOM 工作台建立草稿；若此件不需要 BOM，請在審核說明中註明。</small>
                    ) : detail.bom.lines.length === 0 ? (
                      <small>BOM 草稿已建立但沒有子件行。現在請 RD 補齊子件，或由審核者確認此件不需要子件。</small>
                    ) : (
                      detail.bom.lines.map((line) => {
                        const lineState = getBomLineState(line);
                        const content = (
                          <>
                            <div className="bom-item-title">
                              <strong>
                                {line.line_no}. {line.child_part_number}
                              </strong>
                              <span className={`bom-line-state ${lineState.className}`}>{lineState.label}</span>
                            </div>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">版次</span>
                                <span className="metadata-value">{line.child_revision ?? line.child_submission_revision ?? "-"}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">數量</span>
                                <span className="metadata-value">{line.quantity}</span>
                              </span>
                            </div>
                            {line.child_part_name || line.child_drawing_number ? (
                              <div className="metadata-list">
                                <span className="metadata-pair">
                                  <span className="metadata-label">品名</span>
                                  <span className="metadata-value">{line.child_part_name ?? "-"}</span>
                                </span>
                                <span className="metadata-pair">
                                  <span className="metadata-label">圖號</span>
                                  <span className="metadata-value">{line.child_drawing_number ?? "-"}</span>
                                </span>
                              </div>
                            ) : null}
                            <small>
                              <span className="metadata-label">來源</span> {line.source_filename ?? "沒有來源檔案"}
                            </small>
                          </>
                        );
                        return line.child_submission_id ? (
                          <button
                            className="bom-item bom-child-link"
                            type="button"
                            key={line.id}
                            onClick={() => {
                              openChildSubmission(line.child_submission_id).catch(console.error);
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="bom-item" key={line.id}>
                            {content}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {bomDiff ? (
                    <div className="bom-diff-list">
                      <div className="section-label">BOM 差異</div>
                      <div className="bom-diff-summary">
                        <span className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">基準版次</span>
                            <span className="metadata-value">{bomDiff.base_revision}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">目標版次</span>
                            <span className="metadata-value">{bomDiff.target_revision}</span>
                          </span>
                        </span>
                        <strong>
                          +{bomDiff.added_count} / -{bomDiff.removed_count} / Δ{bomDiff.changed_count} / ={bomDiff.unchanged_count}
                        </strong>
                      </div>
                      <div className="bom-export-actions">
                        <a className="secondary-button" href={`/api/submissions/${detail.id}/bom/diff?format=csv`} title="匯出 BOM diff CSV">
                          <Download size={14} />
                          Diff CSV
                        </a>
                        <a className="secondary-button" href={`/api/submissions/${detail.id}/bom/diff?format=xls`} title="匯出 BOM diff Excel">
                          <Download size={14} />
                          Diff Excel
                        </a>
                      </div>
                      {bomDiff.lines
                        .filter((line) => line.change_type !== "unchanged")
                        .map((line) => (
                          <div className={`bom-diff-item ${line.change_type}`} key={`${line.change_type}-${line.key}`}>
                            <strong className="identity-line">
                              <span className="metadata-badge">{bomDiffLabels[line.change_type]}</span>
                              <span className="identity-primary">{line.child_part_number}</span>
                            </strong>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">變更</span>
                                <span className="metadata-value">{describeBomDiffLine(line)}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">原版次/數量</span>
                                <span className="metadata-value">
                                  {line.from_revision ?? "-"} / {line.from_quantity ?? "-"}
                                </span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">新版次/數量</span>
                                <span className="metadata-value">
                                  {line.to_revision ?? "-"} / {line.to_quantity ?? "-"}
                                </span>
                              </span>
                            </div>
                            <small>
                              <span className="metadata-label">來源</span> {line.from_source_filename ?? "-"} → {line.to_source_filename ?? "-"}
                            </small>
                          </div>
                        ))}
                    </div>
                  ) : detail.bom ? (
                    <div className="bom-diff-list">
                      <div className="section-label">BOM 差異</div>
                      <small>{detailResourcesLoaded.engineering ? bomDiffMessage || "尚無可比較的前一版 BOM。" : "展開後載入 BOM 差異。"}</small>
                    </div>
                  ) : null}
                  <div className="where-used-list">
                    <div className="section-label">使用處</div>
                    {whereUsed.length === 0 ? (
                      <small>{detailResourcesLoaded.engineering ? "目前沒有上層 BOM 使用此料號。" : "展開後載入上層使用處。"}</small>
                    ) : (
                      whereUsed.slice(0, 6).map((entry) => {
                        const whereUsedState = getWhereUsedState(entry);
                        return (
                          <div className="where-used-item" key={`${entry.parent_submission_id}-${entry.bom_header_id}`}>
                            <strong className="identity-line">
                              <span className="identity-primary">{entry.parent_part_number}</span>
                              <StatusBadge status={entry.parent_status} context="submission" />
                            </strong>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">上層圖號</span>
                                <span className="metadata-value">{entry.parent_drawing_number}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">上層版次</span>
                                <span className="metadata-value">{entry.parent_revision}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">數量</span>
                                <span className="metadata-value">{entry.quantity}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">子件版次</span>
                                <span className="metadata-value">{entry.child_revision ?? "-"}</span>
                              </span>
                            </div>
                            <span className={`bom-line-state ${whereUsedState.className}`}>{whereUsedState.label}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </details>

              <details
                className="detail-workflow-layer collaboration-review"
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setDetailLayerOpen((current) => ({ ...current, collaboration: isOpen }));
                  if (isOpen) {
                    loadCollaborationResources(detail.id).catch(console.error);
                    loadInsightResources(detail.id).catch(console.error);
                    loadHandoffResources(detail.id).catch(console.error);
                  }
                }}
              >
                <summary>
                  <span>協作 / 審核</span>
                  <small>編輯預約、AI 風險、標註、討論、問題、簽核</small>
                </summary>
                <div className="detail-section-body">
                  {detailResourceLoading.collaboration || detailResourceLoading.insights || detailResourceLoading.handoff ? (
                    <small>載入協作與審核資料...</small>
                  ) : null}
                  <div className={detail.active_lock ? "checkout-card locked" : "checkout-card"}>
                    <div>
                      <span className="section-label">編輯預約</span>
                      {detail.active_lock ? (
                        <>
                          <strong>{detail.active_lock.locked_by_name}</strong>
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">原因</span>
                              <span className="metadata-value">{detail.active_lock.lock_reason}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">到期</span>
                              <span className="metadata-value">{new Date(detail.active_lock.expires_at).toLocaleString()}</span>
                            </span>
                          </div>
                        </>
                      ) : (
                        <small>目前沒有人預約編輯此料號。</small>
                      )}
                    </div>
                    {canCheckout ? (
                      detail.active_lock?.locked_by === currentUser.id || currentUser.role === "Admin" ? (
                        <button className="secondary-button" type="button" onClick={() => runCheckout("unlock")} disabled={checkoutLoading}>
                          <Unlock size={14} aria-hidden="true" />
                          解除預約
                        </button>
                      ) : detail.active_lock ? null : (
                        <button className="secondary-button" type="button" onClick={() => runCheckout("lock")} disabled={checkoutLoading}>
                          <Lock size={14} aria-hidden="true" />
                          預約編輯
                        </button>
                      )
                    ) : null}
                  </div>
                  <div className="readonly-share-panel">
                    <div className="readonly-share-header">
                      <div className="readonly-share-title">
                        <span className="section-label">試作分支</span>
                        {currentSandboxBranch ? (
                          <div className="identity-line">
                            <strong className="identity-primary">{currentSandboxBranch.branch_name}</strong>
                            <span className="metadata-badge">{formatWorkflowStatus(currentSandboxBranch.status)}</span>
                          </div>
                        ) : (
                          <strong>試作分支</strong>
                        )}
                        <small>啟用中的試作送審需先合併，才可進入核准與發布。</small>
                      </div>
                      <GitBranch size={18} aria-hidden="true" />
                    </div>
                    {currentSandboxBranch?.status === "active" ? (
                      <div className="readonly-share-row">
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">來源圖號</span>
                            <span className="metadata-value">{currentSandboxBranch.source_drawing_number}</span>
                          </span>
                          <span className="metadata-badge">Rev {currentSandboxBranch.source_revision}</span>
                        </div>
                        {currentSandboxBranch.created_by === currentUser.id || currentUser.role === "Admin" ? (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => mergeSandboxBranch(currentSandboxBranch.id)}
                            disabled={sandboxLoading}
                          >
                            <Check size={14} aria-hidden="true" />
                            合併
                          </button>
                        ) : null}
                      </div>
                    ) : canCheckout ? (
                      <div className="readonly-share-form">
                        <label>
                          分支名稱
                          <input value={sandboxBranchName} onChange={(event) => setSandboxBranchName(event.target.value)} type="text" maxLength={60} />
                        </label>
                        <label>
                          原因
                          <input value={sandboxReason} onChange={(event) => setSandboxReason(event.target.value)} type="text" maxLength={240} />
                        </label>
                        <button className="secondary-button" type="button" onClick={createSandboxBranchFromDetail} disabled={sandboxLoading}>
                          <GitBranch size={14} aria-hidden="true" />
                          建立分支
                        </button>
                      </div>
                    ) : null}
                    <div className="readonly-share-list">
                      {sandboxBranches.length === 0 ? (
                        <small>{detailResourcesLoaded.collaboration ? "目前沒有試作分支。" : "展開後載入試作分支。"}</small>
                      ) : (
                        sandboxBranches.map((branch) => (
                          <div className="readonly-share-item" key={branch.id}>
                            <div className="readonly-share-row">
                              <strong className="identity-primary">{branch.branch_name}</strong>
                              <span className={`readonly-share-status ${branch.status}`}>{branch.merged_at ? "已合併" : formatWorkflowStatus(branch.status)}</span>
                            </div>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">來源圖號</span>
                                <span className="metadata-value">{branch.source_drawing_number}</span>
                              </span>
                              <span className="metadata-badge">來源 Rev {branch.source_revision}</span>
                              <span className="metadata-badge">試作 Rev {branch.sandbox_revision}</span>
                              <span className="metadata-pair">
                                <span className="metadata-label">建立者</span>
                                <span className="metadata-value">{branch.created_by_name}</span>
                              </span>
                            </div>
                            <div className="file-actions">
                              <button className="secondary-button" type="button" onClick={() => setSelectedId(branch.sandbox_submission_id)}>
                                <Eye size={14} aria-hidden="true" />
                                開啟試作
                              </button>
                              {branch.status === "active" && (branch.created_by === currentUser.id || currentUser.role === "Admin") ? (
                                <button
                                  className="primary-button"
                                  type="button"
                                  onClick={() => mergeSandboxBranch(branch.id)}
                                  disabled={sandboxLoading}
                                >
                                  <Check size={14} aria-hidden="true" />
                                  合併
                                </button>
                              ) : null}
                              {branch.status === "active" && (branch.created_by === currentUser.id || currentUser.role === "Admin") ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => updateSandboxBranch(branch.id, "close")}
                                  disabled={sandboxLoading}
                                >
                                  <X size={14} aria-hidden="true" />
                                  關閉
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  {aiSummary ? (
                    <div className="ai-summary-panel">
                      <div>
                        <span className="section-label">AI 審核摘要</span>
                        <strong>{aiSummary.title}</strong>
                      </div>
                      <div className="ai-summary-sections">
                        {aiSummary.sections.map((section) => (
                          <div className={`ai-summary-section ${section.severity}`} key={section.key}>
                            <strong>{section.title}</strong>
                            <p>{section.body}</p>
                            <ul>
                              {section.facts.slice(0, 4).map((fact, index) => (
                                <li key={`${section.key}-${index}`}>{fact}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <div className="ai-summary-sources">
                        <span>來源（{aiSummary.source_count}）</span>
                        {aiSummary.sources.slice(0, 8).map((source) => (
                          <small key={`${source.type}-${source.label}-${source.detail}`}>
                            {source.type}: {source.label} - {source.detail}
                          </small>
                        ))}
                      </div>
                    </div>
                  ) : detailResourcesLoaded.insights ? null : (
                    <small>展開後載入 AI 摘要與風險提示，不在選圖時預先消耗算力。</small>
                  )}
                  {aiRiskReport ? (
                    <div className="ai-risk-panel">
                      <div>
                        <span className="section-label">AI 風險提示</span>
                        <strong>{aiRiskReport.risk_count > 0 ? `發現 ${aiRiskReport.risk_count} 項風險` : "未發現明確風險"}</strong>
                      </div>
                      {aiRiskReport.risks.length === 0 ? (
                        <small>未偵測到缺少交接檔、新版次、多上層使用或已發布檔名衝突。</small>
                      ) : (
                        <div className="ai-risk-list">
                          {aiRiskReport.risks.map((risk) => (
                            <div className={`ai-risk-item ${risk.severity}`} key={risk.code}>
                              <strong>{risk.title}</strong>
                              <p>{risk.message}</p>
                              <small>建議動作：{risk.action}</small>
                              {risk.sources.slice(0, 4).map((source) => (
                                <small key={`${risk.code}-${source.type}-${source.label}`}>
                                  {source.type}: {source.label} - {source.detail}
                                </small>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="reuse-panel">
                    <div>
                      <span className="section-label">設計沿用候選</span>
                      <strong>{reuseCandidates.length > 0 ? `${reuseCandidates.length} 筆中繼資料相符` : "沒有沿用候選"}</strong>
                    </div>
                    {reuseCandidates.length === 0 ? (
                      <small>{detailResourcesLoaded.insights ? "目前可見範圍內沒有相似中繼資料候選。" : "展開後載入沿用候選。"}</small>
                    ) : (
                      <div className="reuse-list">
                        {reuseCandidates.map((candidate) => (
                          <button className="reuse-item" type="button" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                            <strong className="identity-line">
                              <Copy size={14} aria-hidden="true" />
                              <span className="identity-primary">{candidate.part_number}</span>
                              <span className="metadata-badge">版次 {candidate.revision}</span>
                              <StatusBadge status={candidate.status} context="submission" />
                            </strong>
                            <div className="metadata-list">
                              <span className="score-badge">分數 {candidate.score}</span>
                              <span className="metadata-pair">
                                <span className="metadata-label">圖號</span>
                                <span className="metadata-value">{candidate.drawing_number}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">品名</span>
                                <span className="metadata-value">{candidate.part_name}</span>
                              </span>
                            </div>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">原因</span>
                                <span className="metadata-value">{candidate.match_reasons.slice(0, 3).join("、")}</span>
                              </span>
                            </div>
                            {candidate.matched_files.length > 0 ? (
                              <div className="metadata-list">
                                <span className="metadata-pair">
                                  <span className="metadata-label">檔案</span>
                                  <span className="metadata-value">{candidate.matched_files.join(", ")}</span>
                                </span>
                              </div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="reuse-panel">
                    <div>
                      <span className="section-label">重複幾何搜尋</span>
                      <strong>{duplicateGeometryCandidates.length > 0 ? `${duplicateGeometryCandidates.length} 筆指紋相符` : "沒有重複指紋"}</strong>
                    </div>
                    {duplicateGeometryCandidates.length === 0 ? (
                      <small>{detailResourcesLoaded.insights ? "目前可見範圍內沒有找到檔案指紋重複。" : "展開後載入重複幾何搜尋。"}</small>
                    ) : (
                      <div className="reuse-list">
                        {duplicateGeometryCandidates.map((candidate) => (
                          <button className="reuse-item" type="button" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                            <strong className="identity-line">
                              <Copy size={14} aria-hidden="true" />
                              <span className="identity-primary">{candidate.part_number}</span>
                              <span className="metadata-badge">{candidate.duplicate_level}</span>
                              <StatusBadge status={candidate.status} context="submission" />
                            </strong>
                            <div className="metadata-list">
                              <span className="score-badge">指紋 {candidate.fingerprint_score}</span>
                              <span className="metadata-pair">
                                <span className="metadata-label">圖號</span>
                                <span className="metadata-value">{candidate.drawing_number}</span>
                              </span>
                            </div>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">訊號</span>
                                <span className="metadata-value">{candidate.fingerprint_signals.slice(0, 3).join("、")}</span>
                              </span>
                            </div>
                            {candidate.matched_files.length > 0 ? (
                              <div className="metadata-list">
                                <span className="metadata-pair">
                                  <span className="metadata-label">檔案</span>
                                  <span className="metadata-value">{candidate.matched_files.join(", ")}</span>
                                </span>
                              </div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {canReview && detail.status === "Released" && detail.release_package ? (
                    <div className="readonly-share-panel">
                      <div className="readonly-share-header">
                        <div className="readonly-share-title">
                          <span className="section-label">ERP / 庫存 / 採購同步</span>
                          <strong>{procurementSyncRuns.filter((run) => run.status === "sent").length} 筆待確認同步</strong>
                          <small>將已發布的發布包中繼資料送到外部系統，並追蹤確認回覆。</small>
                        </div>
                      </div>
                      <div className="readonly-share-form">
                        <label>
                          目標系統
                          <select
                            className="dropdown-select"
                            value={procurementSyncTarget}
                            onChange={(event) => setProcurementSyncTarget(event.target.value as ProcurementSyncRun["target_system"])}
                          >
                            <option value="procurement">採購</option>
                            <option value="inventory">庫存</option>
                            <option value="ERP">ERP</option>
                          </select>
                        </label>
                        <button className="primary-button" type="button" onClick={createProcurementSyncRun} disabled={shareLoading}>
                          <Factory size={14} aria-hidden="true" />
                          送出同步
                        </button>
                      </div>
                      <div className="readonly-share-list">
                        {procurementSyncRuns.length === 0 ? (
                          <small>{detailResourcesLoaded.handoff ? "目前沒有同步紀錄。" : "展開後載入同步紀錄。"}</small>
                        ) : (
                          procurementSyncRuns.map((run) => (
                            <div className="readonly-share-item" key={run.id}>
                              <div className="readonly-share-row">
                                <strong className="identity-line">
                                  <span className="metadata-badge">{run.target_system}</span>
                                  <span className="identity-primary">{run.external_reference ?? run.id}</span>
                                </strong>
                                <span className={`readonly-share-status ${run.status}`}>{formatWorkflowStatus(run.status)}</span>
                              </div>
                              <div className="metadata-list">
                                <span className="metadata-pair">
                                  <span className="metadata-label">送出時間</span>
                                  <span className="metadata-value">{run.created_at}</span>
                                </span>
                                <span className="metadata-pair">
                                  <span className="metadata-label">送出者</span>
                                  <span className="metadata-value">{run.created_by_name}</span>
                                </span>
                              </div>
                              {run.status === "sent" ? (
                                <button className="secondary-button" type="button" onClick={() => acknowledgeProcurementSyncRun(run.id)} disabled={shareLoading}>
                                  <Check size={14} aria-hidden="true" />
                                  確認
                                </button>
                              ) : (
                                <div className="metadata-list">
                                  <span className="metadata-pair">
                                    <span className="metadata-label">結案時間</span>
                                    <span className="metadata-value">{run.acknowledged_at ?? "-"}</span>
                                  </span>
                                  <span className="metadata-pair">
                                    <span className="metadata-label">結案者</span>
                                    <span className="metadata-value">{run.acknowledged_by_name ?? "-"}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
              {canReview && detail.status === "Released" && detail.release_package ? (
                <div className="readonly-share-panel">
                  <div className="readonly-share-header">
                    <div className="readonly-share-title">
                      <span className="section-label">唯讀分享</span>
                      <strong>
                        <Share2 size={14} aria-hidden="true" /> 供應商 / 採購
                      </strong>
                      <small>提供外部審閱已發布檔案的連結。</small>
                    </div>
                  </div>
                  <div className="readonly-share-form">
                    <label>
                      標籤
                      <input value={shareLabel} onChange={(event) => setShareLabel(event.target.value)} type="text" maxLength={80} />
                    </label>
                    <label>
                      有效天數
                      <input value={shareDays} onChange={(event) => setShareDays(event.target.value)} type="number" min={1} max={90} />
                    </label>
                    <button className="primary-button" type="button" onClick={createReadonlyShare} disabled={shareLoading}>
                      <Share2 size={14} aria-hidden="true" />
                      建立
                    </button>
                  </div>
                  {lastShareUrl ? (
                    <div className="readonly-share-url">
                      <input value={lastShareUrl} readOnly aria-label="最新唯讀分享連結" />
                      <button className="secondary-button" type="button" onClick={copyReadonlyShareUrl}>
                        <Copy size={14} aria-hidden="true" />
                        複製
                      </button>
                    </div>
                  ) : null}
                  <div className="readonly-share-list">
                    {readonlyShares.length === 0 ? (
                      <small>目前沒有唯讀分享。</small>
                    ) : (
                      readonlyShares.map((share) => (
                        <div className="readonly-share-item" key={share.id}>
                          <div className="readonly-share-row">
                            <strong>{share.label}</strong>
                            <span className={`readonly-share-status ${share.status}`}>{formatWorkflowStatus(share.status)}</span>
                          </div>
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">到期</span>
                              <span className="metadata-value">{share.expires_at}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">存取</span>
                              <span className="metadata-value">{share.access_count}</span>
                            </span>
                            {share.last_accessed_at ? (
                              <span className="metadata-pair">
                                <span className="metadata-label">最近</span>
                                <span className="metadata-value">{share.last_accessed_at}</span>
                              </span>
                            ) : null}
                          </div>
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">供應商回覆</span>
                              <span className="metadata-value">{share.response_count}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">未結</span>
                              <span className="metadata-value">{share.open_response_count}</span>
                            </span>
                            {share.latest_response_at ? (
                              <span className="metadata-pair">
                                <span className="metadata-label">最新</span>
                                <span className="metadata-value">{share.latest_response_at}</span>
                              </span>
                            ) : null}
                          </div>
                          <small>
                            <span className="metadata-label">建立者</span> {share.created_by_name}
                          </small>
                          {share.status === "active" ? (
                            <button className="secondary-button" type="button" onClick={() => revokeReadonlyShare(share.id)} disabled={shareLoading}>
                              <X size={14} aria-hidden="true" />
                              撤銷
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="readonly-share-list">
                    <span className="section-label">供應商入口回覆</span>
                    {supplierResponses.length === 0 ? (
                      <small>目前沒有供應商回覆。</small>
                    ) : (
                      supplierResponses.map((response) => (
                        <div className="readonly-share-item" key={response.id}>
                          <div className="readonly-share-row">
                            <div className="identity-stack">
                              <div className="identity-line">
                                <span className="metadata-badge">{response.response_kind === "acknowledgement" ? "確認" : "提問"}</span>
                                <strong className="identity-primary">{response.supplier_name}</strong>
                              </div>
                            </div>
                            <span className={`readonly-share-status ${response.status}`}>{formatWorkflowStatus(response.status)}</span>
                          </div>
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">Email</span>
                              <span className="metadata-value">{response.supplier_email}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">入口</span>
                              <span className="metadata-value">{response.share_label}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">時間</span>
                              <span className="metadata-value">{response.created_at}</span>
                            </span>
                          </div>
                          <p>{response.message}</p>
                          {response.status === "open" ? (
                            <button className="secondary-button" type="button" onClick={() => closeSupplierResponse(response.id)} disabled={shareLoading}>
                              <Check size={14} aria-hidden="true" />
                              關閉
                            </button>
                          ) : (
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">結案時間</span>
                                <span className="metadata-value">{response.closed_at ?? "-"}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">結案者</span>
                                <span className="metadata-value">{response.closed_by_name ?? "-"}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <div className="markup-panel">
                <div className="section-label">PDF 標註</div>
                {pdfMarkups.length === 0 ? (
                  <small>目前沒有 PDF 標註。</small>
                ) : (
                  <div className="markup-list">
                    {pdfMarkups.map((markup) => (
                      <div className={`markup-item ${markup.status}`} key={markup.id}>
                        <div className="markup-heading">
                          <div className="identity-stack">
                            <strong className="identity-primary">PDF 標註</strong>
                            <div className="metadata-list">
                              <span className="metadata-pair">
                                <span className="metadata-label">頁次</span>
                                <span className="metadata-value">{markup.page_number}</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">X</span>
                                <span className="metadata-value">{markup.x_percent}%</span>
                              </span>
                              <span className="metadata-pair">
                                <span className="metadata-label">Y</span>
                                <span className="metadata-value">{markup.y_percent}%</span>
                              </span>
                            </div>
                          </div>
                          <span className="metadata-badge">{markup.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{markup.body}</p>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">檔案</span>
                            <span className="metadata-value">{markup.file_original_filename}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">建立者</span>
                            <span className="metadata-value">{markup.author_name}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">時間</span>
                            <span className="metadata-value">{new Date(markup.created_at).toLocaleString()}</span>
                          </span>
                        </div>
                        {markup.status === "resolved" ? (
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">結案者</span>
                              <span className="metadata-value">{markup.resolved_by_name ?? "-"}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">結案時間</span>
                              <span className="metadata-value">
                                {markup.resolved_at ? new Date(markup.resolved_at).toLocaleString() : "-"}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <button className="secondary-button" type="button" onClick={() => resolvePdfMarkup(markup.id)} disabled={markupLoading}>
                            <Check size={14} aria-hidden="true" />
                            結案標註
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="markup-form">
                  <select className="dropdown-select" value={markupFileId} onChange={(event) => setMarkupFileId(event.target.value)} disabled={markupLoading}>
                    <option value="">PDF 檔案</option>
                    {detail.files
                      .filter((file) => file.file_role === "pdf")
                      .map((file) => (
                        <option value={file.id} key={file.id}>
                          {file.original_filename}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    step="1"
                    value={markupPage}
                    onChange={(event) => setMarkupPage(event.target.value)}
                    aria-label="標註頁次"
                    disabled={markupLoading}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={markupX}
                    onChange={(event) => setMarkupX(event.target.value)}
                    aria-label="標註 X 百分比"
                    disabled={markupLoading}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={markupY}
                    onChange={(event) => setMarkupY(event.target.value)}
                    aria-label="標註 Y 百分比"
                    disabled={markupLoading}
                  />
                  <textarea
                    value={markupBody}
                    onChange={(event) => setMarkupBody(event.target.value)}
                    placeholder="PDF 標註內容"
                    rows={3}
                    disabled={markupLoading}
                  />
                  <button className="secondary-button" type="button" onClick={submitPdfMarkup} disabled={markupLoading || !markupFileId || !markupBody.trim()}>
                    <MessageSquare size={14} aria-hidden="true" />
                    新增標註
                  </button>
                </div>
              </div>
              <div className="discussion-panel">
                <div className="section-label">討論</div>
                {discussionComments.length === 0 ? (
                  <small>目前沒有審核留言。</small>
                ) : (
                  <div className="discussion-list">
                    {discussionComments.map((comment) => (
                      <div className={`discussion-item ${comment.status}`} key={comment.id}>
                        <div>
                          <strong>{comment.author_name}</strong>
                          <span className="metadata-badge">{comment.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{comment.body}</p>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">對象</span>
                            <span className="metadata-value">{comment.file_original_filename ?? "送審資料"}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">時間</span>
                            <span className="metadata-value">{new Date(comment.created_at).toLocaleString()}</span>
                          </span>
                        </div>
                        {comment.status === "open" ? (
                          <button className="secondary-button" type="button" onClick={() => resolveDiscussion(comment.id)} disabled={discussionLoading}>
                            <Check size={14} aria-hidden="true" />
                            結案
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                <div className="discussion-form">
                  <select className="dropdown-select" value={discussionFileId} onChange={(event) => setDiscussionFileId(event.target.value)} disabled={discussionLoading}>
                    <option value="">送審資料</option>
                    {detail.files.map((file) => (
                      <option value={file.id} key={file.id}>
                        {file.file_role.toUpperCase()} {file.original_filename}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={discussionBody}
                    onChange={(event) => setDiscussionBody(event.target.value)}
                    placeholder="新增審核留言"
                    rows={3}
                    disabled={discussionLoading}
                  />
                  <button className="secondary-button" type="button" onClick={submitDiscussion} disabled={discussionLoading || !discussionBody.trim()}>
                    <MessageSquare size={14} aria-hidden="true" />
                    新增留言
                  </button>
                </div>
              </div>
              <div className="issue-panel">
                <div className="section-label">審核問題</div>
                {reviewIssues.length === 0 ? (
                  <small>目前沒有審核問題。</small>
                ) : (
                  <div className="issue-list">
                    {reviewIssues.map((issue) => (
                      <div className={`issue-item ${issue.status}`} key={issue.id}>
                        <div className="issue-heading">
                          <strong>
                            <AlertTriangle size={14} aria-hidden="true" /> {issue.title}
                          </strong>
                          <span className="metadata-badge">{issue.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{issue.description}</p>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">對象</span>
                            <span className="metadata-value">{issue.file_original_filename ?? "送審資料"}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">提出者</span>
                            <span className="metadata-value">{issue.raised_by_name}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">負責人</span>
                            <span className="metadata-value">{issue.assignee_name ?? "-"}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">時間</span>
                            <span className="metadata-value">{new Date(issue.created_at).toLocaleString()}</span>
                          </span>
                        </div>
                        {issue.status === "resolved" ? (
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">結案說明</span>
                              <span className="metadata-value">{issue.resolution ?? "-"}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">結案者</span>
                              <span className="metadata-value">{issue.resolved_by_name ?? "-"}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="issue-resolve">
                            <textarea
                              value={issueResolution[issue.id] ?? ""}
                              onChange={(event) => setIssueResolution((current) => ({ ...current, [issue.id]: event.target.value }))}
                              placeholder="結案說明"
                              rows={2}
                              disabled={issueLoading}
                            />
                            <button className="secondary-button" type="button" onClick={() => resolveIssue(issue.id)} disabled={issueLoading}>
                              <Check size={14} aria-hidden="true" />
                              結案問題
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="issue-form">
                  <select className="dropdown-select" value={issueFileId} onChange={(event) => setIssueFileId(event.target.value)} disabled={issueLoading}>
                    <option value="">送審資料</option>
                    {detail.files.map((file) => (
                      <option value={file.id} key={file.id}>
                        {file.file_role.toUpperCase()} {file.original_filename}
                      </option>
                    ))}
                  </select>
                  <input
                    value={issueTitle}
                    onChange={(event) => setIssueTitle(event.target.value)}
                    placeholder="問題標題"
                    disabled={issueLoading}
                  />
                  <textarea
                    value={issueDescription}
                    onChange={(event) => setIssueDescription(event.target.value)}
                    placeholder="描述需要修正的內容"
                    rows={3}
                    disabled={issueLoading}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={submitIssue}
                    disabled={issueLoading || !issueTitle.trim() || !issueDescription.trim()}
                  >
                    <AlertTriangle size={14} aria-hidden="true" />
                    新增問題
                  </button>
                </div>
              </div>
              <div className="phase-gate-panel">
                <div className="readonly-share-header">
                  <div className="readonly-share-title">
                    <span className="section-label">PLM 階段關卡</span>
                    <strong>
                      {phaseGateChecks.length === 0
                        ? "尚未啟用"
                        : `${phaseGateChecks.filter((check) => check.required === 1 && check.status === "open").length} 個必要項目未結`}
                    </strong>
                    <small>啟用後，必要項目未結案時會阻擋核准與發布。</small>
                  </div>
                </div>
                {phaseGateChecks.length === 0 ? (
                  canReview ? (
                    <button className="secondary-button" type="button" onClick={initializePhaseGates} disabled={phaseGateLoading}>
                      <Archive size={14} aria-hidden="true" />
                      啟用關卡
                    </button>
                  ) : (
                    <small>目前沒有階段關卡檢核表。</small>
                  )
                ) : (
                  <div className="phase-gate-list">
                    {phaseGateChecks.map((check) => (
                      <div className={`phase-gate-item ${check.status}`} key={check.id}>
                        <div className="issue-heading">
                          <strong>
                            <Archive size={14} aria-hidden="true" /> {check.gate_name}
                          </strong>
                          <span className="metadata-badge">{formatWorkflowStatus(check.status)}</span>
                        </div>
                        <p>{check.checklist_item}</p>
                        <div className="metadata-list">
                          <span className="metadata-badge">{check.required === 1 ? "必要" : "選用"}</span>
                          <span className="metadata-pair">
                            <span className="metadata-label">建立者</span>
                            <span className="metadata-value">{check.created_by_name}</span>
                          </span>
                        </div>
                        {check.status === "open" && canReview ? (
                          <div className="file-actions">
                            <button className="secondary-button" type="button" onClick={() => decidePhaseGate(check.id, "complete")} disabled={phaseGateLoading}>
                              <Check size={14} aria-hidden="true" />
                              完成
                            </button>
                            <button className="secondary-button" type="button" onClick={() => decidePhaseGate(check.id, "waive")} disabled={phaseGateLoading}>
                              <X size={14} aria-hidden="true" />
                              豁免
                            </button>
                          </div>
                        ) : check.status !== "open" ? (
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">決議</span>
                              <span className="metadata-value">{check.decision_comment ?? "-"}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">決議者</span>
                              <span className="metadata-value">{check.decided_by_name ?? "-"}</span>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="phase-gate-panel">
                <div className="readonly-share-header">
                  <div className="readonly-share-title">
                    <span className="section-label">簽核矩陣</span>
                    <strong>
                      {approvalMatrixRequirements.length === 0
                        ? "尚未啟用"
                        : `${approvalMatrixRequirements.filter((requirement) => requirement.status === "open").length} 個角色未結`}
                    </strong>
                    <small>啟用後，每個未結角色需求都必須滿足或豁免後才可發布。</small>
                  </div>
                </div>
                {approvalMatrixRequirements.length === 0 ? (
                  canReview ? (
                    <button className="secondary-button" type="button" onClick={initializeApprovalMatrix} disabled={approvalMatrixLoading}>
                      <Lock size={14} aria-hidden="true" />
                      啟用矩陣
                    </button>
                  ) : (
                    <small>目前沒有簽核矩陣。</small>
                  )
                ) : (
                  <div className="phase-gate-list">
                    {approvalMatrixRequirements.map((requirement) => (
                      <div className={`phase-gate-item ${requirement.status}`} key={requirement.id}>
                        <div className="issue-heading">
                          <strong>
                            <Lock size={14} aria-hidden="true" /> {requirement.required_role}
                          </strong>
                          <span className="metadata-badge">{formatWorkflowStatus(requirement.status)}</span>
                        </div>
                        <p>
                          {requirement.approved_count}/{requirement.min_count} 位審核者已核准
                        </p>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">建立者</span>
                            <span className="metadata-value">{requirement.created_by_name}</span>
                          </span>
                        </div>
                        {requirement.status === "open" && canReview ? (
                          <div className="file-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => waiveApprovalMatrixRequirement(requirement.id)}
                              disabled={approvalMatrixLoading}
                            >
                              <X size={14} aria-hidden="true" />
                              豁免
                            </button>
                          </div>
                        ) : requirement.status !== "open" ? (
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">決議</span>
                              <span className="metadata-value">{requirement.decision_comment ?? "-"}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">決議者</span>
                              <span className="metadata-value">{requirement.decided_by_name ?? "-"}</span>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="change-panel">
                <div className="section-label">ECR / ECO / ECN</div>
                {changeRequests.length === 0 ? (
                  <small>目前沒有變更需求。</small>
                ) : (
                  <div className="change-list">
                    {changeRequests.map((change) => (
                      <div className={`change-item ${change.status}`} key={change.id}>
                        <div className="issue-heading">
                          <strong>
                            <Archive size={14} aria-hidden="true" /> {change.kind} - {change.title}
                          </strong>
                          <span className="metadata-badge">{formatWorkflowStatus(change.status)}</span>
                        </div>
                        <p>{change.reason}</p>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">影響</span>
                            <span className="metadata-value">{change.impact}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">申請者</span>
                            <span className="metadata-value">{change.requested_by_name}</span>
                          </span>
                          <span className="metadata-pair">
                            <span className="metadata-label">時間</span>
                            <span className="metadata-value">{new Date(change.created_at).toLocaleString()}</span>
                          </span>
                        </div>
                        {change.status === "open" && canReview ? (
                          <div className="issue-resolve">
                            <textarea
                              value={changeDecision[change.id] ?? ""}
                              onChange={(event) => setChangeDecision((current) => ({ ...current, [change.id]: event.target.value }))}
                              placeholder="決議說明"
                              rows={2}
                              disabled={changeLoading}
                            />
                            <div className="file-actions">
                              <button className="secondary-button" type="button" onClick={() => decideChangeRequest(change.id, "approve")} disabled={changeLoading}>
                                <Check size={14} aria-hidden="true" />
                                核准
                              </button>
                              <button className="secondary-button" type="button" onClick={() => decideChangeRequest(change.id, "reject")} disabled={changeLoading}>
                                <X size={14} aria-hidden="true" />
                                駁回
                              </button>
                            </div>
                          </div>
                        ) : change.status !== "open" ? (
                          <div className="metadata-list">
                            <span className="metadata-pair">
                              <span className="metadata-label">決議</span>
                              <span className="metadata-value">{change.decision_comment ?? "-"}</span>
                            </span>
                            <span className="metadata-pair">
                              <span className="metadata-label">決議者</span>
                              <span className="metadata-value">{change.decided_by_name ?? "-"}</span>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                <div className="change-form">
                  <select className="dropdown-select" value={changeKind} onChange={(event) => setChangeKind(event.target.value as ChangeRequest["kind"])} disabled={changeLoading}>
                    <option value="ECR">ECR</option>
                    <option value="ECO">ECO</option>
                    <option value="ECN">ECN</option>
                  </select>
                  <input value={changeTitle} onChange={(event) => setChangeTitle(event.target.value)} placeholder="變更標題" disabled={changeLoading} />
                  <textarea
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                    placeholder="原因"
                    rows={3}
                    disabled={changeLoading}
                  />
                  <textarea
                    value={changeImpact}
                    onChange={(event) => setChangeImpact(event.target.value)}
                    placeholder="影響"
                    rows={3}
                    disabled={changeLoading}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={submitChangeRequest}
                    disabled={changeLoading || !changeTitle.trim() || !changeReason.trim() || !changeImpact.trim()}
                  >
                    <Archive size={14} aria-hidden="true" />
                    新增變更
                  </button>
                </div>
              </div>
              {detail.status === "Pending" && canReview ? (
                <>
                  <RevisionPackageReviewWarningCard detail={detail} compact />
                  <div className="actions">
                    <button className="primary-button" onClick={() => runAction("approve")} disabled={actionLoading}>
                      <Check size={16} aria-hidden="true" />
                      {actionLoading ? "核准中..." : "核准"}
                    </button>
                    <button className="danger-button" onClick={() => runAction("reject")} disabled={actionLoading}>
                      <X size={16} aria-hidden="true" />
                      駁回
                    </button>
                  </div>
                </>
              ) : null}
              {detail.status === "Released" || detail.status === "Obsolete" || pendingSubmissionObsoleteRequest ? (
                <div className="readonly-share-panel">
                  <div className="readonly-share-header">
                    <div className="readonly-share-title">
                      <span className="section-label">正式資料</span>
                      <strong>
                        <Archive size={14} aria-hidden="true" />{" "}
                        {detail.status === "Obsolete" ? "已作廢" : pendingSubmissionObsoleteRequest ? "作廢審核中" : "申請作廢"}
                      </strong>
                      <small>正式圖面作廢需經主管審核；核准後資料進入受控歷史。</small>
                    </div>
                  </div>
                  {detail.status === "Obsolete" ? (
                    <div className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">作廢時間</span>
                        <span className="metadata-value">{detail.obsolete_at ?? "-"}</span>
                      </span>
                      <span className="metadata-pair">
                        <span className="metadata-label">作廢者</span>
                        <span className="metadata-value">{detail.obsolete_by ?? "-"}</span>
                      </span>
                    </div>
                  ) : pendingSubmissionObsoleteRequest ? (
                    <div className="change-form">
                      <div className="metadata-list">
                        <span className="metadata-pair">
                          <span className="metadata-label">申請者</span>
                          <span className="metadata-value">{pendingSubmissionObsoleteRequest.requested_by_name}</span>
                        </span>
                        <span className="metadata-pair">
                          <span className="metadata-label">申請時間</span>
                          <span className="metadata-value">{pendingSubmissionObsoleteRequest.requested_at}</span>
                        </span>
                      </div>
                      <p>{pendingSubmissionObsoleteRequest.reason}</p>
                      {canReviewSubmissionObsolete ? (
                        <>
                          <textarea
                            value={obsoleteDecisionReason}
                            onChange={(event) => setObsoleteDecisionReason(event.target.value)}
                            placeholder="審核意見"
                            rows={3}
                            disabled={obsoleteActionLoading}
                          />
                          <div className="file-actions">
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => decideSubmissionObsolete(pendingSubmissionObsoleteRequest.id, "approve")}
                              disabled={obsoleteActionLoading}
                            >
                              <Check size={14} aria-hidden="true" />
                              核准作廢
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => decideSubmissionObsolete(pendingSubmissionObsoleteRequest.id, "reject")}
                              disabled={obsoleteActionLoading}
                            >
                              <X size={14} aria-hidden="true" />
                              退回申請
                            </button>
                          </div>
                        </>
                      ) : (
                        <small>等待主管審核。</small>
                      )}
                    </div>
                  ) : canRequestSubmissionObsolete ? (
                    <div className="change-form">
                      <textarea
                        value={obsoleteReason}
                        onChange={(event) => setObsoleteReason(event.target.value)}
                        placeholder="作廢原因"
                        rows={3}
                        disabled={obsoleteActionLoading}
                      />
                      <button
                        className="danger-button"
                        type="button"
                        onClick={requestSubmissionObsolete}
                        disabled={!obsoleteReason.trim() || obsoleteActionLoading}
                      >
                        <Archive size={14} aria-hidden="true" />
                        申請作廢
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
                </div>
              </details>

              <details className="detail-workflow-layer system-diagnostics">
                <summary>
                  <span>系統診斷</span>
                  <small>送審 ID、完整欄位、檔案路徑、SHA256、Drive iframe</small>
                </summary>
                <div className="detail-section-body">
                  <div className="detail-row">
                    <span>送審 ID</span>
                    <strong className="diagnostic-value">{detail.id}</strong>
                  </div>
                  <div className="detail-row">
                    <span>圖號與版次</span>
                    <div className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">圖號</span>
                        <span className="metadata-value">{detail.drawing_number}</span>
                      </span>
                      <span className="metadata-badge">版次 {detail.revision}</span>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>料號與品名</span>
                    <div className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">料號</span>
                        <span className="metadata-value">{detail.part_number}</span>
                      </span>
                      <span className="metadata-pair">
                        <span className="metadata-label">品名</span>
                        <span className="metadata-value">{detail.part_name}</span>
                      </span>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>提交資訊</span>
                    <div className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">提交者</span>
                        <span className="metadata-value">{detail.submitted_by_name}</span>
                      </span>
                      <span className="metadata-pair">
                        <span className="metadata-label">時間</span>
                        <span className="metadata-value">{new Date(detail.created_at).toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                  {detail.release_package ? (
                    <div className="release-package-card">
                      <div>
                        <span className="section-label">發布包診斷</span>
                        <strong className="file-title">
                          <Archive size={14} aria-hidden="true" />
                          <span className="file-kind-badge" aria-label="檔案格式 ZIP">
                            ZIP
                          </span>
                          <span className="file-name">{detail.release_package.package_filename}</span>
                        </strong>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">大小</span>
                            <span className="metadata-value">{(detail.release_package.file_size / 1024).toFixed(1)} KB</span>
                          </span>
                        </div>
                        <span className="diagnostic-value">SHA256 {detail.release_package.sha256}</span>
                      </div>
                    </div>
                  ) : null}
                  <div className="file-list system-file-list" aria-label="檔案診斷">
                    <div className="section-label">檔案診斷</div>
                    {detail.files.map((file) => (
                      <details className="file-item file-diagnostic-item" key={file.id}>
                        <summary>
                          <strong className="file-title">
                            <FileText size={14} aria-hidden="true" />
                            <span className="file-kind-badge" aria-label={`檔案格式 ${file.file_role.toUpperCase()}`}>
                              {file.file_role.toUpperCase()}
                            </span>
                            <span className="file-name">{file.original_filename}</span>
                          </strong>
                          <span className="metadata-badge">{formatStatusForUser(file.gdrive_status, "fileSync")}</span>
                        </summary>
                        <div className="metadata-list">
                          <span className="metadata-pair">
                            <span className="metadata-label">大小</span>
                            <span className="metadata-value">{(file.file_size / 1024).toFixed(1)} KB</span>
                          </span>
                        </div>
                        <span className="diagnostic-value">本機路徑 {file.local_path}</span>
                        <span className="diagnostic-value">SHA256 {file.sha256}</span>
                        {file.gdrive_file_id ? (
                          <>
                            <span className="diagnostic-value">Google Drive ID {file.gdrive_file_id}</span>
                            <div className="drive-preview" aria-label={`Google Drive PDF 預覽：${file.original_filename}`}>
                              <iframe
                                src={drivePdfPreviewUrl(file.gdrive_file_id)}
                                title={`Google Drive PDF 預覽 - ${file.original_filename}`}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </>
                        ) : null}
                      </details>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          ) : !isDetailLoading ? (
            <div className="empty">
              <NextStepState
                eyebrow="物件脈絡"
                title="請選擇一筆圖面資料查看明細"
                body="明細會串接版次、BOM、影響範圍、交接包與協作紀錄；也可以先建立新送審。"
                actions={[
                  { href: "/numbering/search", label: "圖料模組", variant: "primary" },
                  { href: "/upload", label: "上傳送審" }
                ]}
              />
            </div>
          ) : null}
          </SubmissionDetailPanel>
        ) : null}
      </div>

      <AssistantPanel
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatLoading={chatLoading}
        mobileChatOpen={mobileChatOpen}
        sourceTypeLabels={sourceTypeLabels}
        onOpenMobileChat={() => setMobileChatOpen(true)}
        onCloseMobileChat={() => setMobileChatOpen(false)}
        onChatInputChange={setChatInput}
        onSubmitChat={submitChat}
      />
    </>
  );
}

function drivePdfPreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

function RevisionPackageReviewWarningCard({ detail, compact = false }: { detail: SubmissionDetail; compact?: boolean }) {
  const warnings = detail.revision_package?.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <div className="upload-message warning revision-package-review-warning">
      <AlertTriangle size={16} aria-hidden="true" />
      <div>
        <p>{compact ? "版次檔案包有提醒，核准前請確認。" : "審核前請先確認版次檔案包。"}</p>
        {!compact ? <p>這些提醒不會阻擋核准；若檔案不足以審核，請駁回並請送審者補件。</p> : null}
        <ul>
          {warnings.map((warning) => (
            <li key={`${warning.code}-${warning.affectedFileIds?.join(",") ?? ""}`}>{warning.messageForReviewer}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function revisionPackageFileForSubmissionFile(detail: SubmissionDetail, fileId: string, filename: string) {
  return (
    detail.revision_package?.files.find((file) => file.submission_file_id === fileId) ??
    detail.revision_package?.files.find((file) => file.filename === filename) ??
    null
  );
}
