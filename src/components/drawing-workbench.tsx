"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, DollarSign, Link2, RefreshCcw, Search, X } from "lucide-react";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import {
  DrawingDetailContent as SharedDrawingDetailContent,
  DrawingDetailSummary
} from "@/components/drawing-detail-content";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { HumanStatusFilterSelect } from "@/components/human-status-filter";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import { SearchHighlight } from "@/components/search-highlight";
import type { CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import {
  NumberStateOwnerCreateAction,
  type NumberingDraftWorkspace,
  type WorkspaceAction
} from "@/components/number-state-workspace";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import {
  DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
  DRAWING_DETAIL_DRAWER_MIN_WIDTH,
  DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
  DrawingWorkspaceDrawer
} from "@/components/drawing-workspace-drawer";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose } from "@/lib/numbering-identity";
import { formatStatusForUser } from "@/lib/status-display";
import type {
  DrawingWorkbenchDetailResponse,
  DrawingWorkbenchListResponse,
  DrawingWorkbenchPrimaryAction,
  DrawingWorkbenchRow,
  DrawingWorkbenchStage,
  DrawingWorkbenchView
} from "@/lib/drawing-workbench";
import type { HumanStatusFilter } from "@/lib/human-status-projection";

export type DrawingDetail = NonNullable<DrawingWorkbenchDetailResponse["drawing"]>;
export type DrawingWorkbenchCapabilities = DrawingWorkbenchDetailResponse["capabilities"];
type DrawingPurposeFilter = NonNullable<DrawingWorkbenchRow["purposeCode"]>;
type DrawingRecordStatusFilter = NonNullable<DrawingWorkbenchRow["recordStatus"]>;
type DrawingWorkbenchQueryState = {
  view: DrawingWorkbenchView;
  query: string;
  stage: "" | DrawingWorkbenchStage;
  seriesCode: string;
  purposeCode: "" | DrawingPurposeFilter;
  recordStatus: "" | DrawingRecordStatusFilter;
  humanStatus: HumanStatusFilter;
  includeHistory: boolean;
};
export type ProductionSliceClientStatus = {
  configured: boolean;
  openPagePaths: string[];
  unopenedMessage: string;
};

const defaultProductionSliceUnopenedMessage = "此功能未納入本次正式領號 / 保留號 production slice。";
const candidateDrawerRetiredMessage = "候選圖號明細抽屜已暫停開發；目前僅保留正式圖號明細。";

type ApiMessageBody = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

function readBody<T>(response: Response) {
  return response.json().catch(() => ({})) as Promise<T & ApiMessageBody>;
}

function apiMessage(body: ApiMessageBody, fallback: string) {
  const errorCode = typeof body.error === "object" ? body.error?.code : body.error;
  const errorMessage = typeof body.error === "object" ? body.error?.message : body.error;
  if (errorCode === "candidate_review_service_unavailable") return "送審服務目前不可用。表單已保留，請稍後重試。";
  return body.message?.trim() || errorMessage?.trim() || fallback;
}

function createIdempotencyKey(action: string) {
  return `dev053:${action}:${crypto.randomUUID()}`;
}

const initialDrawingWorkbenchQuery: DrawingWorkbenchQueryState = {
  view: "all",
  query: "",
  stage: "",
  seriesCode: "",
  purposeCode: "",
  recordStatus: "",
  humanStatus: "all",
  includeHistory: false
};

function readDrawingWorkbenchLocation(canonicalize = false): PdmWorkbenchLocationState<DrawingWorkbenchQueryState> {
  const params = new URLSearchParams(window.location.search);
  const legacyReserved = params.get("tab") === "reserved";
  const rawView = params.get("view");
  const view: DrawingWorkbenchView = legacyReserved || rawView === "work" ? "work" : rawView === "mine" ? "mine" : "all";
  const includeHistory = params.get("history") === "include";
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detail = rawDetail.includes(":") ? rawDetail : rawDetail.startsWith("draft-workspace-") ? `candidate:${rawDetail}` : "";
  const legacyDrawingCode = rawDetail && !detail ? rawDetail : "";
  if (canonicalize) {
    params.delete("tab");
    params.set("view", view);
    if (detail) params.set("detail", detail);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);
  }
  return {
    query: {
      view,
      query: params.get("query")?.trim() || legacyDrawingCode,
      stage: (params.get("stage")?.trim() || "") as "" | DrawingWorkbenchStage,
      seriesCode: params.get("seriesCode")?.trim() || "",
      purposeCode: (params.get("purposeCode")?.trim() || "") as "" | DrawingPurposeFilter,
      recordStatus: (params.get("recordStatus")?.trim() || "") as "" | DrawingRecordStatusFilter,
      humanStatus: (params.get("humanStatus")?.trim() || "all") as HumanStatusFilter,
      includeHistory
    },
    detailKey: detail || null,
    legacyDetail: legacyDrawingCode || null
  };
}

function writeDrawingWorkbenchLocation(
  state: PdmWorkbenchLocationState<DrawingWorkbenchQueryState>,
  mode: "replace" | "push"
) {
  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.set("view", state.query.view);
  state.query.includeHistory ? params.set("history", "include") : params.delete("history");
  state.query.query.trim() ? params.set("query", state.query.query.trim()) : params.delete("query");
  state.query.stage ? params.set("stage", state.query.stage) : params.delete("stage");
  state.query.seriesCode ? params.set("seriesCode", state.query.seriesCode) : params.delete("seriesCode");
  state.query.purposeCode ? params.set("purposeCode", state.query.purposeCode) : params.delete("purposeCode");
  state.query.recordStatus ? params.set("recordStatus", state.query.recordStatus) : params.delete("recordStatus");
  state.query.humanStatus !== "all" ? params.set("humanStatus", state.query.humanStatus) : params.delete("humanStatus");
  state.detailKey ? params.set("detail", state.detailKey) : params.delete("detail");
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${window.location.pathname}?${params.toString()}`);
}

function drawingWorkbenchListUrl(query: DrawingWorkbenchQueryState, cursor: string | null) {
  const params = new URLSearchParams({
    view: query.view,
    limit: "50",
    history: query.includeHistory ? "include" : "exclude"
  });
  if (query.query.trim()) params.set("query", query.query.trim());
  if (query.stage) params.set("stage", query.stage);
  if (query.seriesCode) params.set("seriesCode", query.seriesCode);
  if (query.purposeCode) params.set("purposeCode", query.purposeCode);
  if (query.recordStatus) params.set("recordStatus", query.recordStatus);
  if (query.humanStatus !== "all") params.set("humanStatus", query.humanStatus);
  if (cursor) params.set("cursor", cursor);
  return `/api/numbering/drawings/workbench?${params.toString()}`;
}

function drawingWorkbenchDetailUrl(rowKey: string) {
  return `/api/numbering/drawings/workbench/${encodeURIComponent(rowKey)}`;
}

function normalizeDrawingWorkbenchResponse(value: unknown) {
  return value as DrawingWorkbenchListResponse;
}

function normalizeDrawingWorkbenchDetail(value: unknown) {
  return value as DrawingWorkbenchDetailResponse;
}

function initialDrawingWorkbenchLocation() {
  return readDrawingWorkbenchLocation(true);
}

function currentDrawingWorkbenchLocation() {
  return readDrawingWorkbenchLocation(false);
}

function drawingWorkbenchRowKey(row: DrawingWorkbenchRow) {
  return row.rowKey;
}

function drawingWorkbenchDetailRowKey(detail: DrawingWorkbenchDetailResponse) {
  return detail.row.rowKey;
}

function drawingWorkbenchCopyText(row: DrawingWorkbenchRow) {
  return row.displayCode;
}

function redirectDrawingWorkbenchLogin() {
  window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

export function DrawingWorkbench() {
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoOpenedQueryRef = useRef("");
  const idempotencyKeys = useRef(new Map<string, string>());
  const controller = usePdmWorkbenchController<
    DrawingWorkbenchRow,
    DrawingWorkbenchDetailResponse,
    DrawingWorkbenchQueryState,
    DrawingWorkbenchListResponse["filters"]
  >({
    initialQuery: initialDrawingWorkbenchQuery,
    initialLocation: initialDrawingWorkbenchLocation,
    readLocation: currentDrawingWorkbenchLocation,
    writeLocation: writeDrawingWorkbenchLocation,
    buildListUrl: drawingWorkbenchListUrl,
    buildDetailUrl: drawingWorkbenchDetailUrl,
    getRowKey: drawingWorkbenchRowKey,
    normalizeResponse: normalizeDrawingWorkbenchResponse,
    normalizeDetail: normalizeDrawingWorkbenchDetail,
    detailRowKey: drawingWorkbenchDetailRowKey,
    detailHistoryMode: "replace",
    listErrorMessage: "圖號工作台目前無法載入，請重新整理。",
    detailErrorMessage: "這筆圖號工作已不存在或目前無法查看。",
    onUnauthorized: redirectDrawingWorkbenchLogin
  });
  const {
    initialized,
    rows,
    filters,
    loading,
    detailLoading,
    error,
    setError,
    notice,
    setNotice,
    query: workbenchQuery,
    setQuery: setWorkbenchQuery,
    selectedKey,
    setSelectedKey,
    detail,
    setDetail,
    nextCursor,
    pageIndex,
    loadRows,
    goNext,
    goPrevious,
    openDetail: openControllerDetail,
    closeDetail: closeControllerDetail
  } = controller;
  const { view, query, seriesCode, purposeCode, recordStatus, humanStatus, includeHistory } = workbenchQuery;
  const seriesCodeOptions = filters?.seriesCodeOptions ?? [];
  const purposeCodeOptions = filters?.purposeCodeOptions ?? [];
  const recordStatusOptions = filters?.recordStatusOptions ?? [];
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({
    storageKey: DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
    defaultWidth: DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
    minWidth: DRAWING_DETAIL_DRAWER_MIN_WIDTH
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/production-slice/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ProductionSliceClientStatus> : null)
      .then((status) => {
        if (!cancelled && status) setProductionSlice(status);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const closeDetail = useCallback(() => {
    setEditing(false);
    setConfirmAction(null);
    closeControllerDetail("replace");
  }, [closeControllerDetail]);

  const openDetail = useCallback(async (rowKey: string) => {
    const listedRow = rows.find((row) => row.rowKey === rowKey);
    if (listedRow?.rowKind === "candidate_bundle") {
      setEditing(false);
      setConfirmAction(null);
      setNotice(candidateDrawerRetiredMessage);
      closeControllerDetail("replace");
      return;
    }
    const body = await openControllerDetail(rowKey, "replace");
    if (!body) return;
    if (body.row.rowKind === "candidate_bundle") {
      setEditing(false);
      setConfirmAction(null);
      setNotice(candidateDrawerRetiredMessage);
      closeControllerDetail("replace");
      return;
    }
    if (body.row.stage === "history_only" && !includeHistory) {
      setWorkbenchQuery((current) => ({ ...current, includeHistory: true }));
      setNotice("此筆為歷史紀錄，已自動開啟「包含歷史」。");
    }
  }, [closeControllerDetail, includeHistory, openControllerDetail, rows, setNotice, setWorkbenchQuery]);

  useEffect(() => {
    if (!initialized || selectedKey || !query.trim()) return;
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
    if (autoOpenedQueryRef.current === normalizedQuery) return;
    const exact = rows.find((row) => row.displayCode.toLocaleLowerCase("zh-Hant") === normalizedQuery);
    if (exact) {
      autoOpenedQueryRef.current = normalizedQuery;
      void openDetail(exact.rowKey);
    }
  }, [initialized, openDetail, query, rows, selectedKey]);

  useEffect(() => {
    if (!selectedKey || !detail?.row || loading || detailLoading) return;
    if (rows.some((row) => row.rowKey === selectedKey)) return;
    if (detail.row.stage === "history_only" && !includeHistory) return;
    closeDetail();
    setNotice("目前篩選條件不包含原先開啟的資料，明細已關閉。");
  }, [closeDetail, detail?.row, detailLoading, includeHistory, loading, rows, selectedKey, setNotice]);

  const handleListSelect = useCallback((row: DrawingWorkbenchRow, options: { openDetail: boolean }) => {
    setSelectedKey(row.rowKey);
    if (options.openDetail) void openDetail(row.rowKey);
  }, [openDetail, setSelectedKey]);

  const handleListOpen = useCallback((row: DrawingWorkbenchRow) => {
    void openDetail(row.rowKey);
  }, [openDetail]);

  const listKeyboard = useListKeyboardShortcuts({
    items: rows,
    selectedKey,
    listRef,
    rowSelector: "[data-drawing-workbench-row]",
    getKey: drawingWorkbenchRowKey,
    getCopyText: drawingWorkbenchCopyText,
    onSelect: handleListSelect,
    onOpenDetail: handleListOpen,
    onCloseDetail: closeDetail,
    isDetailOpen: Boolean(detail)
  });

  const updateWorkbenchQuery = useCallback((patch: Partial<DrawingWorkbenchQueryState>) => {
    setWorkbenchQuery((current) => ({ ...current, ...patch }));
  }, [setWorkbenchQuery]);

  async function refreshDetailAndRows(workspaceId?: string) {
    const rowKey = workspaceId ? `candidate:${workspaceId}` : selectedKey;
    await Promise.all([rowKey ? openDetail(rowKey) : Promise.resolve(), loadRows()]);
  }

  function acceptCandidateWorkspace(workspace: CandidateRevisionWorkspace) {
    // Mutation routes return the complete workspace record; the editor exposes only the fields it consumes.
    const authoritativeWorkspace = workspace as unknown as NonNullable<DrawingWorkbenchDetailResponse["candidate"]>;
    setDetail((current) => current?.candidate ? { ...current, candidate: authoritativeWorkspace } : current);
    void refreshDetailAndRows(workspace.id);
  }

  async function updateWorkspace(payload: Record<string, unknown>) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    setActionBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, expectedRowVersion: workspace.rowVersion })
    });
    const body = await readBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setActionBusy(false);
    if (!response.ok || !body.workspace) {
      setError(apiMessage(body, "申請內容儲存失敗，請重新整理後再試。"));
      if (response.status === 409) await refreshDetailAndRows(workspace.id);
      return;
    }
    setEditing(false);
    setNotice("申請內容已更新。 ".trim());
    await refreshDetailAndRows(body.workspace.id);
  }

  async function runWorkspaceAction(action: WorkspaceAction) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    const endpoint = ({
      cancel: "cancel",
      submit: "submit-bundle-review",
      withdraw: "withdraw-bundle-review",
      publish: "publish"
    } as const)[action];
    const mapKey = `${workspace.id}:${action}`;
    const idempotencyKey = idempotencyKeys.current.get(mapKey) ?? createIdempotencyKey(action);
    idempotencyKeys.current.set(mapKey, idempotencyKey);
    setActionBusy(true);
    setError("");
    let response: Response;
    try {
      response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          ...(action === "cancel" ? { expectedRowVersion: workspace.rowVersion, reason: "user_cancelled_draft" } : {}),
          ...(action === "submit" ? { expectedWorkspaceRowVersion: workspace.rowVersion, reason: "draft_owner_confirmed_candidate_bundle_review" } : {}),
          ...(action === "withdraw" ? { expectedWorkspaceRowVersion: workspace.rowVersion, reason: "draft_owner_withdrew_candidate_bundle_review" } : {}),
          ...(action === "publish" ? { expectedRowVersion: workspace.rowVersion } : {})
        })
      });
    } catch {
      setActionBusy(false);
      setConfirmAction(null);
      const unknownResultMessage = ({
        cancel: "取消結果尚未確認；請重新整理狀態後再決定下一步。",
        submit: "送審結果尚未確認；請重新整理狀態後再決定下一步。",
        withdraw: "撤回結果尚未確認；請重新整理狀態後再決定下一步。",
        publish: "正式發布結果尚未確認；請重新整理狀態後再決定下一步。"
      } as const)[action];
      try { await refreshDetailAndRows(workspace.id); } catch {}
      setError(unknownResultMessage);
      return;
    }
    const body = await readBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setActionBusy(false);
    setConfirmAction(null);
    if (!response.ok || !body.workspace) {
      setError(apiMessage(body, "操作未完成，請重新整理後再試。"));
      if (response.status !== 503) idempotencyKeys.current.delete(mapKey);
      if (response.status === 409) await refreshDetailAndRows(workspace.id);
      return;
    }
    idempotencyKeys.current.delete(mapKey);
    setNotice(({ cancel: "申請已取消。", submit: "整包內容已送交審核。", withdraw: "審核已撤回，可繼續補正。", publish: "圖料號已正式建立。" } as const)[action]);
    await refreshDetailAndRows(body.workspace.id);
  }

  return (
    <>
      <div className="topbar drawing-workbench-topbar">
        <div>
          <h1>圖號工作台</h1>
          <p>搜尋圖號工作、確認目前工作狀態，並執行唯一下一步。</p>
        </div>
        <div className="number-state-owner-actions">
          <StatusScopeHelp scope="drawingList" />
          <button className="secondary-button" type="button" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
          <NumberStateOwnerCreateAction label="建立圖號" surface="drawings" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>

      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status"><span>{notice}</span><button className="icon-button" type="button" onClick={() => setNotice("")} aria-label="關閉通知"><X size={16} /></button></div> : null}
      {error ? <div className="number-state-message is-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadRows()}>重新載入</button><button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤"><X size={16} /></button></div> : null}

      <section className="panel drawing-workbench-toolbar">
        <div className="drawing-workbench-filter-grid">
          <label className="drawing-workbench-search">
            <span>搜尋</span>
            <div><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => updateWorkbenchQuery({ query: event.target.value })} placeholder="圖號、品名、料號" /></div>
          </label>
          <label><span>範圍</span><select value={view} onChange={(event) => updateWorkbenchQuery({ view: event.target.value as DrawingWorkbenchView })}><option value="all">全部</option><option value="mine">我的待處理</option><option value="work">工作中</option></select></label>
          <label><span>工作狀態</span><HumanStatusFilterSelect value={humanStatus} onChange={(value) => updateWorkbenchQuery({ humanStatus: value })} /></label>
          <label><span>系列代號</span><select value={seriesCode} onChange={(event) => updateWorkbenchQuery({ seriesCode: event.target.value })}><option value="">全部系列</option>{seriesCodeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label><span>圖面用途</span><select value={purposeCode} onChange={(event) => updateWorkbenchQuery({ purposeCode: event.target.value as "" | DrawingPurposeFilter })}><option value="">全部用途</option>{purposeCodeOptions.map((option) => <option value={option} key={option}>{option} {displayDrawingPurposeLabel(option)}</option>)}</select></label>
          <label><span>資料狀態</span><select value={recordStatus} onChange={(event) => updateWorkbenchQuery({ recordStatus: event.target.value as "" | DrawingRecordStatusFilter })}><option value="">全部狀態</option>{recordStatusOptions.map((option) => <option value={option} key={option}>{formatStatusForUser(option, "masterRecord")}</option>)}</select></label>
        </div>
        <label className="drawing-workbench-history-toggle"><input type="checkbox" checked={includeHistory} onChange={(event) => updateWorkbenchQuery({ includeHistory: event.target.checked })} /><span>包含歷史</span><small>顯示已取消、已作廢與已合併紀錄</small></label>
      </section>

      <section className="panel pdm-master-table-panel drawing-workbench-list-panel">
        <PdmWorkbenchList
          rows={rows}
          getRowKey={drawingWorkbenchRowKey}
          selectedKey={selectedKey}
          ariaLabel="圖號工作清單"
          className="drawing-workbench-table-wrap"
          tableClassName="drawing-workbench-table"
          rowDataAttribute="data-drawing-workbench-row"
          rowAriaKeyShortcuts={listKeyboard.shortcuts}
          containerRef={listRef}
          onContainerKeyDown={listKeyboard.handleKeyDown}
          loading={loading}
          loadingState={<div className="empty">正在載入圖號工作...</div>}
          emptyState={!error ? <div className="empty"><strong>目前沒有符合條件的圖號工作</strong><p>{view === "mine" ? "你目前沒有待處理事項；可切換到「工作中」或建立圖號。" : "請調整搜尋或篩選條件。"}</p></div> : null}
          onOpenRow={(row) => void openDetail(row.rowKey)}
          columns={[
            {
              key: "code",
              header: "圖號",
              dataLabel: "圖號",
              className: "drawing-workbench-col-code",
              render: (row) => (
                <button className="link-button pdm-identity-code" type="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void openDetail(row.rowKey); } }} onClick={(event) => { event.stopPropagation(); void openDetail(row.rowKey); }}>
                  <SearchHighlight value={row.displayCode} query={query} />{row.additionalDrawingCount > 0 ? ` +${row.additionalDrawingCount}` : ""}
                </button>
              )
            },
            { key: "name", header: "品名", dataLabel: "品名", className: "drawing-workbench-col-name", render: (row) => <div className="pdm-identity-name"><SearchHighlight value={row.displayName} query={query} /></div> },
            { key: "part", header: "料號", dataLabel: "料號", className: "drawing-workbench-col-part", render: (row) => <div className="pdm-identity-name"><SearchHighlight value={row.relatedPartSummary} query={query} /></div> },
            { key: "spacer", header: null, className: "drawing-workbench-layout-spacer pdm-identity-layout-spacer", cellClassName: "drawing-workbench-layout-spacer pdm-identity-layout-spacer", ariaHidden: true },
            { key: "status", header: "工作狀態", dataLabel: "工作狀態", className: "drawing-workbench-col-stage", render: (row) => <WorkbenchStatusCell row={row} /> }
          ]}
        />
        {(pageIndex > 0 || nextCursor) ? <div className="number-state-pagination"><button className="secondary-button" type="button" disabled={pageIndex === 0 || loading} onClick={goPrevious}><ChevronLeft size={16} />上一頁</button><span>第 {pageIndex + 1} 頁</span><button className="secondary-button" type="button" disabled={!nextCursor || loading} onClick={goNext}>下一頁<ChevronRight size={16} /></button></div> : null}
      </section>

      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.drawing ? <DrawingMasterDrawer drawing={detail.drawing} row={detail.row} capabilities={detail.capabilities} productionSlice={productionSlice} width={drawerWidth} onStartResize={startDrawerResize} onDataChanged={async () => { await refreshDetailAndRows(); }} onOpenDetail={openDetail} onClose={closeDetail} /> : null}
    </>
  );
}

function PrimaryAction({ action, rowKey, onOpenDetail, productionSlice }: { action: DrawingWorkbenchPrimaryAction | null; rowKey: string; onOpenDetail: (rowKey: string) => Promise<void>; productionSlice: ProductionSliceClientStatus | null }) {
  if (!action) return <span className="drawing-workbench-processing">系統處理中，不需再操作</span>;
  if (action.href && routeIsUnopened(action.href, productionSlice)) {
    return <button className="primary-button drawing-workbench-row-action drawing-workbench-unopened-action" type="button" disabled title={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage}>{action.label}<span>未開放</span></button>;
  }
  const samePageDetail = action.href?.startsWith("/numbering/drawings?") ?? false;
  if (samePageDetail || !action.href) {
    return <div className="drawing-workbench-primary-action"><button className="primary-button drawing-workbench-row-action" type="button" disabled={!action.enabled} title={action.disabledReason ?? action.label} onClick={(event) => { event.stopPropagation(); if (action.enabled) void onOpenDetail(rowKey); }}>{action.label}</button><PermissionGuidance action={action} /></div>;
  }
  return <div className="drawing-workbench-primary-action"><Link className="primary-button drawing-workbench-row-action" aria-disabled={!action.enabled} tabIndex={action.enabled ? undefined : -1} href={action.enabled ? action.href : "#"} title={action.disabledReason ?? action.label} onClick={(event) => { event.stopPropagation(); if (!action.enabled) event.preventDefault(); }}>{action.label}</Link><PermissionGuidance action={action} /></div>;
}

function PermissionGuidance({ action }: { action: DrawingWorkbenchPrimaryAction }) {
  if (action.enabled || !action.disabledReason) return null;
  return (
    <span className="drawing-workbench-permission-guidance">
      <span>{action.disabledReason}</span>
      {action.adminHref ? <Link href={action.adminHref} onClick={(event) => event.stopPropagation()}>前往權限設定</Link> : null}
    </span>
  );
}

function WorkbenchStatusCell({ row }: { row: DrawingWorkbenchRow }) {
  return (
    <div className="drawing-workbench-stage">
      <HumanStatusBadge status={row.humanStatus} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />
    </div>
  );
}

function routeIsUnopened(href: string, productionSlice: ProductionSliceClientStatus | null) {
  if (!productionSlice?.configured) return false;
  const pathname = href.split("?", 1)[0]?.replace(/\/$/u, "") || "/";
  return !productionSlice.openPagePaths.includes(pathname);
}

function WorkbenchActionLink({ href, label, icon, productionSlice, primary = false, capability }: { href: string; label: string; icon: ReactNode; productionSlice: ProductionSliceClientStatus | null; primary?: boolean; capability: string }) {
  const className = primary ? "primary-button" : "secondary-button";
  if (routeIsUnopened(href, productionSlice)) {
    return <button className={`${className} drawing-workbench-unopened-action`} type="button" disabled title={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage} data-capability={capability}>{icon}{label}<span>未開放</span></button>;
  }
  return <Link className={className} href={href} data-capability={capability}>{icon}{label}</Link>;
}

function withDrawingReturnTo(href: string | null, returnTo: string) {
  if (!href || !href.startsWith("/numbering/revisions")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

export function DrawingDetailContent({
  drawing,
  row,
  capabilities,
  productionSlice,
  onDataChanged,
  returnTo: returnToOverride,
  embedded = false
}: {
  drawing: DrawingDetail;
  row: DrawingWorkbenchRow;
  capabilities: DrawingWorkbenchCapabilities;
  productionSlice: ProductionSliceClientStatus | null;
  onDataChanged: () => Promise<void>;
  returnTo?: string;
  embedded?: boolean;
}) {
  const slots = createDrawingDetailSlots({ drawing, row, capabilities, productionSlice, onDataChanged, returnTo: returnToOverride, embedded });
  return (
    <SharedDrawingDetailContent
      model={{
        overview: slots.overview,
        body: slots.body,
        pending: slots.pending,
        more: slots.more,
        bodyTitle: "圖面與附件",
        bodyLabel: "圖面與附件",
        pendingTitle: "目前狀態",
        pendingLabel: "目前狀態",
        moreTitle: null
      }}
      overviewLabel="圖號摘要"
      moreLabel="更多圖號資料"
      bodyClassName={embedded ? "drawing-detail-content" : "pdm-entity-drawer-body"}
      dataComponent="drawing-detail-content"
    />
  );
}

function createDrawingDetailSlots({
  drawing,
  row,
  capabilities,
  productionSlice,
  onDataChanged,
  returnTo: returnToOverride,
  embedded = false
}: {
  drawing: DrawingDetail;
  row: DrawingWorkbenchRow;
  capabilities: DrawingWorkbenchCapabilities;
  productionSlice: ProductionSliceClientStatus | null;
  onDataChanged: () => Promise<void>;
  returnTo?: string;
  embedded?: boolean;
}) {
  const sourcePart = drawing.sameRootParts.find((part) => drawing.linkedPartNumbers.includes(part.partNumber)) ?? drawing.sameRootParts[0] ?? null;
  const returnTo = returnToOverride ?? `/numbering/drawings?view=all${row.stage === "history_only" ? "&history=include" : ""}&detail=${encodeURIComponent(row.rowKey)}`;
  const embeddedPrimaryAction = embedded && row.primaryAction
    ? { ...row.primaryAction, href: withDrawingReturnTo(row.primaryAction.href, returnTo) }
    : row.primaryAction;
  const linkedPartCount = drawing.linkedPartNumbers.length;
  const sameRootPartCount = drawing.sameRootParts.length;
  const summaryFacts = [
    { label: "用途", value: `${drawing.purposeCode} ${displayDrawingPurposeLabel(drawing.purposeCode)}` },
    { label: "關聯料號", value: linkedPartCount > 0 ? `${linkedPartCount} 個` : "尚未關聯" },
    ...(sameRootPartCount !== linkedPartCount ? [{ label: "同根料號", value: `${sameRootPartCount} 個` }] : [])
  ];
  const openEmbeddedPrimaryAction = async () => {
    if (embeddedPrimaryAction?.href) window.location.assign(embeddedPrimaryAction.href);
  };
  return {
    overview: (
        <DrawingDetailSummary
          facts={summaryFacts}
          dataMode="controlled"
        />
    ),
    body: (
      <div id="drawing-controlled-attachments" className="drawing-workbench-core-section">
        <MasterAttachmentPanel compact drawingDetailSkeleton alwaysExpandedExceptHistory authorityMode="controlled_summary" entityType="drawing_number" entityCode={drawing.drawingNumber} processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)} readOnly pendingRevisionReviews={drawing.pendingApproval ? { ...drawing.pendingApproval, canReview: capabilities.canReviewApprovals } : null} productionSliceEnforced={Boolean(productionSlice?.configured)} productionSliceUnopenedMessage={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage} />
      </div>
    ),
    pending: (
      <>
        {row.terminal ? <section className="drawing-workbench-terminal-panel" aria-label="歷史狀態說明"><strong>{row.terminal.reasonLabel}</strong><p>{row.terminal.nextStepLabel}</p></section> : null}
        {row.warning ? <div className="drawing-workbench-header-warning"><AlertTriangle size={15} /><span>{row.warning.message}</span></div> : null}
        {drawing.titleBlockVariantWarning ? <TitleBlockVariantWarning /> : null}
        {drawing.releaseStatusMismatch ? <ReleaseStatusMismatchPanel drawing={drawing} productionSlice={productionSlice} /> : null}
        <DrawingSubmissionPrerequisitePanel drawing={drawing} canReviewApprovals={capabilities.canReviewApprovals} />
      </>
    ),
    more: (
      <>
        {embedded ? <div className="drawing-detail-action-row" data-capability="drawing-revision"><PrimaryAction action={embeddedPrimaryAction} rowKey={row.rowKey} onOpenDetail={openEmbeddedPrimaryAction} productionSlice={productionSlice} /></div> : null}
        <SameRootPartPanel drawing={drawing} />
        <section id="drawing-data-maintenance" className="drawing-workbench-secondary-section">
          <div className="drawing-workbench-secondary-section-heading"><span>資料維護</span></div>
          <div className="drawing-workbench-secondary-section-body">
            <NumberingContextualEntrypoints
              mode="drawing"
              rootId={drawing.partRootId}
              rootCode={drawing.rootCode}
              coreName={drawing.coreName}
              rootRecordStatus={drawing.recordStatus}
              drawing={{ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus, linkedPartNumbers: drawing.linkedPartNumbers }}
              part={sourcePart ? { id: sourcePart.id, partNumber: sourcePart.partNumber, partName: sourcePart.partName, recordStatus: sourcePart.recordStatus } : undefined}
              onChanged={onDataChanged}
            />
          </div>
        </section>
      </>
    )
  };
}

function DrawingMasterDrawer({ drawing, row, capabilities, productionSlice, width, onStartResize, onDataChanged, onOpenDetail, onClose }: { drawing: DrawingDetail; row: DrawingWorkbenchRow; capabilities: DrawingWorkbenchCapabilities; productionSlice: ProductionSliceClientStatus | null; width: number; onStartResize: (clientX: number) => void; onDataChanged: () => Promise<void>; onOpenDetail: (rowKey: string) => Promise<void>; onClose: () => void }) {
  const slots = createDrawingDetailSlots({ drawing, row, capabilities, productionSlice, onDataChanged });
  return (
    <DrawingWorkspaceDrawer
      open
      width={width}
      ariaLabel="圖號明細"
      title={drawing.drawingNumber}
      subtitle={drawing.coreName}
      status={<HumanStatusBadge status={row.humanStatus} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />}
      primaryAction={<div data-capability="drawing-revision"><PrimaryAction action={row.primaryAction} rowKey={row.rowKey} onOpenDetail={onOpenDetail} productionSlice={productionSlice} /></div>}
      secondaryActions={row.secondaryAction ? <DrawingLifecycleSecondaryAction action={row.secondaryAction} onDone={onDataChanged} /> : null}
      entityType="drawing_number"
      entityCode={drawing.drawingNumber}
      sourceContext="numbering_drawings"
      className="drawing-workbench-inline-header"
      resizeLabel="調整圖號明細寬度"
      closeLabel="關閉圖號明細"
      onClose={onClose}
      onStartResize={onStartResize}
      keepOpenSelector="[data-drawing-workbench-row='true']"
      overviewLabel="圖號摘要"
      moreLabel="更多圖號資料"
      content={{
        overview: slots.overview,
        body: slots.body,
        pending: slots.pending,
        more: slots.more,
        bodyTitle: "圖面與附件",
        bodyLabel: "圖面與附件",
        pendingTitle: "目前狀態",
        pendingLabel: "目前狀態",
      moreTitle: null
      }}
    />
  );
}

function DrawingLifecycleSecondaryAction({ action, onDone }: { action: NonNullable<DrawingWorkbenchRow["secondaryAction"]>; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function execute() {
    if (busy) return;
    setBusy(true);
    setError("");
    const response = await fetch(action.commandHref, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `drawing-lifecycle-withdraw:${crypto.randomUUID()}`
      },
      body: "{}"
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      if (response.status === 410 && typeof body.canonicalHref === "string") {
        window.location.assign(body.canonicalHref);
        return;
      }
      setError(String(body.message ?? body.error ?? "撤回失敗，請重新整理後再試。"));
      return;
    }
    await onDone();
  }
  return <span className="drawing-lifecycle-secondary-action"><button className="secondary-button" type="button" onClick={() => void execute()} disabled={busy}>{busy ? "撤回中" : action.label}</button>{error ? <small role="alert">{error}</small> : null}</span>;
}

function TitleBlockVariantWarning() {
  return (
    <section className="panel drawing-workbench-risk-panel is-danger" data-capability="title-block-risk">
      <div className="panel-header">
        <div><h2>Title block 變體風險</h2><p>同一張製造圖對應多個料號，且描述可能含材質、顏色或表面處理；請確認 title block 沒有寫死單一變體。</p></div>
        <AlertTriangle size={18} aria-hidden="true" />
      </div>
    </section>
  );
}

function ReleaseStatusMismatchPanel({ drawing, productionSlice }: { drawing: DrawingDetail; productionSlice: ProductionSliceClientStatus | null }) {
  const mismatch = drawing.releaseStatusMismatch;
  if (!mismatch) return null;
  return (
    <section id="drawing-release-status-mismatch" className="panel drawing-workbench-risk-panel is-warning" data-capability="release-status-remediation">
      <div className="panel-header">
        <div>
          <h2>發布狀態待確認</h2>
          <p>系統找到已發布的送審版次 {mismatch.revision}，但圖號主資料仍是 {formatStatusForUser(drawing.recordStatus, "masterRecord")}。</p>
        </div>
        <WorkbenchActionLink href={`/submissions/${encodeURIComponent(mismatch.submissionId)}`} label="查看送審明細" icon={<ClipboardCheck size={16} />} productionSlice={productionSlice} capability="release-status-remediation-detail" />
      </div>
    </section>
  );
}

function DrawingSubmissionPrerequisitePanel({ drawing, canReviewApprovals }: { drawing: DrawingDetail; canReviewApprovals: boolean }) {
  const incompleteParts = getIncompleteSameRootParts(drawing);
  const missingCostParts = drawing.sameRootParts.filter((part) => part.standardCostStatus === "missing");
  const pendingApproval = drawing.pendingApproval ?? null;
  const hasOutstandingItems = incompleteParts.length > 0 || Boolean(pendingApproval);
  const outstandingCount = incompleteParts.length + (pendingApproval?.count ?? 0);
  if (!hasOutstandingItems) return null;
  return (
    <section className={`panel drawing-prerequisite-panel ${hasOutstandingItems ? "is-blocked" : "is-ready"}`} data-capability="submission-readiness">
      <div className="drawing-prerequisite-summary"><span>送審檢查</span><strong>{hasOutstandingItems ? `${outstandingCount} 項待補` : "資料已備妥"}</strong></div>
      <div className="drawing-workbench-readiness-list">
        {incompleteParts.length > 0 ? <ReadinessChip icon={<Link2 size={15} />} title="主資料" state={`${incompleteParts.length} 筆`} tone="danger" action={<a href="#drawing-same-root-parts">前往補資料</a>} /> : null}
        {missingCostParts.length > 0 ? <ReadinessChip icon={<DollarSign size={15} />} title="標準成本" state={`${missingCostParts.length} 筆未設定・選填`} action={<Link href={`/parts?detail=${encodeURIComponent(missingCostParts[0].partNumber)}&focus=cost`}>前往補成本</Link>} /> : null}
        {pendingApproval ? <ReadinessChip icon={<ClipboardCheck size={15} />} title="進版審核" state={canReviewApprovals ? `${pendingApproval.count} 筆` : "等待主管"} tone="warning" action={canReviewApprovals ? <a href={pendingApproval.workbenchHref}>前往審核</a> : undefined} /> : null}
      </div>
    </section>
  );
}

function ReadinessChip({ icon, title, state, tone = "default", action }: { icon: ReactNode; title: string; state: string; tone?: "default" | "success" | "danger" | "warning"; action?: ReactNode }) {
  return <div className={`drawing-workbench-readiness-chip is-${tone}`}><span>{icon}</span><span>{title}</span><strong>{state}</strong>{action ? <span className="drawing-workbench-readiness-action">{action}</span> : null}</div>;
}

function getIncompleteSameRootParts(drawing: DrawingDetail) {
  return drawing.sameRootParts.filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
}

type SameRootPart = DrawingDetail["sameRootParts"][number];

function SameRootPartPanel({ drawing }: { drawing: DrawingDetail }) {
  if (drawing.sameRootParts.length === 0) return null;
  return (
    <section id="drawing-same-root-parts" className="panel same-root-part-panel" data-capability="same-root-part-management">
      <div className="same-root-part-details">
        <div className="same-root-part-details-heading"><h2>同根料號</h2></div>
        <div className="drawing-workbench-part-list">
          {drawing.sameRootParts.map((part) => <PartMasterDataCard key={part.id} part={part} currentDrawingNumber={drawing.drawingNumber} />)}
        </div>
      </div>
    </section>
  );
}

function PartMasterDataCard({ part, currentDrawingNumber }: { part: SameRootPart; currentDrawingNumber: string }) {
  return (
    <article className="drawing-workbench-part-card">
      <div className="drawing-workbench-part-card-header">
        <div><strong>{part.partNumber}</strong><p>{part.partName}</p></div>
      </div>
      <div className="drawing-workbench-part-summary">
        {part.materialLabel || part.materialCode ? <span>材質 {part.materialLabel || part.materialCode}</span> : <span className="is-missing">材質待補</span>}
        {part.surfaceTreatment ? <span>表面處理 {part.surfaceTreatment}</span> : <span className="is-missing">表面處理待補</span>}
        {part.colorLabel || part.colorCode ? <span>顏色 {part.colorLabel || part.colorCode}</span> : null}
        {part.variantNote ? <span>變體 {part.variantNote}</span> : null}
        {part.standardCostStatus === "missing" ? <span>標準成本未設定（選填）</span> : <span className="is-complete">標準成本完成</span>}
        {part.primaryDrawingNumber && part.primaryDrawingNumber !== currentDrawingNumber ? <span>主要製造圖 {part.primaryDrawingNumber}</span> : null}
      </div>
    </article>
  );
}
