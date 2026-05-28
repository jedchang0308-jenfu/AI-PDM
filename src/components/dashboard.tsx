"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, Bell, Check, Copy, Download, Eye, Factory, FileText, Filter, GitBranch, Lock, LogOut, MessageSquare, RefreshCcw, Search, Send, Share2, Star, Unlock, X } from "lucide-react";
import type {
  ApprovalMatrixRequirement,
  BomDiffResult,
  AiSubmissionSummary,
  AiRiskReport,
  BomLine,
  ChangeRequest,
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
  SubmissionStatus,
  SubmissionSummary,
  SupplierPortalResponse,
  WhereUsedEntry
} from "@/lib/types";

const statusLabels: Record<SubmissionStatus | "All", string> = {
  Pending: "待審核",
  Releasing: "發布中",
  Released: "已發布",
  Obsolete: "已廢止",
  Rejected: "已駁回",
  ReleaseFailed: "發布失敗",
  All: "全部"
};

function formatWorkflowStatus(value: string) {
  const labels: Record<string, string> = {
    active: "啟用中",
    closed: "已關閉",
    merged: "已合併",
    open: "未結案",
    resolved: "已結案",
    completed: "已完成",
    waived: "已豁免",
    satisfied: "已滿足",
    approved: "已核准",
    rejected: "已駁回",
    sent: "已送出",
    acknowledged: "已確認",
    failed: "失敗"
  };
  return labels[value] ?? value;
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

type SavedFinderSearch = {
  id: string;
  name: string;
  query: string;
  status: SubmissionStatus | "All";
  filters: FinderFilters;
  created_at: string;
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
  { label: "待審核", status: "Pending" },
  { label: "已發布", status: "Released" },
  { label: "已廢止", status: "Obsolete" },
  { label: "已駁回", status: "Rejected" },
  { label: "發布失敗", status: "ReleaseFailed" }
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
      { value: "unreleased", label: "含未 Released / 缺件" },
      { value: "outdated", label: "含舊版子件" }
    ]
  }
];

const conditionFilters: ConditionFilterConfig[] = [
  { key: "my", label: "我建立的" },
  { key: "locked", label: "編輯預約中" },
  { key: "missing_handoff", label: "缺交接檔" }
];

function parseFileRoles(submission: SubmissionSummary) {
  return new Set((submission.file_roles ?? "").split(",").filter(Boolean));
}

function getBomLineState(line: BomLine) {
  if (!line.child_submission_id) return { className: "missing", label: "缺件" };
  if (line.child_status !== "Released") return { className: "not-released", label: line.child_status ? statusLabels[line.child_status] : "未 Released" };
  if (
    line.child_latest_released_revision &&
    line.child_submission_revision &&
    line.child_latest_released_revision !== line.child_submission_revision
  ) {
    return { className: "outdated", label: `舊版；最新版 ${line.child_latest_released_revision}` };
  }
  return { className: "released", label: "Released" };
}

function getWhereUsedState(entry: WhereUsedEntry) {
  if (!entry.child_submission_id) return { className: "missing", label: "缺件" };
  if (entry.child_status !== "Released") return { className: "not-released", label: entry.child_status ? statusLabels[entry.child_status] : "未 Released" };
  if (entry.child_is_outdated && entry.child_latest_released_revision) {
    return { className: "outdated", label: `受影響；最新版 ${entry.child_latest_released_revision}` };
  }
  return { className: "released", label: "Released" };
}

type SubmissionRowProps = {
  submission: SubmissionSummary;
  selected: boolean;
  favorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (submission: SubmissionSummary) => void;
};

const SubmissionRow = memo(function SubmissionRow({ submission, selected, favorite, onSelect, onToggleFavorite }: SubmissionRowProps) {
  return (
    <tr key={submission.id} className={selected ? "selected-row" : undefined} aria-selected={selected} onClick={() => onSelect(submission.id)}>
      <td>
        <strong>{submission.drawing_number}</strong>
      </td>
      <td>{submission.part_number}</td>
      <td>{submission.part_name}</td>
      <td>{submission.revision}</td>
      <td>
        <span className={`badge ${submission.status}`}>{statusLabels[submission.status]}</span>
      </td>
      <td>{formatFileAvailability(submission)}</td>
      <td>{new Date(latestActivityAt(submission)).toLocaleString()}</td>
      <td>
        <button
          className={favorite ? "icon-button favorite active" : "icon-button favorite"}
          type="button"
          title="收藏圖面"
          aria-label={`收藏 ${submission.drawing_number}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(submission);
          }}
        >
          <Star size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title="開啟圖面"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(submission.id);
          }}
        >
          <Eye size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
});

function DashboardComponentBoundary({ children }: { children: ReactNode }) {
  return <div className="dashboard-component-boundary">{children}</div>;
}

function FinderToolbar({ children }: { children: ReactNode }) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
}

function SubmissionTable({ children }: { children: ReactNode }) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
}

function SubmissionDetailPanel({ children }: { children: ReactNode }) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
}

function NotificationDropdown({ children }: { children: ReactNode }) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
}

function AssistantPanel({ children }: { children: ReactNode }) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
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
  return value === "All" || value === "Pending" || value === "Releasing" || value === "Released" || value === "Rejected" || value === "ReleaseFailed" || value === "Obsolete";
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

type Metrics = {
  pending: number;
  released: number;
  rejected: number;
  failed: number;
};

const emptyNotificationSummary: NotificationSummary = {
  total: 0,
  critical: 0,
  warning: 0,
  info: 0
};

type ChatSource = {
  type: "submission" | "metric" | "policy" | "file" | "bom" | "where_used";
  label: string;
  detail: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

type CurrentUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: "Engineer" | "R&D Manager" | "Admin";
};

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
  const [hasMoreSubmissions, setHasMoreSubmissions] = useState(false);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [isSubmissionTransitionPending, startSubmissionTransition] = useTransition();
  const [submissionTableScrollTop, setSubmissionTableScrollTop] = useState(0);
  const [submissionTableViewportHeight, setSubmissionTableViewportHeight] = useState(640);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
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
  const [metrics, setMetrics] = useState<Metrics>({ pending: 0, released: 0, rejected: 0, failed: 0 });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>(emptyNotificationSummary);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "可詢問待審清單、統計數字、目前送審內容，或 PDM 圖號/料號/版次規則。" }
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
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions]
  );
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
      if (data.metrics) {
        setMetrics(data.metrics);
      }
      setSelectedId((current) =>
        nextSubmissions.some((submission: SubmissionSummary) => submission.id === current) ? current : nextSubmissions[0]?.id ?? null
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
  }, []);

  const applyDetailResources = useCallback(
    (resources: {
      diffData: { diff?: BomDiffResult | null } | null;
      summaryData: { summary?: AiSubmissionSummary | null } | null;
      riskData: { report?: AiRiskReport | null } | null;
      reuseData: { candidates?: DesignReuseCandidate[] } | null;
      duplicateGeometryData: { candidates?: DuplicateGeometryCandidate[] } | null;
      sandboxData: { branches?: SandboxBranch[]; current_branch?: SandboxBranch | null } | null;
      discussionData: { comments?: DiscussionComment[] } | null;
      issueData: { issues?: ReviewIssue[] } | null;
      changeData: { changes?: ChangeRequest[] } | null;
      phaseGateData: { checks?: PhaseGateCheck[] } | null;
      approvalMatrixData: { requirements?: ApprovalMatrixRequirement[] } | null;
      markupData: { markups?: PdfMarkup[] } | null;
      shareData: { shares?: ReadonlyShare[] } | null;
      supplierData: { responses?: SupplierPortalResponse[] } | null;
      procurementSyncData: { runs?: ProcurementSyncRun[] } | null;
      whereUsedData: { whereUsed?: WhereUsedEntry[] } | null;
      historyData: { revisions?: ItemRevisionHistoryEntry[] } | null;
    }) => {
      setBomDiff(resources.diffData?.diff ?? null);
      setAiSummary(resources.summaryData?.summary ?? null);
      setAiRiskReport(resources.riskData?.report ?? null);
      setReuseCandidates(resources.reuseData?.candidates ?? []);
      setDuplicateGeometryCandidates(resources.duplicateGeometryData?.candidates ?? []);
      setSandboxBranches(resources.sandboxData?.branches ?? []);
      setCurrentSandboxBranch(resources.sandboxData?.current_branch ?? null);
      setDiscussionComments(resources.discussionData?.comments ?? []);
      setReviewIssues(resources.issueData?.issues ?? []);
      setChangeRequests(resources.changeData?.changes ?? []);
      setPhaseGateChecks(resources.phaseGateData?.checks ?? []);
      setApprovalMatrixRequirements(resources.approvalMatrixData?.requirements ?? []);
      setPdfMarkups(resources.markupData?.markups ?? []);
      setReadonlyShares(resources.shareData?.shares ?? []);
      setSupplierResponses(resources.supplierData?.responses ?? []);
      setProcurementSyncRuns(resources.procurementSyncData?.runs ?? []);
      setWhereUsed(resources.whereUsedData?.whereUsed ?? []);
      setRevisionHistory(resources.historyData?.revisions ?? []);
    },
    []
  );

  const loadDetail = useCallback(async (id: string | null) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    const isCurrentRequest = () => detailRequestIdRef.current === requestId && !controller.signal.aborted;

    try {
    async function fetchDetailJson<T>(url: string): Promise<T | null> {
      const response = await fetch(url, { signal: controller.signal });
      if (!isCurrentRequest() || !response.ok) return null;
      const result = (await response.json()) as T;
      return isCurrentRequest() ? result : null;
    }

    async function fetchBomDiffJson(url: string): Promise<{ diff?: BomDiffResult | null } | null> {
      const response = await fetch(url, { signal: controller.signal });
      if (!isCurrentRequest()) return null;
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBomDiffMessage(typeof result?.error === "string" ? result.error : "BOM diff 尚無可比較資料");
        return null;
      }
      return isCurrentRequest() ? (result as { diff?: BomDiffResult | null }) : null;
    }

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
    const nextDetail = data.submission ?? null;
    setDetail(nextDetail);
    resetDetailSideState();
    const encodedPartNumber = nextDetail?.part_number ? encodeURIComponent(nextDetail.part_number) : null;
    const [
      diffData,
      summaryData,
      riskData,
      reuseData,
      duplicateGeometryData,
      sandboxData,
      discussionData,
      issueData,
      changeData,
      phaseGateData,
      approvalMatrixData,
      markupData,
      shareData,
      supplierData,
      procurementSyncData,
      whereUsedData,
      historyData
    ] = await Promise.all([
      fetchBomDiffJson(`/api/submissions/${id}/bom/diff`),
      fetchDetailJson<{ summary?: AiSubmissionSummary | null }>(`/api/submissions/${id}/ai-summary`),
      fetchDetailJson<{ report?: AiRiskReport | null }>(`/api/submissions/${id}/ai-risks`),
      fetchDetailJson<{ candidates?: DesignReuseCandidate[] }>(`/api/submissions/${id}/reuse-candidates`),
      fetchDetailJson<{ candidates?: DuplicateGeometryCandidate[] }>(`/api/submissions/${id}/duplicate-geometry`),
      fetchDetailJson<{ branches?: SandboxBranch[]; current_branch?: SandboxBranch | null }>(`/api/submissions/${id}/sandbox`),
      fetchDetailJson<{ comments?: DiscussionComment[] }>(`/api/submissions/${id}/discussions`),
      fetchDetailJson<{ issues?: ReviewIssue[] }>(`/api/submissions/${id}/issues`),
      fetchDetailJson<{ changes?: ChangeRequest[] }>(`/api/submissions/${id}/changes`),
      fetchDetailJson<{ checks?: PhaseGateCheck[] }>(`/api/submissions/${id}/phase-gates`),
      fetchDetailJson<{ requirements?: ApprovalMatrixRequirement[] }>(`/api/submissions/${id}/approval-matrix`),
      fetchDetailJson<{ markups?: PdfMarkup[] }>(`/api/submissions/${id}/pdf-markups`),
      fetchDetailJson<{ shares?: ReadonlyShare[] }>(`/api/submissions/${id}/shares`),
      fetchDetailJson<{ responses?: SupplierPortalResponse[] }>(`/api/submissions/${id}/supplier-responses`),
      fetchDetailJson<{ runs?: ProcurementSyncRun[] }>(`/api/integrations/procurement/sync-runs?submissionId=${encodeURIComponent(id)}`),
      encodedPartNumber ? fetchDetailJson<{ whereUsed?: WhereUsedEntry[] }>(`/api/items/${encodedPartNumber}/where-used`) : Promise.resolve(null),
      encodedPartNumber
        ? fetchDetailJson<{ revisions?: ItemRevisionHistoryEntry[] }>(`/api/items/${encodedPartNumber}/revisions`)
        : Promise.resolve(null)
    ]);
    if (!isCurrentRequest()) return;
    applyDetailResources({
      diffData,
      summaryData,
      riskData,
      reuseData,
      duplicateGeometryData,
      sandboxData,
      discussionData,
      issueData,
      changeData,
      phaseGateData,
      approvalMatrixData,
      markupData,
      shareData,
      supplierData,
      procurementSyncData,
      whereUsedData,
      historyData
    });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
    } finally {
      if (detailAbortRef.current === controller) {
        detailAbortRef.current = null;
        setLoadingDetailId(null);
      }
    }
  }, [applyDetailResources, resetDetailSideState]);

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

  const rememberSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || typeof window === "undefined") return;
    if (recentSearches[0] === trimmed) return;
    const next = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 6);
    window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next));
    setRecentSearches(next);
  }, [recentSearches]);

  const rememberDrawing = useCallback((submission: SubmissionDetail) => {
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
    }
  }, [currentUser, loadNotifications]);

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
      visibleSubmissions.some((submission) => submission.id === current) ? current : visibleSubmissions[0]?.id ?? null
    );
  }, [visibleSubmissions]);

  useEffect(() => {
    if (currentUser) {
      loadDetail(selectedId).catch(console.error);
    }
  }, [currentUser, loadDetail, selectedId]);

  useEffect(() => {
    if (detail) rememberDrawing(detail);
  }, [detail, rememberDrawing]);

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
      alert(body.error ?? "操作失敗");
    }
    await loadSubmissions(status, debouncedSearchQuery, finderFilters);
    await loadDetail(selectedId);
    await loadNotifications();
    setActionLoading(false);
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
      alert(body.error ?? "編輯預約操作失敗");
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
      alert(body.error ?? "建立試作分支失敗");
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
      alert(body.error ?? "更新試作分支失敗");
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
      alert(body.error ?? "合併試作分支失敗");
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
      alert(body.error ?? "建立唯讀分享失敗");
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
      alert(body.error ?? "撤銷唯讀分享失敗");
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
      alert(body.error ?? "關閉供應商回覆失敗");
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
      alert(body.error ?? "建立外部系統同步失敗");
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
      alert(body.error ?? "確認外部系統同步失敗");
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
      alert(body.error ?? "新增討論留言失敗");
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
      alert(body.error ?? "結案討論失敗");
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
      alert(body.error ?? "建立審核問題失敗");
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
      alert(body.error ?? "結案審核問題失敗");
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
      alert(body.error ?? "建立變更需求失敗");
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
      alert(body.error ?? "更新變更決議失敗");
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
      alert(body.error ?? "啟用階段關卡失敗");
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
      alert(body.error ?? "更新階段關卡失敗");
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
      alert(body.error ?? "啟用簽核矩陣失敗");
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
      alert(body.error ?? "更新簽核矩陣失敗");
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
      alert(body.error ?? "新增 PDF 標註失敗");
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
      alert(body.error ?? "結案 PDF 標註失敗");
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
              loadNotifications().catch(console.error);
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

        <section className="metrics" aria-label="送審統計">
          <Metric label="待審核" value={metrics.pending} />
          <Metric label="已發布" value={metrics.released} />
          <Metric label="已駁回" value={metrics.rejected} />
          <Metric label="失敗" value={metrics.failed} />
        </section>

        <NotificationDropdown>
        <details className="panel notification-center compact-notifications" ref={notificationDropdownRef}>
          <summary className="panel-header" aria-label="通知摘要下拉選單">
            <h2>
              <Bell size={16} aria-hidden="true" /> 通知摘要
            </h2>
            <span className={notificationSummary.critical > 0 ? "notification-count critical" : "notification-count"}>
              {notificationSummary.total} 件
            </span>
          </summary>
          {notifications.length === 0 ? (
            <div className="empty compact">目前沒有需要立即處理的提醒。</div>
          ) : (
            <div className="notification-list">
              {notifications.slice(0, 6).map((notification) => (
                <button
                  className={`notification-item ${notification.severity}`}
                  type="button"
                  key={notification.id}
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    openNotification(notification).catch(console.error);
                  }}
                  title="開啟對應送審明細"
                >
                  <span>{notification.title}</span>
                  <strong>{notification.message}</strong>
                  <small>{new Date(notification.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
          )}
        </details>
        </NotificationDropdown>
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
              <strong>
                {submission.drawing_number} 版次 {submission.revision}
              </strong>
              <span>
                {submission.part_number} · {submission.part_name} · {statusLabels[submission.status]}
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

      <div className="grid">
        <SubmissionTable>
        <section className="panel">
          <div className="panel-header">
            <h2>圖面資料</h2>
          </div>
          {loading ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>圖號</th>
                      <th>料號</th>
                      <th>品名</th>
                      <th>版次</th>
                      <th>狀態</th>
                      <th>檔案狀態</th>
                      <th>最近更新</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                </table>
              </div>
            <div className="empty">載入中...</div>
            </>
          ) : visibleSubmissions.length === 0 ? (
            <div className="empty">目前沒有可查看的送審資料。</div>
          ) : (
            <div
              className="table-wrap virtual-table-wrap"
              ref={submissionTableWrapRef}
              onScroll={(event) => setSubmissionTableScrollTop(event.currentTarget.scrollTop)}
              data-rendered-rows={virtualTable.renderedCount}
              data-total-rows={visibleSubmissions.length}
              data-transition-pending={isSubmissionTransitionPending}
            >
              <table>
                <thead>
                  <tr>
                    <th>圖號</th>
                    <th>料號</th>
                    <th>品名</th>
                    <th>版次</th>
                    <th>狀態</th>
                    <th>檔案狀態</th>
                    <th>最近更新</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {virtualTable.topHeight > 0 ? (
                    <tr className="virtual-spacer" aria-hidden="true">
                      <td colSpan={8} style={{ height: virtualTable.topHeight }} />
                    </tr>
                  ) : null}
                  {virtualTable.rows.map((submission) => (
                    <SubmissionRow
                      key={submission.id}
                      submission={submission}
                      selected={submission.id === selectedId}
                      favorite={favoriteDrawings.some((drawing) => drawing.id === submission.id)}
                      onSelect={setSelectedId}
                      onToggleFavorite={toggleFavoriteDrawing}
                    />
                  ))}
                  {virtualTable.bottomHeight > 0 ? (
                    <tr className="virtual-spacer" aria-hidden="true">
                      <td colSpan={8} style={{ height: virtualTable.bottomHeight }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {hasMoreSubmissions ? (
                <div className="pagination-actions">
                  <button className="secondary-button" type="button" onClick={() => loadMoreSubmissions().catch(console.error)} disabled={loadingMoreSubmissions}>
                    {loadingMoreSubmissions ? "載入中..." : "載入更多"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>

                </SubmissionTable>

        <SubmissionDetailPanel>
        <aside className={isDetailLoading ? "panel detail-panel loading-detail" : "panel detail-panel"} ref={detailPanelRef} aria-busy={isDetailLoading}>
          <div className="panel-header">
            <h2>圖面明細</h2>
            {selectedSummary ? <span className={`badge ${selectedSummary.status}`}>{statusLabels[selectedSummary.status]}</span> : null}
          </div>
          {isDetailLoading ? (
            <div className="detail-loading" data-testid="detail-loading">
              <span>載入選取圖面...</span>
              <div className="detail-skeleton-line" />
              <div className="detail-skeleton-line short" />
            </div>
          ) : null}
          {detail ? (
            <div className="detail">
              <div className="detail-row">
                <span>送審 ID</span>
                <strong>{detail.id}</strong>
              </div>
              <div className="detail-row">
                <span>圖號 / 版次</span>
                <strong>
                  {detail.drawing_number} 版次 {detail.revision}
                </strong>
              </div>
              <div className="detail-row">
                <span>料號 / 品名</span>
                <strong>
                  {detail.part_number} / {detail.part_name}
                </strong>
              </div>
              <div className="detail-row">
                <span>材質 / 表面處理</span>
                <strong>
                  {detail.material} / {detail.surface_finish}
                </strong>
              </div>
              <div className="detail-row">
                <span>變更原因</span>
                <p>{detail.change_description}</p>
              </div>
              <div className={detail.active_lock ? "checkout-card locked" : "checkout-card"}>
                <div>
                  <span className="section-label">編輯預約</span>
                  {detail.active_lock ? (
                    <>
                      <strong>{detail.active_lock.locked_by_name}</strong>
                      <small>
                        {detail.active_lock.lock_reason} · 到期 {new Date(detail.active_lock.expires_at).toLocaleString()}
                      </small>
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
                      <strong>
                        {currentSandboxBranch.branch_name} · {formatWorkflowStatus(currentSandboxBranch.status)}
                      </strong>
                    ) : (
                      <strong>試作分支</strong>
                    )}
                    <small>啟用中的試作送審需先合併，才可進入核准與發布。</small>
                  </div>
                  <GitBranch size={18} aria-hidden="true" />
                </div>
                {currentSandboxBranch?.status === "active" ? (
                  <div className="readonly-share-row">
                    <small>
                      來源 {currentSandboxBranch.source_drawing_number} 版次 {currentSandboxBranch.source_revision}
                    </small>
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
                    <small>目前沒有試作分支。</small>
                  ) : (
                    sandboxBranches.map((branch) => (
                      <div className="readonly-share-item" key={branch.id}>
                        <div className="readonly-share-row">
                          <strong>{branch.branch_name}</strong>
                          <span className={`readonly-share-status ${branch.status}`}>{branch.merged_at ? "已合併" : formatWorkflowStatus(branch.status)}</span>
                        </div>
                        <small>
                          {branch.source_drawing_number} 版次 {branch.source_revision} - 試作版次 {branch.sandbox_revision}
                        </small>
                        <small>建立者 {branch.created_by_name}</small>
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
              ) : null}
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
                  <small>目前可見範圍內沒有相似中繼資料候選。</small>
                ) : (
                  <div className="reuse-list">
                    {reuseCandidates.map((candidate) => (
                      <button className="reuse-item" type="button" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                        <strong>
                          <Copy size={14} aria-hidden="true" /> {candidate.part_number} · 版次 {candidate.revision}
                        </strong>
                        <span>
                          分數 {candidate.score} · {candidate.drawing_number} · {statusLabels[candidate.status]}
                        </span>
                        <small>{candidate.part_name}</small>
                        <small>{candidate.match_reasons.slice(0, 3).join(" / ")}</small>
                        {candidate.matched_files.length > 0 ? <small>檔案：{candidate.matched_files.join(", ")}</small> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="reuse-panel">
                <div>
                  <span className="section-label">重複幾何搜尋</span>
                  <strong>
                    {duplicateGeometryCandidates.length > 0
                      ? `${duplicateGeometryCandidates.length} 筆指紋相符`
                      : "沒有重複指紋"}
                  </strong>
                </div>
                {duplicateGeometryCandidates.length === 0 ? (
                  <small>目前可見範圍內沒有找到檔案指紋重複。</small>
                ) : (
                  <div className="reuse-list">
                    {duplicateGeometryCandidates.map((candidate) => (
                      <button className="reuse-item" type="button" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                        <strong>
                          <Copy size={14} aria-hidden="true" /> {candidate.part_number} · {candidate.duplicate_level}
                        </strong>
                        <span>
                          指紋 {candidate.fingerprint_score} · {candidate.drawing_number} · {statusLabels[candidate.status]}
                        </span>
                        <small>{candidate.fingerprint_signals.slice(0, 3).join(" / ")}</small>
                        {candidate.matched_files.length > 0 ? <small>檔案：{candidate.matched_files.join(", ")}</small> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="revision-history">
                <div className="section-label">版次紀錄</div>
                {revisionHistory.length === 0 ? (
                  <small>目前沒有可查看的版次紀錄。</small>
                ) : (
                  <div className="revision-list">
                    {revisionHistory.map((entry) => (
                      <div className="revision-item" key={entry.submission_id}>
                        <div>
                          <strong>
                            {entry.drawing_number} 版次 {entry.revision}
                          </strong>
                          <small>{entry.submission_id}</small>
                        </div>
                        <div className="revision-status">
                          <span className={`badge ${entry.status}`}>{statusLabels[entry.status]}</span>
                          {entry.status === "Obsolete" ? (
                            <small>
                              取代來源 {entry.superseded_by_submission_id ?? "-"} · 廢止時間 {entry.obsolete_at ?? "-"}
                            </small>
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
                      <strong>{reference.source_filename}</strong>
                      <span>
                        {reference.reference_type} → {reference.referenced_filename}
                      </span>
                      <small>
                        數量 {reference.quantity} · {reference.extraction_method} · {reference.confidence}
                      </small>
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
                  <small>尚未產生 BOM 草稿；可由組立件 CAD 引用關係產生。</small>
                ) : detail.bom.lines.length === 0 ? (
                  <small>BOM 草稿已建立，但目前沒有子件行。</small>
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
                        <span>
                          版次 {line.child_revision ?? line.child_submission_revision ?? "-"} · 數量 {line.quantity}
                        </span>
                        {line.child_part_name || line.child_drawing_number ? (
                          <small>
                            {line.child_part_name ?? "-"} · {line.child_drawing_number ?? "-"}
                          </small>
                        ) : null}
                        <small>{line.source_filename ?? "沒有來源檔案"}</small>
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
                    <span>版次 {bomDiff.base_revision} → 版次 {bomDiff.target_revision}</span>
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
                        <strong>
                          {bomDiffLabels[line.change_type]} · {describeBomDiffLine(line)} · {line.child_part_number}
                        </strong>
                        <span>
                          版次 {line.from_revision ?? "-"} / 數量 {line.from_quantity ?? "-"} → 版次 {line.to_revision ?? "-"} / 數量{" "}
                          {line.to_quantity ?? "-"}
                        </span>
                        <small>
                          來源 {line.from_source_filename ?? "-"} → {line.to_source_filename ?? "-"}
                        </small>
                      </div>
                    ))}
                </div>
              ) : detail.bom ? (
                <div className="bom-diff-list">
                  <div className="section-label">BOM 差異</div>
                  <small>{bomDiffMessage || "尚無可比較的前一版 BOM。"}</small>
                </div>
              ) : null}
              <div className="where-used-list">
                <div className="section-label">使用處</div>
                {whereUsed.length === 0 ? (
                  <small>目前沒有上層 BOM 使用此料號。</small>
                ) : (
                  whereUsed.slice(0, 6).map((entry) => {
                    const whereUsedState = getWhereUsedState(entry);
                    return (
                      <div className="where-used-item" key={`${entry.parent_submission_id}-${entry.bom_header_id}`}>
                        <strong>
                          {entry.parent_part_number} · 版次 {entry.parent_revision}
                        </strong>
                        <span>
                          {entry.parent_drawing_number} · 數量 {entry.quantity} · 子件版次 {entry.child_revision ?? "-"}
                        </span>
                        <small>
                          {statusLabels[entry.parent_status]} · {entry.parent_submission_id}
                        </small>
                        <span className={`bom-line-state ${whereUsedState.className}`}>{whereUsedState.label}</span>
                      </div>
                    );
                  })
                )}
              </div>
              {detail.release_package ? (
                <div className="release-package-card">
                  <div>
                    <span className="section-label">發布包</span>
                    <strong>{detail.release_package.package_filename}</strong>
                    <small>
                      ZIP · {(detail.release_package.file_size / 1024).toFixed(1)} KB · SHA256 {detail.release_package.sha256}
                    </small>
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
                    <small>此筆已發布資料尚未產生 ZIP 發布包。</small>
                  </div>
                </div>
              ) : null}
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
                      <small>目前沒有同步紀錄。</small>
                    ) : (
                      procurementSyncRuns.map((run) => (
                        <div className="readonly-share-item" key={run.id}>
                          <div className="readonly-share-row">
                            <strong>
                              {run.target_system} / {run.external_reference ?? run.id}
                            </strong>
                            <span className={`readonly-share-status ${run.status}`}>{formatWorkflowStatus(run.status)}</span>
                          </div>
                          <small>
                            送出時間 {run.created_at}，送出者 {run.created_by_name}
                          </small>
                          {run.status === "sent" ? (
                            <button className="secondary-button" type="button" onClick={() => acknowledgeProcurementSyncRun(run.id)} disabled={shareLoading}>
                              <Check size={14} aria-hidden="true" />
                              確認
                            </button>
                          ) : (
                            <small>
                              結案時間 {run.acknowledged_at ?? "-"}，結案者 {run.acknowledged_by_name ?? "-"}
                            </small>
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
                          <small>
                            到期 {share.expires_at} · 存取 {share.access_count}
                            {share.last_accessed_at ? ` · 最近 ${share.last_accessed_at}` : ""}
                          </small>
                          <small>
                            供應商回覆 {share.response_count} / 未結 {share.open_response_count}
                            {share.latest_response_at ? ` / 最新 ${share.latest_response_at}` : ""}
                          </small>
                          <small>建立者 {share.created_by_name}</small>
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
                            <strong>
                              {response.response_kind === "acknowledgement" ? "確認" : "提問"} / {response.supplier_name}
                            </strong>
                            <span className={`readonly-share-status ${response.status}`}>{formatWorkflowStatus(response.status)}</span>
                          </div>
                          <small>
                            {response.supplier_email} / {response.share_label} / {response.created_at}
                          </small>
                          <p>{response.message}</p>
                          {response.status === "open" ? (
                            <button className="secondary-button" type="button" onClick={() => closeSupplierResponse(response.id)} disabled={shareLoading}>
                              <Check size={14} aria-hidden="true" />
                              關閉
                            </button>
                          ) : (
                            <small>
                              結案時間 {response.closed_at ?? "-"}，結案者 {response.closed_by_name ?? "-"}
                            </small>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <div className="file-list" aria-label="檔案">
                <div className="section-label file-list-label">檔案</div>
                {detail.files.map((file) => (
                  <div className="file-item" key={file.id}>
                    <strong>
                      <FileText size={14} aria-hidden="true" /> {file.file_role.toUpperCase()} {file.original_filename}
                    </strong>
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
                    <small>{file.local_path}</small>
                    {file.gdrive_file_id ? (
                      <div className="drive-preview" aria-label={`Google Drive PDF 預覽：${file.original_filename}`}>
                        <iframe
                          src={drivePdfPreviewUrl(file.gdrive_file_id)}
                          title={`Google Drive PDF 預覽 - ${file.original_filename}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : null}
                    <small>SHA256 {file.sha256}</small>
                  </div>
                ))}
              </div>
              <div className="markup-panel">
                <div className="section-label">PDF 標註</div>
                {pdfMarkups.length === 0 ? (
                  <small>目前沒有 PDF 標註。</small>
                ) : (
                  <div className="markup-list">
                    {pdfMarkups.map((markup) => (
                      <div className={`markup-item ${markup.status}`} key={markup.id}>
                        <div className="markup-heading">
                          <strong>
                            頁次 {markup.page_number} · X {markup.x_percent}% · Y {markup.y_percent}%
                          </strong>
                          <span>{markup.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{markup.body}</p>
                        <small>
                          檔案：{markup.file_original_filename} · 建立者 {markup.author_name} · {new Date(markup.created_at).toLocaleString()}
                        </small>
                        {markup.status === "resolved" ? (
                          <small>
                            結案者 {markup.resolved_by_name ?? "-"} ·{" "}
                            {markup.resolved_at ? new Date(markup.resolved_at).toLocaleString() : "-"}
                          </small>
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
                          <span>{comment.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{comment.body}</p>
                        <small>
                          {comment.file_original_filename ? `檔案：${comment.file_original_filename}` : "送審資料"} ·{" "}
                          {new Date(comment.created_at).toLocaleString()}
                        </small>
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
                          <span>{issue.status === "resolved" ? "已結案" : "未結案"}</span>
                        </div>
                        <p>{issue.description}</p>
                        <small>
                          {issue.file_original_filename ? `檔案：${issue.file_original_filename}` : "送審資料"} · 提出者 {issue.raised_by_name} ·{" "}
                          負責人 {issue.assignee_name ?? "-"} ·{" "}
                          {new Date(issue.created_at).toLocaleString()}
                        </small>
                        {issue.status === "resolved" ? (
                          <small>
                            結案說明：{issue.resolution ?? "-"} · {issue.resolved_by_name ?? "-"}
                          </small>
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
                          <span>{formatWorkflowStatus(check.status)}</span>
                        </div>
                        <p>{check.checklist_item}</p>
                        <small>
                          {check.required === 1 ? "必要" : "選用"} · 建立者 {check.created_by_name}
                        </small>
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
                          <small>
                            決議：{check.decision_comment ?? "-"} · {check.decided_by_name ?? "-"}
                          </small>
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
                          <span>{formatWorkflowStatus(requirement.status)}</span>
                        </div>
                        <p>
                          {requirement.approved_count}/{requirement.min_count} 位審核者已核准
                        </p>
                        <small>建立者 {requirement.created_by_name}</small>
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
                          <small>
                            決議：{requirement.decision_comment ?? "-"} - {requirement.decided_by_name ?? "-"}
                          </small>
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
                          <span>{formatWorkflowStatus(change.status)}</span>
                        </div>
                        <p>{change.reason}</p>
                        <small>影響：{change.impact}</small>
                        <small>
                          申請者 {change.requested_by_name} · {new Date(change.created_at).toLocaleString()}
                        </small>
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
                          <small>
                            決議：{change.decision_comment ?? "-"} · {change.decided_by_name ?? "-"}
                          </small>
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
              ) : null}
            </div>
          ) : (
            <div className="empty">請選擇一筆圖面資料查看明細。</div>
          )}
        </aside>
        </SubmissionDetailPanel>
      </div>

      <AssistantPanel>
      <button
        className="mobile-chat-toggle"
        type="button"
        onClick={() => setMobileChatOpen(true)}
        aria-label="開啟 AI 助手"
        title="AI 助手"
      >
        <MessageSquare size={18} aria-hidden="true" />
        AI
      </button>

      <section className={`panel chat ${mobileChatOpen ? "mobile-open" : ""}`}>
        <div className="panel-header">
          <h2>
            <MessageSquare size={16} aria-hidden="true" /> AI 助手
          </h2>
          <button
            className="icon-button mobile-chat-close"
            type="button"
            onClick={() => setMobileChatOpen(false)}
            aria-label="關閉 AI 助手"
            title="關閉"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="chat-messages">
          {chatMessages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <div>{message.content}</div>
              {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
                <div className="message-sources" aria-label="回答來源">
                  <strong>來源</strong>
                  <ul>
                    {message.sources.map((source, sourceIndex) => (
                      <li key={`${source.label}-${sourceIndex}`}>
                        <span>{source.label}</span>
                        <small>
                          {(sourceTypeLabels as Record<string, string>)[source.type] ?? source.type} - {source.detail}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
          {chatLoading ? <div className="message assistant">思考中...</div> : null}
        </div>
        <div className="chat-form">
          <textarea
            value={chatInput}
            placeholder="輸入問題，例如：目前有哪些待審？"
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitChat().catch(console.error);
              }
            }}
          />
          <button className="primary-button" onClick={() => submitChat()} disabled={chatLoading || !chatInput.trim()}>
            <Send size={16} aria-hidden="true" />
            送出
          </button>
        </div>
      </section>
      </AssistantPanel>
    </>
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

function drivePdfPreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}
