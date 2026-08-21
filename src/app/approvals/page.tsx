"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, Search, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import type { ApprovalWorkbenchQuery, ApprovalWorkbenchListResponse } from "@/lib/approval-workbench-contract";
import {
  DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
  DRAWING_DETAIL_DRAWER_MIN_WIDTH,
  DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
  DrawingWorkspaceDrawer
} from "@/components/drawing-workspace-drawer";
import { NumberingSubmissionResult, type NumberingSubmissionResultCandidate } from "@/components/numbering-submission-result";
import { DrawingDetailPreview } from "@/components/drawing-detail-preview";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { isPdmOwnerApprovalAction, resolvePdmApprovalOwnerContext } from "@/lib/pdm-approval-owner-route";
import { UnifiedPdmEntityDetailDrawer } from "@/components/unified-pdm-entity-detail-drawer";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { getStatusDisplay } from "@/lib/status-display";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type ApprovalStatus = "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
type ApprovalDecision = "approved" | "rejected" | "needs_info";

type ApprovalInboxItem = {
  rowKey: string;
  id: string;
  source: string;
  companyId: string;
  actionCode: string;
  actionTitle: string;
  domainCode: string;
  title: string;
  status: ApprovalStatus;
  reason: string;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string;
  packageId: string | null;
  packageCode: string | null;
  packageStatus: string | null;
  targetSummary: string;
  impactSummary: string | null;
  legacy: { table: string; id: string } | null;
  primaryTarget?: { type: string; targetId: string; code: string | null; label: string };
  ownerHref?: string;
  historyOnly?: boolean;
  supersededByRequestId?: string | null;
  supersededAt?: string | null;
};

type ApprovalDetail = ApprovalInboxItem & {
  cleanupPending?: boolean;
  payload: Record<string, unknown>;
  targets: Array<{
    id: string;
    role: "primary" | "child" | "impact";
    type: string;
    targetId: string;
    code: string | null;
    label: string;
    status: string | null;
    snapshot: Record<string, unknown>;
  }>;
  impactSnapshots: Array<{
    id: string;
    snapshotHash: string;
    snapshot: Record<string, unknown>;
    capturedBy: string;
    capturedAt: string;
  }>;
  decisions: Array<{
    id: string;
    approverRole: string;
    approverId: string;
    approverName: string | null;
    decision: ApprovalDecision;
    comment: string | null;
    decidedAt: string;
  }>;
  applyStatus: string | null;
  applyAttempts: number | null;
  applyError: string | null;
};

type InboxResponse = {
  summary?: { total: number; pending: number; needsInfo: number; applyFailed: number };
  rows?: ApprovalInboxItem[];
  items?: ApprovalInboxItem[];
  nextCursor?: string | null;
  previousCursor?: string | null;
  pageIndex?: number;
  filters?: { status: string; domain: string; action: string; query?: string };
  error?: string;
};

const statusFilters = [
  { value: "active", label: "待處理" },
  { value: "pending", label: "待審" },
  { value: "needs_info", label: "補資料" },
  { value: "apply_failed", label: "套用失敗" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已駁回" },
  { value: "all", label: "全部" }
] as const;

const domainFilters = [
  { value: "all", label: "全部" },
  { value: "numbering", label: "圖料" },
  { value: "bom", label: "BOM" },
  { value: "submission", label: "送審" },
  { value: "drawing_package", label: "圖面包" },
  { value: "platform", label: "平台" }
] as const;

const actionFilters = [
  { value: "all", label: "全部" },
  { value: "numbering.release", label: "發行審核" },
  { value: "numbering.release_missing_ma_confirm", label: "發行缺製造圖確認" },
  { value: "numbering.same_drawing_variant_after_release", label: "同圖多料號審核" },
  { value: "numbering.drawing_revision_impact_review", label: "圖面進版影響審核" },
  { value: "numbering.drawing_revision_lifecycle_review", label: "圖面進版審核" },
  { value: "numbering.main_drawing_restore", label: "主圖恢復審核" },
  { value: "numbering.candidate_bundle_review", label: "圖料與首版整包審核" },
  { value: "numbering.obsolete_part_number", label: "料號作廢審核" },
  { value: "numbering.obsolete_ma_drawing", label: "圖號作廢審核" },
  { value: "numbering.obsolete_part_root", label: "圖料根號作廢審核" },
  { value: "submission.obsolete", label: "送審單作廢審核" },
  { value: "bom.release_review", label: "BOM 發行審核" },
  { value: "bom.obsolete_review", label: "BOM 作廢審核" },
  { value: "drawing_package.supplement_review", label: "圖面補件審核" }
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];
type DomainFilter = (typeof domainFilters)[number]["value"];
type ActionFilter = (typeof actionFilters)[number]["value"];

function isDrawingRevisionReviewAction(actionCode: string) {
  return actionCode === "numbering.drawing_revision_impact_review"
    || actionCode === "numbering.drawing_revision_lifecycle_review";
}

function approvalEvidenceRequestId(detail: ApprovalDetail) {
  return detail.actionCode === "numbering.candidate_bundle_review" || isDrawingRevisionReviewAction(detail.actionCode)
    ? detail.id
    : null;
}

const domainText: Record<string, string> = {
  platform: "平台",
  numbering: "圖料",
  submission: "送審",
  bom: "BOM",
  drawing_package: "圖面包"
};
type FeatureStatusResponse = { entityDetail?: { enabled?: boolean } };

const legacyRedirectMessages: Record<string, string> = {
  numbering_approvals: "已從舊的發行審核入口轉到審核工作台；目前已套用圖料審核篩選。",
  bom_reviews: "已從舊的 BOM 審核入口轉到審核工作台；目前已套用 BOM 篩選。",
  numbering_change_reviews: "已從舊的圖面進版影響審核入口轉到審核工作台；目前已套用圖面進版影響審核篩選。"
};

const APPROVAL_DETAIL_DRAWER_ENABLED = true;

export default function ApprovalPlatformPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [legacyRedirectMessage, setLegacyRedirectMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [busy, setBusy] = useState<ApprovalDecision | "retry-apply" | "retry-cleanup" | "reload" | "detail" | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [unifiedEntityDetailEnabled, setUnifiedEntityDetailEnabled] = useState<boolean | null>(null);
  const [unifiedDetailRequestId, setUnifiedDetailRequestId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const initialQuery: ApprovalWorkbenchQuery = { status: "active", domain: "all", action: "all", query: "", limit: 100 };
  const handleUnauthorized = useCallback(() => setState("unauthorized"), []);
  const skipApprovalDetailFetch = useCallback(() => true, []);
  const controller = usePdmWorkbenchController<ApprovalInboxItem, ApprovalDetail, ApprovalWorkbenchQuery, ApprovalWorkbenchListResponse["filters"]>({
    initialQuery,
    initialLocation: readApprovalWorkbenchLocation,
    readLocation: readApprovalWorkbenchLocation,
    writeLocation: writeApprovalWorkbenchLocation,
    buildListUrl: buildApprovalWorkbenchListUrl,
    buildDetailUrl: (rowKey) => `/api/approvals/requests/${encodeURIComponent(rowKey)}`,
    getRowKey: approvalWorkbenchRowKey,
    normalizeResponse: normalizeApprovalWorkbenchResponse,
    normalizeDetail: (value) => {
      const body = value as { request?: ApprovalDetail };
      return body.request ?? value as ApprovalDetail;
    },
    detailRowKey: approvalWorkbenchRowKey,
    detailHistoryMode: "replace",
    paginationMode: "server-bidirectional",
    shouldSkipDetailFetch: skipApprovalDetailFetch,
    listErrorMessage: "審核清單目前無法載入，請重新整理。",
    detailErrorMessage: "這筆審核已不存在或目前無法查看。",
    onUnauthorized: handleUnauthorized
  });
  const {
    initialized,
    rows: items,
    loading,
    error: controllerError,
    query: workbenchQuery,
    setQuery: setWorkbenchQuery,
    selectedKey: selectedId,
    setSelectedKey: setSelectedId,
    nextCursor,
    previousCursor,
    pageIndex,
    loadRows,
    goNext,
    goPrevious,
    openDetail: openControllerDetail,
    closeDetail: closeControllerDetail
  } = controller;
  const statusFilter = workbenchQuery.status as StatusFilter;
  const domainFilter = workbenchQuery.domain as DomainFilter;
  const actionFilter = workbenchQuery.action as ActionFilter;
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({
    storageKey: DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
    defaultWidth: DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
    minWidth: DRAWING_DETAIL_DRAWER_MIN_WIDTH
  });

  useEffect(() => {
    setLegacyRedirectMessage(readLegacyRedirectMessage());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/numbering/state-flow/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<FeatureStatusResponse> : null)
      .then((status) => { if (!cancelled) setUnifiedEntityDetailEnabled(status?.entityDetail?.enabled === true); })
      .catch(() => { if (!cancelled) setUnifiedEntityDetailEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  const visibleActionFilters = useMemo(
    () =>
      actionFilters.filter(
        (filter) => filter.value === "all" || domainFilter === "all" || filter.value.startsWith(`${domainFilter}.`)
      ),
    [domainFilter]
  );
  const showInboxAction = useMemo(() => new Set(items.map((item) => item.actionCode)).size > 1, [items]);
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const selectedOwnerContext = selectedItem ? resolvePdmApprovalOwnerContext(selectedItem) : null;
  const selectedIsPdmOwner = Boolean(selectedItem && isPdmOwnerApprovalAction(selectedItem.actionCode));
  const selectedIsHistoricalPdmReview = Boolean(
    selectedItem
      && selectedIsPdmOwner
      && selectedItem.status !== "pending"
      && selectedItem.status !== "apply_failed"
  );
  const legacyDetailFallback = APPROVAL_DETAIL_DRAWER_ENABLED && (
    selectedIsHistoricalPdmReview
      ||
    (unifiedEntityDetailEnabled !== true && Boolean(selectedItem && !selectedIsPdmOwner))
      || (unifiedEntityDetailEnabled === true && Boolean(selectedItem && !selectedItem.ownerHref && !selectedIsPdmOwner))
  );
  const loadInbox = useCallback(async (options?: { preserveFeedback?: boolean }) => {
    setBusy("reload");
    setError("");
    if (!options?.preserveFeedback) setMessage("");
    await loadRows();
    setBusy(null);
    setState("ready");
  }, [loadRows]);

  const loadDetail = useCallback(async (requestId: string) => {
    setBusy("detail");
    setError("");
    const drawing = readInitialTextParam("drawing");
    const query = drawing ? `?drawing=${encodeURIComponent(drawing)}` : "";
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}${query}`);
    setBusy(null);
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string; canonicalHref?: string };
    if (response.status === 410 && body.canonicalHref) {
      window.location.assign(body.canonicalHref);
      return;
    }
    if (!response.ok || !body.request) {
      setDetail(null);
      setError(body.error ?? "審核明細讀取失敗");
      return;
    }
    setDetail(body.request);
    setComment("");
  }, []);

  useEffect(() => {
    if (initialized && controllerError && state === "loading") {
      setState("error");
      setError(controllerError);
    } else if (initialized && !loading && !controllerError && state === "loading") {
      setState("ready");
    }
  }, [controllerError, initialized, loading, state]);

  useEffect(() => {
    const requestId = readInitialTextParam("requestId");
    if (initialized && requestId && selectedId === requestId) setUnifiedDetailRequestId(requestId);
  }, [initialized, selectedId]);

  useEffect(() => {
    if (!legacyDetailFallback) return;
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [legacyDetailFallback, loadDetail, selectedId]);

  useEffect(() => {
    setDetail(null);
    setComment("");
  }, [selectedId]);

  async function decide(decision: ApprovalDecision) {
    if (!detail) return;
    setBusy(decision);
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/decisions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-decision:${detail.id}:${decision}:${crypto.randomUUID()}`
      },
      body: JSON.stringify({ decision, comment })
    });
    const body = (await response.json().catch(() => ({}))) as {
      request?: ApprovalDetail;
      lifecycle?: { cleanupPending?: boolean };
      error?: string;
      message?: string;
    };
    setBusy(null);
    if (!response.ok || !body.request) {
      setError(body.message ?? body.error ?? "審核決策失敗");
      return;
    }
    setDetail({ ...body.request, cleanupPending: body.lifecycle?.cleanupPending ?? body.request.cleanupPending ?? false });
    setMessage(
      isDrawingRevisionReviewAction(detail.actionCode) && decision === "rejected"
        ? "已退回修改"
        : `已${decision === "approved" ? "核准" : decision === "rejected" ? "駁回" : "要求補資料"}`
    );
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true });
  }

  async function retryCleanup() {
    if (!detail) return;
    setBusy("retry-cleanup");
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-cleanup:${detail.id}`
      },
      body: "{}"
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? body.error ?? "流程整理重試失敗");
      return;
    }
    setDetail((current) => current ? { ...current, cleanupPending: false } : current);
    setMessage(body.message ?? "已完成流程整理。");
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true });
  }

  async function retryApply() {
    if (!detail) return;
    setBusy("retry-apply");
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-apply-retry:${detail.id}:${crypto.randomUUID()}`
      },
      body: "{}"
    });
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string };
    setBusy(null);
    if (!response.ok || !body.request) {
      setError(body.error ?? "審核套用重試失敗");
      return;
    }
    setDetail(body.request);
    setMessage(
      detail.actionCode === "numbering.candidate_bundle_review"
        ? "原核准內容已完成發布；不需要重新送審或人工再次發布。"
        : "審核決策已重新套用。編號仍需由具發布權限者完成發布。"
    );
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true });
  }

  function closeDetail() {
    closeControllerDetail();
    setUnifiedDetailRequestId(null);
    setDetail(null);
    setComment("");
    setMessage("");
    setError("");
    clearApprovalDetailQuery();
  }

  const openApprovalRow = useCallback((item: ApprovalInboxItem) => {
    const ownerContext = resolvePdmApprovalOwnerContext(item);
    const historicalPdmReview = isPdmOwnerApprovalAction(item.actionCode)
      && item.status !== "pending"
      && item.status !== "apply_failed";
    if (historicalPdmReview && APPROVAL_DETAIL_DRAWER_ENABLED) {
      setUnifiedDetailRequestId(null);
      void openControllerDetail(item.id);
      return;
    }
    if (unifiedEntityDetailEnabled !== false && ownerContext) {
      setUnifiedDetailRequestId(item.id);
      void openControllerDetail(item.id);
      return;
    }
    if (isPdmOwnerApprovalAction(item.actionCode)) {
      setError("此審核案目前無法對應原工作台資料，已停止開啟，請由 PDM Admin 修正送審目標。");
      return;
    }
    if (APPROVAL_DETAIL_DRAWER_ENABLED) void openControllerDetail(item.id);
  }, [openControllerDetail, unifiedEntityDetailEnabled]);
  const listKeyboard = useListKeyboardShortcuts({
    items,
    selectedKey: selectedId,
    listRef,
    rowSelector: "[data-approval-workbench-row='true']",
    getKey: approvalWorkbenchRowKey,
    getCopyText: (item) => item.targetSummary || item.title,
    onSelect: (item, options) => {
      if (options.openDetail) openApprovalRow(item);
      else setSelectedId(item.id);
    },
    onOpenDetail: openApprovalRow,
    onCloseDetail: closeDetail,
    isDetailOpen: Boolean((legacyDetailFallback && detail) || (unifiedDetailRequestId && unifiedDetailRequestId === selectedId))
  });

  return (
    <div className="approval-platform-page">
      <header className="topbar">
        <div>
          <h1>審核工作台 <StatusScopeHelp scope="approvalInbox" /></h1>
        </div>
        <button className="secondary-button" type="button" onClick={() => loadInbox()} disabled={busy === "reload"} title="重新整理">
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      {legacyRedirectMessage ? <div className="approval-message info">{legacyRedirectMessage}</div> : null}
      {error && state === "ready" && !detail ? <div className="approval-message error" role="alert">{error}</div> : null}

      <section className="approval-filter-bar pdm-workbench-filter-bar" aria-label="審核篩選">
        <label className="approval-filter-field approval-filter-search">
          <span>搜尋</span>
          <div className="approval-filter-search-control">
            <Search size={16} aria-hidden="true" />
            <input
              value={workbenchQuery.query}
              onChange={(event) => setWorkbenchQuery((current) => ({ ...current, query: event.target.value }))}
              placeholder="圖號、料號、品名、送審者"
              aria-label="搜尋圖號、料號、品名或送審者"
            />
          </div>
        </label>
        <label className="approval-filter-field">
          <span>狀態</span>
          <select value={statusFilter} onChange={(event) => setWorkbenchQuery((current) => ({ ...current, status: event.target.value as StatusFilter }))}>
            {statusFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="approval-filter-field">
          <span>領域</span>
          <select
            value={domainFilter}
            onChange={(event) => {
              setWorkbenchQuery((current) => ({ ...current, domain: event.target.value as DomainFilter, action: "all" }));
            }}
          >
            {domainFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="approval-filter-field">
          <span>審核類型</span>
          <select value={actionFilter} onChange={(event) => setWorkbenchQuery((current) => ({ ...current, action: event.target.value as ActionFilter }))}>
            {visibleActionFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        {statusFilter !== "active" || domainFilter !== "all" || actionFilter !== "all" || workbenchQuery.query ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setWorkbenchQuery((current) => ({ ...current, status: "active", domain: "all", action: "all", query: "" }));
            }}
          >
            清除篩選
          </button>
        ) : null}
      </section>

      {state === "unauthorized" ? <div className="panel approval-empty">請先登入。</div> : null}
      {state === "forbidden" ? <div className="panel approval-empty">目前帳號沒有審核中心讀取權限。</div> : null}
      {state === "error" ? <div className="panel approval-error">{error || controllerError}</div> : null}

      <div className="approval-platform-layout">
        <section className="panel approval-inbox-panel" aria-label="審核清單">
          <div className="panel-header">
            <h2>審核清單</h2>
            <span className="approval-count">{loading && items.length === 0 ? "讀取中" : `${items.length} 筆`}</span>
          </div>
          <PdmWorkbenchList
            rows={items}
            getRowKey={approvalWorkbenchRowKey}
            selectedKey={selectedId}
            ariaLabel="審核工作清單"
            className="approval-inbox-list"
            tableClassName="approval-workbench-table"
            rowDataAttribute="data-approval-workbench-row"
            rowAriaKeyShortcuts={listKeyboard.shortcuts}
            containerRef={listRef}
            onContainerKeyDown={listKeyboard.handleKeyDown}
            loading={loading}
            loadingState={<div className="approval-empty">正在載入審核清單...</div>}
            emptyState={state === "ready" ? <div className="approval-empty">目前沒有符合條件的待處理審核。</div> : null}
            onOpenRow={openApprovalRow}
            columns={[
              { key: "target", header: "審核項目", dataLabel: "審核項目", className: "approval-workbench-col-target", render: (item) => <span className="approval-inbox-primary"><strong>{item.targetSummary || item.title}</strong>{showInboxAction ? <small>{item.actionTitle}</small> : null}</span> },
              { key: "domain", header: "領域", dataLabel: "領域", className: "approval-workbench-col-domain", render: (item) => <span>{domainText[item.domainCode] ?? item.domainCode}</span> },
              { key: "requester", header: "送審者", dataLabel: "送審者", className: "approval-workbench-col-requester", render: (item) => <span>{item.requestedByName ?? item.requestedBy ?? "未知申請者"}</span> },
              { key: "status", header: "狀態", dataLabel: "狀態", className: "approval-workbench-col-status", render: (item) => <span className="approval-status-cell"><span className={`approval-status-chip ${statusClass(item.status)}`}>{getStatusDisplay(item.status, "approvalStatus").label}</span>{item.historyOnly ? <small className="approval-history-label" title={item.supersededByRequestId ? "此案件已由較新的審核案件取代" : "歷史案件"}>{item.supersededByRequestId ? "已取代" : "歷史"}</small> : null}</span> },
              { key: "requestedAt", header: "送審時間", dataLabel: "送審時間", className: "approval-workbench-col-time", render: (item) => <time dateTime={item.requestedAt}>{formatCompactDate(item.requestedAt)}</time> }
            ]}
          />
          <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={goPrevious} onNext={goNext} />
        </section>
        {legacyDetailFallback && detail ? <ApprovalDetailDrawer detail={detail} busy={busy} comment={comment} message={message} error={error} drawerWidth={drawerWidth} onStartResize={startDrawerResize} onClose={closeDetail} onCommentChange={setComment} onDecide={decide} onRetryCleanup={retryCleanup} onRetryApply={retryApply} /> : null}
        {!legacyDetailFallback && unifiedEntityDetailEnabled && unifiedDetailRequestId === selectedItem?.id && selectedItem && selectedOwnerContext ? (
          <UnifiedPdmEntityDetailDrawer
            open
            entityKey={selectedOwnerContext.entityKey}
            surface={selectedOwnerContext.surface}
            reviewRequestId={selectedItem.id}
            width={drawerWidth}
            returnTo={approvalDrawerReturnTo()}
            onStartResize={startDrawerResize}
            onClose={closeDetail}
          />
        ) : null}
      </div>
    </div>
  );
}

type ApprovalDetailDrawerProps = {
  detail: ApprovalDetail;
  busy: ApprovalPlatformPageBusy;
  comment: string;
  message: string;
  error: string;
  drawerWidth: number;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
  onCommentChange: (value: string) => void;
  onDecide: (decision: ApprovalDecision) => Promise<void>;
  onRetryCleanup: () => Promise<void>;
  onRetryApply: () => Promise<void>;
};

type ApprovalPlatformPageBusy = ApprovalDecision | "retry-apply" | "retry-cleanup" | "reload" | "detail" | null;

function ApprovalDetailDrawer({
  detail,
  busy,
  comment,
  message,
  error,
  drawerWidth,
  onStartResize,
  onClose,
  onCommentChange,
  onDecide,
  onRetryCleanup,
  onRetryApply
}: ApprovalDetailDrawerProps) {
  const resultCandidates = buildApprovalResultCandidates(detail);
  const pdmOwnerApproval = isPdmOwnerApprovalAction(detail.actionCode);
  const drawingApproval = isDrawingRevisionReviewAction(detail.actionCode) || Boolean(detail.primaryTarget?.type.includes("drawing")) || detail.targets.some((target) => target.type.includes("drawing"));
  const reviewerHref = `/approvals/${encodeURIComponent(detail.id)}?returnTo=${encodeURIComponent("/approvals")}`;
  return (
    <DrawingWorkspaceDrawer
      open
      width={drawerWidth}
      ariaLabel="審核明細"
      eyebrow="審核案件"
      title={detail.targetSummary || detail.title}
      subtitle={`${detail.actionTitle} · ${detail.requestedByName ?? detail.requestedBy ?? "未知申請者"} · ${formatDate(detail.requestedAt)}`}
      status={<span className={`approval-status-chip ${statusClass(detail.status)}`}>{getStatusDisplay(detail.status, "approvalStatus").label}</span>}
      primaryAction={pdmOwnerApproval ? <a className="primary-button" href={reviewerHref}><ShieldCheck size={15} />前往審核工作區</a> : null}
      entityType="approval_request"
      entityCode={detail.id}
      sourceContext="approval_workbench"
      detailFamily="approval_request"
      className="approval-detail-drawer"
      bodyClassName="pdm-entity-drawer-body approval-detail-drawer-body"
      resizeLabel="調整審核明細寬度"
      resizeTitle="拖曳調整審核明細寬度"
      closeLabel="關閉審核明細"
      keepOpenSelector=".approval-inbox-item"
      overviewLabel="審核摘要"
      moreLabel="更多審核資料"
      content={{
        overview: <ApprovalImpactSummary detail={detail} />,
        body: <ApprovalResultBody detail={detail} candidates={resultCandidates} />,
        pending: <ApprovalPendingSummary detail={detail} />,
        more: <ApprovalMoreDetails detail={detail} />,
        bodyTitle: "圖面與附件",
        bodyMeta: "送審時固定的檔案證據",
        bodyLabel: "圖面與附件",
        pendingTitle: "目前狀態",
        pendingLabel: "目前狀態",
        moreTitle: "更多"
      }}
      footer={pdmOwnerApproval ? <div className="approval-drawer-footer-content"><span>審核決策改在獨立審核工作區完成，抽屜不執行決策。</span><a className="primary-button" href={reviewerHref}><ShieldCheck size={15} />開啟審核工作區</a></div> : <ApprovalDecisionFooter
        detail={detail}
        busy={busy}
        comment={comment}
        message={message}
        error={error}
        onCommentChange={onCommentChange}
        onDecide={onDecide}
        onRetryCleanup={onRetryCleanup}
        onRetryApply={onRetryApply}
      />}
      onClose={onClose}
      onStartResize={onStartResize}
    />
  );
}

function ApprovalImpactSummary({ detail }: { detail: ApprovalDetail }) {
  const snapshot = asRecord(detail.impactSnapshots[0]?.snapshot);
  const resultCandidates = buildApprovalResultCandidates(detail);
  const isCandidateBundle = detail.actionCode === "numbering.candidate_bundle_review";
  const lifecycleDrawing = asRecord(snapshot.drawing);
  const lifecycleParts = asRecordArray(snapshot.parts);
  const lifecycleFiles = asRecordArray(snapshot.files);
  const lifecycleFff = asRecord(snapshot.fff);
  const candidateReservations = asRecordArray(snapshot.lockedReservations);
  const candidateCodes = candidateReservations.map((item) => stringValue(item.candidateCode)).filter(Boolean);
  const candidateNumberFacts = asRecord(snapshot.numberFacts);
  const candidateRelations = asRecordArray(candidateNumberFacts.relations);
  const candidateFiles = resultCandidates.flatMap((candidate) => candidate.files);
  const facts = isDrawingRevisionReviewAction(detail.actionCode)
    ? [
        { label: "範圍", value: stringValue(lifecycleDrawing.number) || detail.targetSummary },
        { label: "版次", value: stringValue(lifecycleDrawing.revision) || "-" },
        { label: "料號", value: `${lifecycleParts.length} 個` },
        { label: "檔案", value: `${lifecycleFiles.length} 個` },
        { label: "FFF 結論", value: approvalImpactStateLabel(stringValue(lifecycleFff.outcome) || detail.impactSummary) },
        { label: "Form", value: approvalImpactStateLabel(stringValue(lifecycleFff.formState)) },
        { label: "Fit", value: approvalImpactStateLabel(stringValue(lifecycleFff.fitState)) },
        { label: "Function", value: approvalImpactStateLabel(stringValue(lifecycleFff.functionState)) }
      ]
    : isCandidateBundle
      ? [
          { label: "範圍", value: candidateCodes.join("、") || detail.targetSummary },
          { label: "首版準備", value: `${resultCandidates.length} 版` },
          { label: "主要檔案", value: `${candidateFiles.filter((file) => file.isPrimary).length}/${candidateFiles.length}` },
          { label: "圖料關係", value: `${candidateRelations.length} 筆` },
          { label: "核准後", value: "系統自動正式化" },
          { label: "使用效力", value: "研發版核准；尚未正式發行" }
        ]
      : [
          { label: "範圍", value: detail.targets.map((target) => approvalTargetLabel(detail, target)).join("、") || detail.targetSummary },
          { label: "影響", value: approvalImpactLabel(detail.impactSummary) }
        ];
  const requestReason = detail.reason.trim();
  if (requestReason) {
    facts.push({ label: "申請理由", value: approvalReasonLabel(requestReason) });
  }

  return (
    <div
      className="approval-impact-summary"
      data-approval-bundle-summary={isCandidateBundle ? "true" : undefined}
      data-drawing-lifecycle-review-summary={isDrawingRevisionReviewAction(detail.actionCode) ? "true" : undefined}
    >
      <NumberingSubmissionResult
        mode="reviewer"
        showCandidates={false}
        heading="審核摘要"
        subtitle="送審時固定的內容"
        facts={facts}
      />
    </div>
  );
}

function ApprovalResultBody({ detail, candidates }: { detail: ApprovalDetail; candidates: NumberingSubmissionResultCandidate[] }) {
  return (
    <div className="approval-result-section">
      {candidates.length > 0 ? (
        <NumberingSubmissionResult
          mode="reviewer"
          requestId={approvalEvidenceRequestId(detail)}
          heading="圖面與附件"
          showHeader={false}
          candidates={candidates}
        />
      ) : (
        <div className="approval-result-empty">本案沒有可供查閱的圖面附件。</div>
      )}
      <ApprovalDrawingPreview detail={detail} candidates={candidates} />
    </div>
  );
}

function ApprovalDrawingPreview({ detail, candidates }: { detail: ApprovalDetail; candidates: NumberingSubmissionResultCandidate[] }) {
  const requestId = approvalEvidenceRequestId(detail);
  const files = candidates.flatMap((candidate) => candidate.files);
  const threeD = files.find((file) => file.role === "cad_3d");
  const twoD = files.find((file) => ["drawing_2d", "pdf", "dwg_dxf"].includes(file.role));
  const fileActions = (file: typeof threeD) => file && requestId && file.sourceFileAssetId ? (
    <>
      <a className="numbering-submission-result-link" href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?preview=1`} target="_blank" rel="noreferrer">預覽</a>
      <a className="numbering-submission-result-link" href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?download=1`} target="_blank" rel="noreferrer">下載</a>
    </>
  ) : null;
  const fileMedia = (file: typeof threeD) => file && requestId && file.sourceFileAssetId ? {
    href: `/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?preview=1`,
    mode: file.role === "cad_3d" ? "image" as const : "document" as const,
    title: `${file.displayName || "附件"} 預覽`
  } : undefined;
  return (
    <DrawingDetailPreview
      cards={[
        {
          kind: "three-d",
          title: "3D 模型",
          fileName: threeD?.displayName,
          state: threeD && fileMedia(threeD) ? "ready" : threeD ? "unavailable" : "missing",
          stateTitle: threeD ? "審核時可查閱檔案" : "尚無 3D 檔案",
          stateText: threeD ? "預覽與送審時固定的檔案證據相同。" : "送審內容沒有 3D 檔案。",
          media: fileMedia(threeD),
          actions: fileActions(threeD)
        },
        {
          kind: "two-d",
          title: "2D 圖面",
          fileName: twoD?.displayName,
          state: twoD && fileMedia(twoD) ? "ready" : twoD ? "unavailable" : "missing",
          stateTitle: twoD ? "審核時可查閱檔案" : "尚無 2D 檔案",
          stateText: twoD ? "預覽與送審時固定的檔案證據相同。" : "送審內容沒有 2D 檔案。",
          media: fileMedia(twoD),
          actions: fileActions(twoD)
        }
      ]}
    />
  );
}

function ApprovalPendingSummary({ detail }: { detail: ApprovalDetail }) {
  if (detail.historyOnly) {
    const currentHref = detail.supersededByRequestId
      ? `/approvals?status=all&requestId=${encodeURIComponent(detail.supersededByRequestId)}`
      : null;
    return (
      <section className="approval-drawer-pending approval-drawer-history" aria-label="歷史案件提示">
        <strong>這筆不是目前待辦</strong>
        <span>此審核已由較新的案件接續，保留本筆只供追溯；目前不提供核准或駁回操作。</span>
        {currentHref ? <a className="secondary-button" href={currentHref}>查看目前案件</a> : null}
      </section>
    );
  }
  if (detail.status === "needs_info") {
    return (
      <section className="approval-drawer-pending approval-drawer-needs-info" aria-label="目前待處理事項">
        <strong>等待送審者補齊資料</strong>
        <span>資料補齊並重新送審後，主管才需要再次決策。</span>
      </section>
    );
  }
  if (detail.status !== "pending") return null;
  return (
    <section className="approval-drawer-pending" aria-label="目前待處理事項">
      <strong>請確認圖面與附件後決策</strong>
      <span>決策按鈕固定在抽屜底部。</span>
    </section>
  );
}

function ApprovalMoreDetails({ detail }: { detail: ApprovalDetail }) {
  return (
    <div className="approval-more-details">
      {detail.decisions.length > 0 ? (
        <details className="approval-prior-decisions">
          <summary><span>先前決策</span><small>{detail.decisions.length} 筆</small></summary>
          <div className="approval-decision-history">
            {detail.decisions.map((decision) => (
              <div className="approval-target-row" key={decision.id}>
                <span>{approvalDecisionLabel(decision.decision)}</span>
                <strong>{decision.approverName ?? decision.approverId}</strong>
                <small>{decision.comment || formatDate(decision.decidedAt)}</small>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {!isDrawingRevisionReviewAction(detail.actionCode) ? <details className="approval-trace-details">
        <summary>
          <span>追溯資料</span>
          <small>批次、流程與系統鎖定內容</small>
        </summary>
        <div className="approval-trace-body">
          <dl className="approval-trace-facts">
            <div><dt>領域</dt><dd>{domainText[detail.domainCode] ?? detail.domainCode}</dd></div>
            <div><dt>批次</dt><dd>{detail.packageCode ?? "無"}</dd></div>
            <div><dt>流程來源</dt><dd>{approvalSourceLabel(detail)}</dd></div>
          </dl>
          <details className="approval-audit-details" data-approval-audit-details>
            <summary>查看稽核明細</summary>
            <p>供追溯送審當下的鎖定內容。</p>
            <pre className="approval-json">{JSON.stringify(detail.impactSnapshots[0]?.snapshot ?? {}, null, 2)}</pre>
          </details>
        </div>
      </details> : null}
    </div>
  );
}

function ApprovalDecisionFooter({
  detail,
  busy,
  comment,
  message,
  error,
  onCommentChange,
  onDecide,
  onRetryCleanup,
  onRetryApply
}: Omit<ApprovalDetailDrawerProps, "drawerWidth" | "onStartResize" | "onClose">) {
  return (
    <div className="approval-drawer-footer-content">
      {message ? <div className="approval-message success">{message}</div> : null}
      {error ? <div className="approval-message error" role="alert">{error}</div> : null}
      {detail.status === "pending" ? (
        <section className="approval-decision-box" aria-label="審核決策">
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder={isDrawingRevisionReviewAction(detail.actionCode) ? "退回說明（選填）" : "決策備註"} rows={2} />
          <div className="approval-decision-actions">
            {allowedDecisionsForDetail(detail).includes("needs_info") ? (
              <button className="secondary-button" type="button" onClick={() => void onDecide("needs_info")} disabled={Boolean(busy)}>
                <ShieldAlert size={16} aria-hidden="true" />
                補資料
              </button>
            ) : null}
            {allowedDecisionsForDetail(detail).includes("rejected") ? (
              <button className="danger-button" type="button" onClick={() => void onDecide("rejected")} disabled={Boolean(busy)}>
                <XCircle size={16} aria-hidden="true" />
                {isDrawingRevisionReviewAction(detail.actionCode) ? "退回修改" : "駁回"}
              </button>
            ) : null}
            {allowedDecisionsForDetail(detail).includes("approved") ? (
              <button className="primary-button" type="button" onClick={() => void onDecide("approved")} disabled={Boolean(busy)}>
                <CheckCircle2 size={16} aria-hidden="true" />
                核准
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {isDrawingRevisionReviewAction(detail.actionCode) && detail.cleanupPending ? (
        <section className="approval-decision-box" aria-label="流程整理重試">
          <p className="approval-reason">審核決策已完成，僅剩流程整理；重試不會重新審核或建立第二筆送審。</p>
          <div className="approval-decision-actions">
            <button className="primary-button" type="button" onClick={() => void onRetryCleanup()} disabled={Boolean(busy)}>
              <RefreshCw size={16} aria-hidden="true" />
              {busy === "retry-cleanup" ? "整理中..." : "重試流程整理"}
            </button>
          </div>
        </section>
      ) : null}
      {detail.status === "apply_failed" && (detail.actionCode === "numbering.candidate_publication_review" || detail.actionCode === "numbering.candidate_bundle_review") ? (
        <section className="approval-decision-box" aria-label="審核套用重試">
          <p className="approval-reason">核准決策已保存，但資料尚未完成發布；可安全重試原核准內容，不會重新送審或換號。</p>
          <div className="approval-decision-actions">
            <button className="primary-button" type="button" onClick={() => void onRetryApply()} disabled={Boolean(busy)}>
              <RefreshCw size={16} aria-hidden="true" />
              {busy === "retry-apply" ? "重試中..." : detail.actionCode === "numbering.candidate_bundle_review" ? "重試正式化" : "重試套用"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function buildApprovalResultCandidates(detail: ApprovalDetail): NumberingSubmissionResultCandidate[] {
  const snapshot = asRecord(detail.impactSnapshots[0]?.snapshot);
  if (detail.actionCode === "numbering.candidate_bundle_review") {
    const reservations = asRecordArray(snapshot.lockedReservations);
    const candidates = asRecordArray(snapshot.candidateRevisions);
    const reservationCodes = new Map(
      reservations
        .map((item) => [stringValue(item.id), stringValue(item.candidateCode)] as const)
        .filter(([id, code]) => Boolean(id && code))
    );
    return candidates.map((candidate, index) => {
      const candidateFiles = asRecordArray(candidate.files);
      const candidateCode = reservationCodes.get(stringValue(candidate.candidateReservationId));
      return {
        id: stringValue(candidate.id) || `candidate-${index}`,
        drawingCode: candidateCode || stringValue(candidate.drawingDraftId) || null,
        revision: stringValue(candidate.revision) || "0.1",
        files: candidateFiles.map((file, fileIndex) => ({
          id: stringValue(file.id) || `${stringValue(candidate.id)}-file-${fileIndex}`,
          sourceFileAssetId: stringValue(file.sourceFileAssetId) || null,
          role: stringValue(file.role),
          displayName: evidenceFileName(file) || `附件 ${fileIndex + 1}`,
          description: stringValue(file.description),
          isPrimary: file.isPrimary === true,
          publicationEvidenceId: stringValue(file.publicationEvidenceId) || null
        }))
      };
    });
  }
  if (!isDrawingRevisionReviewAction(detail.actionCode)) return [];
  const drawing = asRecord(snapshot.drawing);
  const files = asRecordArray(snapshot.files);
  if (files.length === 0) return [];
  return [{
    id: detail.id,
    drawingCode: stringValue(drawing.number) || detail.targetSummary,
    revision: stringValue(drawing.revision) || "0.1",
    files: files.map((file, index) => ({
      id: stringValue(file.id) || `${detail.id}-file-${index}`,
      sourceFileAssetId: stringValue(file.sourceFileAssetId) || stringValue(file.assetId) || null,
      role: stringValue(file.role) || "other",
      displayName: evidenceFileName(file) || `附件 ${index + 1}`,
      description: stringValue(file.description),
      isPrimary: file.isPrimary === true || file.primary === true,
      publicationEvidenceId: stringValue(file.publicationEvidenceId) || null
    }))
  }];
}

function approvalSourceLabel(detail: ApprovalDetail) {
  if (detail.legacy) return "既有審核紀錄";
  if (isDrawingRevisionReviewAction(detail.actionCode)) return "圖面進版";
  return detail.actionCode === "numbering.candidate_bundle_review" ? "圖料整包送審" : "系統審核流程";
}

function approvalTargetRoleLabel(role: ApprovalDetail["targets"][number]["role"]) {
  return ({ primary: "主要案件", child: "審核內容", impact: "影響項目" } as const)[role];
}

function approvalTargetLabel(detail: ApprovalDetail, target: ApprovalDetail["targets"][number]) {
  if (target.code) return target.code;
  if (detail.actionCode === "numbering.candidate_bundle_review" && target.role === "child") {
    const revision = target.label.split("/")[0]?.trim();
    return revision ? `首版 ${revision}` : "首版準備";
  }
  return target.label;
}

function approvalTargetStatusLabel(status: string | null, type: string) {
  const statusLabels: Record<string, string> = {
    active: "準備中",
    review_locked: "送審後已鎖定",
    approved_locked: "號碼已核准，待補圖面",
    promoted: "已正式建立",
    pending: "等待審核",
    approved: "已核准",
    rejected: "已駁回",
    cancelled: "已取消"
  };
  if (status && statusLabels[status]) return statusLabels[status];
  const typeLabels: Record<string, string> = {
    numbering_draft_workspace: "編號申請案件",
    numbering_candidate_revision: "首版準備",
    drawing_number: "圖號",
    drawing_revision_package: "圖面版次",
    part_number: "料號",
    part_root: "圖料根號"
  };
  return typeLabels[type] ?? "審核項目";
}

function approvalReasonLabel(reason: string) {
  const reasonLabels: Record<string, string> = {
    draft_owner_confirmed_candidate_bundle_review: "申請者已確認圖料號、關係、版次與檔案證據完整，送交整包審核。",
    draft_owner_withdrew_candidate_bundle_review: "申請者已撤回整包審核，內容可繼續修正。",
    draft_owner_confirmed_candidate_publication_review: "申請者已確認編號內容，送交發布審核。"
  };
  if (reasonLabels[reason]) return reasonLabels[reason];
  return /^[a-z0-9_.-]+$/u.test(reason)
    ? "已依流程提出審核，請確認目標與影響後決策。"
    : reason;
}

function approvalImpactLabel(impactSummary: string | null) {
  const normalized = impactSummary?.trim() ?? "";
  const impactLabels: Record<string, string> = {
    no_impact: "未發現需處理的影響。",
    suspected_impact: "可能有影響，請確認是否需要補充處置。",
    confirmed_impact: "已確認有影響，請確認配套處置後再決策。",
    "Released -> Obsolete": "核准後將把正式資料改為作廢。"
  };
  if (impactLabels[normalized]) return impactLabels[normalized];
  if (!normalized) return "未提供額外影響說明。";
  return /^[a-z0-9_.-]+$/u.test(normalized)
    ? "影響內容已隨案件鎖定，請依審核範圍判斷。"
    : normalized;
}

function approvalImpactStateLabel(value: string | null) {
  const labels: Record<string, string> = {
    no_impact: "無影響",
    suspected_impact: "疑似影響",
    confirmed_impact: "確認影響"
  };
  return labels[value?.trim() ?? ""] ?? "未提供";
}

function approvalDecisionLabel(decision: ApprovalDecision) {
  return ({ approved: "核准", rejected: "駁回", needs_info: "要求補資料" } as const)[decision];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceFileName(file: Record<string, unknown>) {
  const displayName = stringValue(file.displayName);
  if (displayName) return displayName;
  const objectKey = stringValue(file.objectKey);
  return objectKey.split(/[\\/]/u).pop() ?? objectKey;
}

function allowedDecisionsForDetail(detail: ApprovalDetail): ApprovalDecision[] {
  const fromPayload = detail.payload.allowedDecisions;
  if (Array.isArray(fromPayload)) {
    const allowed = fromPayload.filter(
      (decision): decision is ApprovalDecision => decision === "approved" || decision === "rejected" || decision === "needs_info"
    );
    if (allowed.length > 0) return allowed;
  }
  if (detail.source !== "platform" && detail.source !== "legacy_numbering") return ["approved", "rejected"];
  return ["approved", "needs_info", "rejected"];
}

function approvalWorkbenchRowKey(item: ApprovalInboxItem) {
  return item.rowKey || `approval:${item.source}:${item.id}`;
}

function readApprovalWorkbenchLocation(): PdmWorkbenchLocationState<ApprovalWorkbenchQuery> {
  const status = readInitialFilter("status", statusFilters, "active");
  const domain = readInitialFilter("domain", domainFilters, "all");
  const action = readInitialFilter("action", actionFilters, "all");
  const query = normalizeApprovalQueryParam(readInitialTextParam("query"));
  const cursor = readInitialTextParam("cursor");
  const page = Number(readInitialTextParam("page"));
  return {
    query: { status, domain, action, query, limit: 100 },
    detailKey: readInitialTextParam("requestId"),
    legacyDetail: null,
    cursor,
    pageIndex: Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
  };
}

function writeApprovalWorkbenchLocation(
  state: PdmWorkbenchLocationState<ApprovalWorkbenchQuery>,
  mode: "replace" | "push"
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("status", state.query.status);
  if (state.query.query) params.set("query", state.query.query);
  else params.delete("query");
  if (state.query.domain === "all") params.delete("domain");
  else params.set("domain", state.query.domain);
  if (state.query.action === "all") params.delete("action");
  else params.set("action", state.query.action);
  if (state.detailKey) params.set("requestId", state.detailKey);
  else {
    params.delete("requestId");
    params.delete("drawing");
  }
  if (state.cursor) {
    params.set("cursor", state.cursor);
    if ((state.pageIndex ?? 0) > 0) params.set("page", String(state.pageIndex));
    else params.delete("page");
  } else {
    params.delete("cursor");
    params.delete("page");
  }
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (mode === "push") window.history.pushState(null, "", nextUrl);
  else window.history.replaceState(null, "", nextUrl);
}

function buildApprovalWorkbenchListUrl(query: ApprovalWorkbenchQuery, cursor: string | null) {
  const params = new URLSearchParams({ status: query.status, limit: String(query.limit) });
  if (query.query) params.set("query", normalizeApprovalQueryParam(query.query));
  if (query.domain !== "all") params.set("domain", query.domain);
  if (query.action !== "all") params.set("action", query.action);
  if (cursor) params.set("cursor", cursor);
  return `/api/approvals/inbox?${params.toString()}`;
}

function normalizeApprovalWorkbenchResponse(value: unknown): ApprovalWorkbenchListResponse {
  const body = value as InboxResponse;
  return {
    rows: body.rows ?? body.items ?? [],
    nextCursor: body.nextCursor ?? null,
    previousCursor: body.previousCursor ?? null,
    pageIndex: body.pageIndex ?? 0,
    generatedAt: new Date().toISOString(),
    filters: {
      status: (body.filters?.status as ApprovalWorkbenchListResponse["filters"]["status"] | undefined) ?? "active",
      domain: body.filters?.domain ?? "all",
      action: body.filters?.action ?? "all",
      query: body.filters?.query ?? ""
    },
    summary: body.summary ?? { total: 0, pending: 0, needsInfo: 0, applyFailed: 0 }
  };
}

function buildInboxUrl(status: StatusFilter, domain: DomainFilter, action: ActionFilter) {
  const params = new URLSearchParams({ status, limit: "100" });
  if (domain !== "all") params.set("domain", domain);
  if (action !== "all") params.set("action", action);
  return `/api/approvals/inbox?${params.toString()}`;
}

function readInitialFilter<T extends string>(name: string, options: readonly { value: T }[], fallback: T) {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

function readInitialTextParam(name: string) {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value || null;
}

function readLegacyRedirectMessage() {
  const legacyRedirect = readInitialTextParam("legacyRedirect");
  return legacyRedirect ? legacyRedirectMessages[legacyRedirect] ?? null : null;
}

function syncFilterQuery(status: StatusFilter, domain: DomainFilter, action: ActionFilter) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("status", status);
  if (domain === "all") {
    params.delete("domain");
  } else {
    params.set("domain", domain);
  }
  if (action === "all") {
    params.delete("action");
  } else {
    params.set("action", action);
  }
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function normalizeApprovalQueryParam(value: string | null) {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 160);
}

function clearApprovalDetailQuery() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.delete("requestId");
  params.delete("drawing");
  const nextQuery = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
}

function approvalDrawerReturnTo() {
  if (typeof window === "undefined") return "/approvals";
  const params = new URLSearchParams(window.location.search);
  params.delete("requestId");
  params.delete("drawing");
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

function statusClass(status: ApprovalStatus) {
  if (status === "pending" || status === "needs_info") return "warning";
  if (status === "approved" || status === "applied") return "success";
  if (status === "rejected" || status === "cancelled" || status === "apply_failed") return "danger";
  return "info";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCompactDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
