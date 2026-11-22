"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import type { ApprovalWorkbenchQuery, ApprovalWorkbenchListResponse, ApprovalWorkbenchFilters,
  ApprovalWorkbenchRow } from "@/lib/approval-workbench-contract";
import { projectApprovalDecisionFeedback } from "@/lib/approval-outcome-feedback";
import { isPdmOwnerApprovalAction } from "@/lib/pdm-approval-owner-route";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { LoadingIndicator } from "@/components/loading-indicator";

const statusFilters = [
  { value: "active", label: "待處理" },
  { value: "pending", label: "待審" },
  { value: "all", label: "全部" }
] as const;
const actionFilters = [
  { value: "all", label: "全部" },
  { value: "numbering.pdm_drawing_revision_review", label: "圖面研發版審核" },
  { value: "numbering.pdm_drawing_rd_void_review", label: "圖面研發版作廢審核" },
  { value: "numbering.pdm_part_change_review", label: "料號變更審核" },
  { value: "transfer.package_review", label: "技轉包審核" }
] as const;
type StatusFilter = (typeof statusFilters)[number]["value"];
type ActionFilter = (typeof actionFilters)[number]["value"];
type InboxResponse = Partial<ApprovalWorkbenchListResponse> & {
  items?: ApprovalWorkbenchRow[];
};
type InboxFilters = ApprovalWorkbenchFilters & { total: number };
const initialQuery: ApprovalWorkbenchQuery = {
  status: "active", domain: "all", action: "all", query: "", limit: 100
};
const rowKey = (item: ApprovalWorkbenchRow) => item.rowKey;
const skipDetailFetch = () => true;

export function PrincipalApprovalInbox() {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [legacyRedirectMessage, setLegacyRedirectMessage] = useState<string | null>(null);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-submitted-approval-drawer-width" });
  const onUnauthorized = useCallback(() => setUnauthorized(true), []);
  const controller = usePdmWorkbenchController<ApprovalWorkbenchRow, ApprovalWorkbenchRow,
    ApprovalWorkbenchQuery, InboxFilters>({
      initialQuery,
      initialLocation: readLocation,
      readLocation,
      writeLocation,
      buildListUrl,
      buildDetailUrl: (key) => `/api/pdm/review-requests/${encodeURIComponent(key)}`,
      getRowKey: rowKey,
      normalizeResponse,
      normalizeDetail: (value) => value as ApprovalWorkbenchRow,
      detailRowKey: rowKey,
      detailHistoryMode: "replace",
      paginationMode: "server-bidirectional",
      shouldSkipDetailFetch: skipDetailFetch,
      listErrorMessage: "審核清單目前無法載入，請重新整理。",
      onUnauthorized
    });
  const {
    initialized, rows, setRows, filters, loading, error: controllerError, setError: setControllerError, query, setQuery,
    selectedKey, setSelectedKey, nextCursor, previousCursor, pageIndex,
    loadRows, goNext, goPrevious, openDetail, closeDetail
  } = controller;

  useEffect(() => {
    const legacyRedirect = new URLSearchParams(window.location.search).get("legacyRedirect");
    const messages: Record<string, string> = {
      numbering_approvals: "已轉到審核工作台。",
      numbering_change_reviews: "已轉到審核工作台。"
    };
    setLegacyRedirectMessage(legacyRedirect ? messages[legacyRedirect] ?? null : null);
  }, []);
  useEffect(() => {
    if (filters) setUnauthorized(false);
  }, [filters]);

  const submittedView = query.view === "submitted";
  const listError = controllerError === "permission_not_granted"
    ? (submittedView ? "你目前沒有查看送審紀錄的權限。" : "你目前沒有查看待審工作的權限。")
    : controllerError;
  const listLoading = !initialized || loading;
  const showList = !unauthorized && !listError;
  const submittedDetail = submittedView && showList
    ? rows.find((item) => item.rowKey === selectedKey)
    : undefined;
  const activeRowKey = selectedKey ?? (submittedView ? focusedKey : null);
  const showAction = useMemo(() => submittedView ||
    new Set(rows.map((item) => item.actionCode)).size > 1, [submittedView, rows]);
  const openApprovalRow = useCallback((item: ApprovalWorkbenchRow) => {
    if (submittedView) {
      setFocusedKey(rowKey(item));
      void openDetail(rowKey(item));
      return;
    }
    if (item.historyOnly) return;
    const transferReview = item.source === "platform" && item.actionCode === "transfer.package_review";
    if (!(transferReview || (item.source === "pdm_work_review" && isPdmOwnerApprovalAction(item.actionCode))) ||
        item.status !== "pending" || !item.ownerHref) {
      setError("此審核尚無可操作的工作區，請重新整理清單。");
      return;
    }
    setError("");
    const ownerUrl = new URL(item.ownerHref, window.location.origin);
    if (ownerUrl.origin !== window.location.origin ||
        ownerUrl.pathname !== `/approvals/${encodeURIComponent(item.id)}`) {
      setError("審核目的地無效，請重新整理清單。");
      return;
    }
    ownerUrl.searchParams.set("returnTo", approvalDrawerReturnTo(item.id));
    router.push(`${ownerUrl.pathname}${ownerUrl.search}`);
  }, [openDetail, router, submittedView]);
  const keyboard = useListKeyboardShortcuts({
    items: rows, selectedKey: activeRowKey, listRef,
    rowSelector: "[data-approval-workbench-row='true']",
    getKey: rowKey,
    getCopyText: (item) => item.targetSummary || item.title,
    onSelect: (item, options) => {
      if (options.openDetail) openApprovalRow(item);
      else if (submittedView) setFocusedKey(rowKey(item));
      else setSelectedKey(rowKey(item));
    },
    onOpenDetail: openApprovalRow,
    onCloseDetail: () => closeDetail(),
    isDetailOpen: Boolean(submittedDetail)
  });
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try { await loadRows(); }
    finally { setRefreshing(false); }
  }, [loadRows]);

  return <div className="approval-platform-page">
    <header className="topbar">
      <h1>審核工作台 <StatusScopeHelp scope="approvalInbox" /></h1>
      <button className="secondary-button" type="button" onClick={() => void refresh()}
        disabled={refreshing} title="重新整理">
        <RefreshCw size={16} aria-hidden="true" />重新整理
      </button>
    </header>
    {legacyRedirectMessage ? <div className="approval-message info">{legacyRedirectMessage}</div> : null}
    {listError || error ? <div className="approval-message error" role="alert">{listError || error}</div> : null}
    <section className="approval-filter-bar pdm-workbench-filter-bar" aria-label="審核篩選">
      <label className="approval-filter-field">
        <span>檢視</span>
        <select value={query.view ?? "review"} onChange={event => {
          const mine = event.target.value === "submitted";
          setFocusedKey(null);
          setError("");
          setControllerError("");
          setRows([]);
          setQuery(current => ({ ...current, view: mine ? "submitted" : undefined,
            status: mine ? "all" : "active" }));
          closeDetail();
        }}>
          <option value="review">待審工作</option>
          <option value="submitted">我的送審</option>
        </select>
      </label>
      <label className="approval-filter-field approval-filter-search">
        <span>搜尋</span>
        <div className="approval-filter-search-control">
          <Search size={16} aria-hidden="true" />
          <input value={query.query}
            onChange={(event) => setQuery((current) => ({ ...current, query: event.target.value }))}
            placeholder="圖號、料號、品名、送審者" aria-label="搜尋圖號、料號、品名或送審者" />
        </div>
      </label>
      <label className="approval-filter-field">
        <span>狀態</span>
        <select value={query.status} onChange={(event) => setQuery((current) =>
          ({ ...current, status: event.target.value as StatusFilter }))}>
          {statusFilters.map((filter) => <option value={filter.value} key={filter.value}>{filter.label}</option>)}
        </select>
      </label>
      <label className="approval-filter-field">
        <span>審核類型</span>
        <select value={query.action} onChange={(event) => setQuery((current) =>
          ({ ...current, action: event.target.value as ActionFilter }))}>
          {actionFilters.map((filter) => <option value={filter.value} key={filter.value}>{filter.label}</option>)}
        </select>
      </label>
      {query.status !== (query.view === "submitted" ? "all" : "active") || query.action !== "all" || query.query ?
        <button className="secondary-button" type="button" onClick={() =>
          setQuery({ ...initialQuery, view: query.view, status: query.view === "submitted" ? "all" : "active" })}>
          清除篩選
        </button> : null}
    </section>
    {unauthorized && !listError ? <div className="panel approval-empty">請先登入。</div> : null}
    {showList ? <div className="approval-platform-layout">
      <section className="panel approval-inbox-panel" aria-label="審核清單">
        <div className="panel-header">
          <h2>{query.view === "submitted" ? "我的送審" : "審核清單"}</h2>
          <span className="approval-count">{listLoading && rows.length === 0 ? <LoadingIndicator>讀取中</LoadingIndicator> : `${filters?.total ?? rows.length} 筆`}</span>
        </div>
        <PdmWorkbenchList rows={rows} getRowKey={rowKey} selectedKey={activeRowKey}
          ariaLabel="審核工作清單" className="approval-inbox-list"
          tableClassName="approval-workbench-table" rowDataAttribute="data-approval-workbench-row"
          rowAriaKeyShortcuts={keyboard.shortcuts} containerRef={listRef}
          onContainerKeyDown={keyboard.handleKeyDown} loading={listLoading}
          loadingState={<div className="approval-empty"><LoadingIndicator>正在載入審核清單...</LoadingIndicator></div>}
          emptyState={<div className="approval-empty">{submittedView
            ? "目前沒有符合條件的送審紀錄。" : "目前沒有符合條件的待處理審核。"}</div>}
          onOpenRow={openApprovalRow}
          onRowKeyDown={(event, item) => {
            if (!submittedView || event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            openApprovalRow(item);
          }}
          columns={[
            { key: "target", header: "審核項目", dataLabel: "審核項目", className: "approval-workbench-col-target",
              render: (item) => <span className="approval-inbox-primary"><strong>{item.targetSummary || item.title}</strong>
                {showAction ? <small>{item.actionTitle}</small> : null}</span> },
            { key: "requester", header: "送審者", dataLabel: "送審者", className: "approval-workbench-col-requester",
              render: (item) => <span>{item.requestedByName ?? "未知申請者"}</span> },
            { key: "status", header: "狀態", dataLabel: "狀態", className: "approval-workbench-col-status",
              render: (item) => {
                const feedback = submittedView ? submittedApprovalFeedback(item) : projectApprovalDecisionFeedback(item);
                return <span className="approval-status-cell"><span className={`approval-status-chip ${submittedView ? feedback.tone : "warning"}`}>
                  {feedback.label}</span></span>;
              } },
            { key: "requestedAt", header: "送審時間", dataLabel: "送審時間", className: "approval-workbench-col-time",
              render: (item) => <time dateTime={item.requestedAt}>{formatApprovalDate(item.requestedAt)}</time> }
          ]} />
        <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)}
          hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={goPrevious} onNext={goNext} />
      </section>
    </div> : null}
    {submittedDetail ? <SubmittedApprovalDetail item={submittedDetail} width={drawerWidth}
      onClose={closeDetail} onStartResize={startDrawerResize} /> : null}
  </div>;
}

function SubmittedApprovalDetail({ item, width, onClose, onStartResize }: {
  item: ApprovalWorkbenchRow;
  width: number;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
}) {
  const target = item.targetSummary || item.title;
  const feedback = submittedApprovalFeedback(item);
  return <PdmEntityDetailDrawer open width={width} ariaLabel="送審明細" title={target}
    subtitle={item.actionTitle} status={<span className={`approval-status-chip ${feedback.tone}`}>{feedback.label}</span>}
    entityCode={item.id} className="approval-detail-drawer" keepOpenSelector=".approval-inbox-list"
    onClose={onClose} onStartResize={onStartResize}>
    <div className="pdm-entity-drawer-body approval-detail-drawer-body">
      <section className="drawing-detail-section" aria-label="送審資料">
        <dl className="approval-submitted-facts">
          {item.title && item.title !== target ? <div><dt>案件名稱</dt><dd>{item.title}</dd></div> : null}
          <div><dt>送審者</dt><dd>{item.requestedByName ?? "未知申請者"}</dd></div>
          <div><dt>送審時間</dt><dd><time dateTime={item.requestedAt}>{formatApprovalDate(item.requestedAt, true)}</time></dd></div>
          <div><dt>審核單號</dt><dd>{item.id}</dd></div>
        </dl>
      </section>
    </div>
  </PdmEntityDetailDrawer>;
}

function submittedApprovalFeedback(item: ApprovalWorkbenchRow) {
  if (item.source === "pdm_work_review") {
    if (item.status === "approved") return { label: "已核准", tone: "success" };
    if (item.status === "needs_info") return projectApprovalDecisionFeedback({ status: "rejected" });
  }
  return projectApprovalDecisionFeedback({ ...item, applyStatus: item.status === "applied" ? "applied" : undefined });
}

function readLocation(): PdmWorkbenchLocationState<ApprovalWorkbenchQuery> {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const statusValue = params.get("status");
  const actionValue = params.get("action");
  const mine = params.get("view") === "submitted";
  const status = statusFilters.find((item) => item.value === statusValue)?.value ?? (mine ? "all" : "active");
  const action = actionFilters.find((item) => item.value === actionValue)?.value ?? "all";
  const requestId = params.get("requestId")?.trim();
  const page = Number(params.get("page"));
  return {
    query: { ...initialQuery, ...(mine ? { view: "submitted" } : {}), status, action, query: normalizeQuery(params.get("query")) },
    detailKey: requestId ? `approval:${requestId.startsWith("APR-TRF-") ? "platform" : "pdm_work_review"}:${requestId}` : null,
    legacyDetail: null,
    cursor: params.get("cursor"),
    pageIndex: Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
  };
}

function writeLocation(state: PdmWorkbenchLocationState<ApprovalWorkbenchQuery>, mode: "replace" | "push") {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (state.query.view) params.set("view", state.query.view);
  else params.delete("view");
  params.set("status", state.query.status);
  if (state.query.query) params.set("query", normalizeQuery(state.query.query));
  else params.delete("query");
  if (state.query.action !== "all") params.set("action", state.query.action);
  else params.delete("action");
  params.delete("domain");
  const prefix = state.detailKey?.startsWith("approval:platform:")
    ? "approval:platform:" : "approval:pdm_work_review:";
  if (state.detailKey?.startsWith(prefix)) params.set("requestId", state.detailKey.slice(prefix.length));
  else params.delete("requestId");
  if (state.cursor) {
    params.set("cursor", state.cursor);
    if ((state.pageIndex ?? 0) > 0) params.set("page", String(state.pageIndex));
    else params.delete("page");
  } else {
    params.delete("cursor");
    params.delete("page");
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function buildListUrl(query: ApprovalWorkbenchQuery, cursor: string | null) {
  const params = new URLSearchParams({ status: query.status, limit: String(query.limit), domain: "all" });
  if (query.view) params.set("view", query.view);
  if (query.query) params.set("query", normalizeQuery(query.query));
  if (query.action !== "all") params.set("action", query.action);
  if (cursor) params.set("cursor", cursor);
  if (typeof window !== "undefined") params.set("returnTo", approvalDrawerReturnTo());
  return `/api/approvals/inbox?${params.toString()}`;
}

function normalizeResponse(value: unknown): ApprovalWorkbenchListResponse & { filters: InboxFilters } {
  const body = value as InboxResponse;
  return {
    rows: body.rows ?? body.items ?? [],
    nextCursor: body.nextCursor ?? null,
    previousCursor: body.previousCursor ?? null,
    pageIndex: body.pageIndex ?? 0,
    generatedAt: body.generatedAt ?? new Date().toISOString(),
    filters: { ...(body.filters ?? { status: "active", domain: "all", action: "all", query: "" }),
      total: body.summary?.total ?? body.rows?.length ?? body.items?.length ?? 0 },
    summary: body.summary ?? { total: 0, pending: 0, needsInfo: 0, applyFailed: 0 }
  };
}

function approvalDrawerReturnTo(selectedRequestId?: string) {
  if (typeof window === "undefined") return "/approvals";
  const params = new URLSearchParams(window.location.search);
  if (selectedRequestId) params.set("requestId", selectedRequestId);
  else params.delete("requestId");
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

function normalizeQuery(value: string | null) {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 160);
}

function formatApprovalDate(value: string, includeYear = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", {
    year: includeYear ? "numeric" : undefined,
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}
