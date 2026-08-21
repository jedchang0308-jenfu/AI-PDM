"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardCheck, Link2, RefreshCcw, Search, X } from "lucide-react";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import { DrawingRecognitionStatusChip } from "@/components/drawing-recognition-status-chip";
import {
  DrawingDetailContent as SharedDrawingDetailContent,
  DrawingDetailSummary
} from "@/components/drawing-detail-content";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { PdmWorkbenchLayoutSwitch, type PdmWorkbenchLayout } from "@/components/pdm-workbench-layout-switch";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { PdmWorkbenchPreviewGallery } from "@/components/pdm-workbench-preview-gallery";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import { SearchHighlight } from "@/components/search-highlight";
import { NumberSortHeader } from "@/components/number-sort-header";
import {
  NumberStateOwnerCreateAction,
} from "@/components/number-state-workspace";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import {
  DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
  DRAWING_DETAIL_DRAWER_MIN_WIDTH,
  DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
  DrawingWorkspaceDrawer
} from "@/components/drawing-workspace-drawer";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { UnifiedPdmEntityDetailDrawer } from "@/components/unified-pdm-entity-detail-drawer";
import { ACTIVE_DRAWING_PURPOSE_CODES, displayDrawingPurposeLabel, isManufacturingDrawingPurpose } from "@/lib/numbering-identity";
import { PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import { formatStatusForUser } from "@/lib/status-display";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import type {
  DrawingWorkbenchDetailResponse,
  DrawingWorkbenchListResponse,
  DrawingWorkbenchPrimaryAction,
  DrawingWorkbenchRow,
  DrawingWorkbenchStage,
  DrawingWorkbenchView
} from "@/lib/drawing-workbench";
import { parseWorkStatusSelection, WORK_STATUS_MULTI_SELECT_OPTIONS, type WorkStatusFilter } from "@/lib/work-status-presentation";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import { DEFAULT_NUMBER_SORT_DIRECTION, type NumberSortDirection } from "@/lib/number-sort";

export type DrawingDetail = NonNullable<DrawingWorkbenchDetailResponse["drawing"]>;
export type DrawingWorkbenchCapabilities = DrawingWorkbenchDetailResponse["capabilities"];
type DrawingPurposeFilter = NonNullable<DrawingWorkbenchRow["purposeCode"]>;
type DrawingRecordStatusFilter = NonNullable<DrawingWorkbenchRow["recordStatus"]>;
type DrawingWorkbenchQueryState = {
  view: DrawingWorkbenchView;
  query: string;
  stage: "" | DrawingWorkbenchStage;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  purposeCode: PdmWorkbenchFilterSelection<DrawingPurposeFilter>;
  recordStatus: PdmWorkbenchFilterSelection<DrawingRecordStatusFilter>;
  humanStatus: PdmWorkbenchFilterSelection<WorkStatusFilter>;
  includeHistory: boolean;
  sortDirection: NumberSortDirection;
  lane: PdmWorkbenchFilterSelection<"production" | "rd">;
};
export type ProductionSliceClientStatus = {
  configured: boolean;
  openPagePaths: string[];
  unopenedMessage: string;
};
type DrawingFeatureStatus = { previewGallery?: { drawingEnabled?: boolean }; entityDetail?: { enabled?: boolean } };
const DRAWING_LAYOUT_STORAGE_KEY = "pdm:drawing-workbench:layout:v1";

function validLayout(value: string | null): value is PdmWorkbenchLayout { return value === "list" || value === "preview"; }
function readDrawingLayout(enabled: boolean): PdmWorkbenchLayout {
  if (!enabled) return "list";
  const urlValue = new URLSearchParams(window.location.search).get("layout");
  if (validLayout(urlValue)) return urlValue;
  const stored = window.localStorage.getItem(DRAWING_LAYOUT_STORAGE_KEY);
  return validLayout(stored) ? stored : "list";
}

const defaultProductionSliceUnopenedMessage = "此功能未納入本次編號建立 production slice。";

const initialDrawingWorkbenchQuery: DrawingWorkbenchQueryState = {
  view: "all",
  query: "",
  stage: "",
  seriesCode: { mode: "all" },
  purposeCode: { mode: "all" },
  recordStatus: { mode: "all" },
  humanStatus: { mode: "all" },
  includeHistory: false,
  sortDirection: DEFAULT_NUMBER_SORT_DIRECTION,
  lane: { mode: "all" }
};

function readDrawingWorkbenchLocation(canonicalize = false): PdmWorkbenchLocationState<DrawingWorkbenchQueryState> {
  const params = new URLSearchParams(window.location.search);
  const legacyReserved = params.get("tab") === "reserved";
  const rawView = legacyReserved ? "work" : params.get("view");
  let workStatusQuery: ReturnType<typeof parseWorkStatusSelection>;
  try {
    workStatusQuery = parseWorkStatusSelection(params, { history: params.get("history"), view: rawView, supportsMineView: true, strict: true });
  } catch {
    params.delete("humanStatus");
    params.set("humanStatus", "__none__");
    workStatusQuery = { selection: { mode: "none" }, includeHistory: false, view: "all", rewriteRequired: true };
  }
  const view: DrawingWorkbenchView = workStatusQuery.view === "work" ? "work" : workStatusQuery.view === "mine" ? "mine" : "all";
  const includeHistory = workStatusQuery.includeHistory;
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detail = rawDetail.includes(":") ? rawDetail : rawDetail.startsWith("draft-workspace-") ? `candidate:${rawDetail}` : "";
  const legacyDrawingCode = rawDetail && !detail ? rawDetail : "";
  const rawPageIndex = Number(params.get("page") ?? "0");
  const pageIndex = Number.isInteger(rawPageIndex) && rawPageIndex >= 0 ? rawPageIndex : 0;
  const cursor = params.get("cursor")?.trim() || null;
  const seriesCode = parsePdmWorkbenchFilterSelectionForBrowser(params, "seriesCode", { maxValueLength: 80 });
  const purposeCode = parsePdmWorkbenchFilterSelectionForBrowser<DrawingPurposeFilter>(params, "purposeCode", { allowedValues: ACTIVE_DRAWING_PURPOSE_CODES });
  const recordStatus = parsePdmWorkbenchFilterSelectionForBrowser<DrawingRecordStatusFilter>(params, "recordStatus", { allowedValues: PDM_WORKBENCH_RECORD_STATUS_VALUES });
  const lane = parsePdmWorkbenchFilterSelectionForBrowser<"production" | "rd">(params, "lane", { allowedValues: ["production", "rd"] });
  if (canonicalize) {
    params.delete("tab");
    params.set("view", view);
    includeHistory ? params.set("history", "include") : params.delete("history");
    serializePdmWorkbenchFilterSelection(params, "humanStatus", workStatusQuery.selection);
    serializePdmWorkbenchFilterSelection(params, "seriesCode", seriesCode);
    serializePdmWorkbenchFilterSelection(params, "purposeCode", purposeCode);
    serializePdmWorkbenchFilterSelection(params, "recordStatus", recordStatus);
    serializePdmWorkbenchFilterSelection(params, "lane", lane);
    if (detail) params.set("detail", detail);
    pageIndex > 0 ? params.set("page", String(pageIndex)) : params.delete("page");
    cursor ? params.set("cursor", cursor) : params.delete("cursor");
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);
  }
  return {
    query: {
      view,
      query: params.get("query")?.trim() || legacyDrawingCode,
      stage: (params.get("stage")?.trim() || "") as "" | DrawingWorkbenchStage,
      seriesCode,
      purposeCode,
      recordStatus,
      humanStatus: workStatusQuery.selection,
      includeHistory,
      sortDirection: params.get("sortDirection") === "desc" ? "desc" : DEFAULT_NUMBER_SORT_DIRECTION,
      lane
    },
    detailKey: detail || null,
    legacyDetail: legacyDrawingCode || null,
    cursor,
    pageIndex
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
  serializePdmWorkbenchFilterSelection(params, "seriesCode", state.query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "purposeCode", state.query.purposeCode);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", state.query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", state.query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", state.query.humanStatus);
  state.query.sortDirection === DEFAULT_NUMBER_SORT_DIRECTION ? params.delete("sortDirection") : params.set("sortDirection", state.query.sortDirection);
  const reviewRequestId = new URLSearchParams(window.location.search).get("reviewRequestId");
  reviewRequestId ? params.set("reviewRequestId", reviewRequestId) : params.delete("reviewRequestId");
  state.detailKey ? params.set("detail", state.detailKey) : params.delete("detail");
  state.cursor ? params.set("cursor", state.cursor) : params.delete("cursor");
  state.pageIndex && state.pageIndex > 0 ? params.set("page", String(state.pageIndex)) : params.delete("page");
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${window.location.pathname}?${params.toString()}`);
}

function drawingWorkbenchListUrl(query: DrawingWorkbenchQueryState, cursor: string | null) {
  const params = new URLSearchParams({
    view: query.view,
    limit: "50",
    history: query.includeHistory ? "include" : "exclude",
    sortDirection: query.sortDirection
  });
  if (query.query.trim()) params.set("query", query.query.trim());
  if (query.stage) params.set("stage", query.stage);
  serializePdmWorkbenchFilterSelection(params, "seriesCode", query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "purposeCode", query.purposeCode);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", query.humanStatus);
  if (cursor) params.set("cursor", cursor);
  return `/api/numbering/drawings/workbench?${params.toString()}`;
}

function drawingWorkbenchDetailUrl(rowKey: string, row?: DrawingWorkbenchRow) {
  const token = row?.lane?.reference.projectionToken;
  return `/api/numbering/drawings/workbench/${encodeURIComponent(rowKey)}${token ? `?projectionToken=${encodeURIComponent(token)}` : ""}`;
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

function shouldSkipUnifiedReviewDetail() {
  return Boolean(new URLSearchParams(window.location.search).get("reviewRequestId"));
}

function reviewReturnTo() {
  const value = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  return normalizePdmApprovalReturnTo(value);
}

export function DrawingWorkbench() {
  const router = useRouter();
  const redirectDrawingWorkbenchLogin = useCallback(() => {
    router.push(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [router]);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const [featureStatus, setFeatureStatus] = useState<DrawingFeatureStatus | null>(null);
  const [layout, setLayout] = useState<PdmWorkbenchLayout>("list");
  const unifiedEntityDetailEnabled = featureStatus?.entityDetail?.enabled === true;
  const skipUnifiedReviewDetail = useCallback(() => shouldSkipUnifiedReviewDetail(), []);
  const listRef = useRef<HTMLDivElement>(null);
  const autoOpenedQueryRef = useRef("");
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
    paginationMode: "server-bidirectional",
    shouldSkipDetailFetch: skipUnifiedReviewDetail,
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
    previousCursor,
    pageIndex,
    loadRows,
    goNext,
    goPrevious,
    openDetail: openControllerDetail,
    closeDetail: closeControllerDetail
  } = controller;
  const { view, query, seriesCode, purposeCode, recordStatus, humanStatus, includeHistory, lane } = workbenchQuery;
  const seriesCodeOptions = filters?.seriesCodeOptions ?? [];
  const purposeCodeOptions = filters?.purposeCodeOptions ?? [];
  const recordStatusOptions = filters?.recordStatusOptions ?? [];
  const seriesFilterOptions = seriesCodeOptions.map((option) => ({ value: option, label: option }));
  const purposeFilterOptions = purposeCodeOptions.map((option) => ({ value: option, label: `${option} ${displayDrawingPurposeLabel(option)}` }));
  const recordStatusFilterOptions = recordStatusOptions.map((option) => ({ value: option, label: formatStatusForUser(option, "masterRecord") }));
  const laneFilterOptions = [{ value: "production" as const, label: "量產最新版" }, { value: "rd" as const, label: "研發最新版" }];
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

  const previewEnabled = featureStatus?.previewGallery?.drawingEnabled === true;
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  useEffect(() => { setReviewRequestId(new URLSearchParams(window.location.search).get("reviewRequestId")); }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/numbering/state-flow/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<DrawingFeatureStatus> : null)
      .then((status) => { if (!cancelled) setFeatureStatus(status); })
      .catch(() => { if (!cancelled) setFeatureStatus({}); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!previewEnabled) {
      setLayout("list");
      const params = new URLSearchParams(window.location.search);
      if (params.get("layout") === "preview") {
        params.delete("layout");
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
      return;
    }
    const apply = () => setLayout(readDrawingLayout(true));
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [previewEnabled]);
  const changeLayout = useCallback((next: PdmWorkbenchLayout) => {
    if (!previewEnabled) return;
    setLayout(next);
    window.localStorage.setItem(DRAWING_LAYOUT_STORAGE_KEY, next);
    const params = new URLSearchParams(window.location.search);
    params.set("layout", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [previewEnabled]);

  const closeDetail = useCallback(() => {
    closeControllerDetail("replace");
  }, [closeControllerDetail]);

  const openDetail = useCallback(async (rowKey: string) => {
    const body = await openControllerDetail(rowKey, "replace");
    if (!body) return;
    if (body.row.stage === "history_only" && !includeHistory) {
      setWorkbenchQuery((current) => ({ ...current, includeHistory: true }));
      setNotice("此筆為歷史紀錄，已自動載入歷史資料。");
    }
  }, [includeHistory, openControllerDetail, setNotice, setWorkbenchQuery]);

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

  async function refreshDetailAndRows(_workspaceId?: string) {
    const rowKey = selectedKey;
    await Promise.all([rowKey ? openDetail(rowKey) : Promise.resolve(), loadRows()]);
  }

  return (
    <>
      <div className="topbar pdm-workbench-topbar drawing-workbench-topbar">
        <div>
          <h1>圖號工作台</h1>
          <p>搜尋圖號工作、確認目前工作狀態，並執行唯一下一步。</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
          <NumberStateOwnerCreateAction label="建立編號" surface="drawings" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>

      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status"><span>{notice}</span><button className="icon-button" type="button" onClick={() => setNotice("")} aria-label="關閉通知"><X size={16} /></button></div> : null}
      {error ? <div className="number-state-message is-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadRows()}>重新載入</button><button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤"><X size={16} /></button></div> : null}

      <section className="panel pdm-workbench-toolbar">
        <div className="drawing-workbench-filter-grid">
          <label className="drawing-workbench-search">
            <span>搜尋</span>
            <div><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => updateWorkbenchQuery({ query: event.target.value })} placeholder="圖號、品名、料號" /></div>
          </label>
          <PdmWorkbenchMultiSelectFilter label="工作狀態" value={humanStatus} options={WORK_STATUS_MULTI_SELECT_OPTIONS} onApply={(value) => updateWorkbenchQuery({ humanStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="系列代號" value={seriesCode} options={seriesFilterOptions} searchable onApply={(value) => updateWorkbenchQuery({ seriesCode: value })} />
          <PdmWorkbenchMultiSelectFilter label="圖面用途" value={purposeCode} options={purposeFilterOptions} onApply={(value) => updateWorkbenchQuery({ purposeCode: value })} />
          <PdmWorkbenchMultiSelectFilter label="資料狀態" value={recordStatus} options={recordStatusFilterOptions} onApply={(value) => updateWorkbenchQuery({ recordStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="版本列" value={lane} options={laneFilterOptions} onApply={(value) => updateWorkbenchQuery({ lane: value })} />
        </div>
        {previewEnabled ? (
          <div className="pdm-workbench-toolbar-footer">
            <div className="pdm-workbench-toolbar-view-actions">
              <PdmWorkbenchLayoutSwitch value={layout} onChange={changeLayout} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel pdm-master-table-panel drawing-workbench-list-panel">
        <div className="number-sort-mobile-control">
          <NumberSortHeader
            label="圖號"
            direction={workbenchQuery.sortDirection}
            onToggle={() => updateWorkbenchQuery({ sortDirection: workbenchQuery.sortDirection === "asc" ? "desc" : "asc" })}
          />
        </div>
        {layout === "preview" && previewEnabled ? <PdmWorkbenchPreviewGallery
          rows={rows}
          selectedKey={selectedKey}
          ariaLabel="圖號 3D 預覽圖"
          loading={loading}
          emptyState={!error ? <div className="empty"><strong>目前沒有符合條件的圖號工作</strong><p>請調整搜尋或篩選條件。</p></div> : null}
          onSelect={(row) => setSelectedKey(row.rowKey)}
          onOpen={(row) => void openDetail(row.rowKey)}
          onCloseDetail={closeDetail}
          getSourceLabel={(row) => row.preview?.sourceRevision ? `版次 ${row.preview.sourceRevision}` : null}
        /> : <PdmWorkbenchList
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
          getGroupKey={(row) => row.lane?.groupKey ?? row.rowKey}
          getGroupAriaLabel={(row) => row.lane ? `${row.displayCode} ${row.lane.laneLabel}` : row.displayCode}
          columns={[
            {
              key: "code",
              header: <NumberSortHeader label="圖號" direction={workbenchQuery.sortDirection} onToggle={() => updateWorkbenchQuery({ sortDirection: workbenchQuery.sortDirection === "asc" ? "desc" : "asc" })} />,
              ariaSort: workbenchQuery.sortDirection === "asc" ? "ascending" : "descending",
              dataLabel: "圖號",
              className: "drawing-workbench-col-code",
              render: (row) => (
                <button className="link-button pdm-identity-code" type="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void openDetail(row.rowKey); } }} onClick={(event) => { event.stopPropagation(); void openDetail(row.rowKey); }}>
                  <SearchHighlight value={row.displayCode} query={query} />{row.additionalDrawingCount > 0 ? ` +${row.additionalDrawingCount}` : ""}{row.lane ? <><span className={`pdm-workbench-lane-badge is-${row.lane.lane}`}>{row.lane.laneLabel}</span>{row.lane.reference.displayRevision && /^\d/u.test(row.lane.reference.displayRevision) ? <span className="pdm-workbench-lane-revision">版次 {row.lane.reference.displayRevision}</span> : null}</> : null}
                </button>
              )
            },
            { key: "name", header: "品名", dataLabel: "品名", className: "drawing-workbench-col-name", render: (row) => <div className="pdm-identity-name"><SearchHighlight value={row.displayName} query={query} /></div> },
            { key: "part", header: "料號", dataLabel: "料號", className: "drawing-workbench-col-part", render: (row) => <div className="pdm-identity-name"><SearchHighlight value={row.relatedPartSummary} query={query} /></div> },
            { key: "spacer", header: null, className: "drawing-workbench-layout-spacer pdm-identity-layout-spacer", cellClassName: "drawing-workbench-layout-spacer pdm-identity-layout-spacer", ariaHidden: true },
            { key: "status", header: "工作狀態", dataLabel: "工作狀態", className: "drawing-workbench-col-stage", render: (row) => <WorkbenchStatusCell row={row} /> }
          ]}
        />}
        <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={pageIndex > 0 && Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={goPrevious} onNext={goNext} />
      </section>

      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.candidate ? (
        <DrawingReadonlyCandidateDrawer detail={detail} width={drawerWidth} onStartResize={startDrawerResize} onClose={closeDetail} productionSlice={productionSlice} />
      ) : null}
      {detail?.drawing && !unifiedEntityDetailEnabled ? <DrawingMasterDrawer drawing={detail.drawing} row={detail.row} capabilities={detail.capabilities} productionSlice={productionSlice} width={drawerWidth} onStartResize={startDrawerResize} onDataChanged={async () => { await refreshDetailAndRows(); }} onOpenDetail={openDetail} onClose={closeDetail} /> : null}
      {unifiedEntityDetailEnabled && selectedKey && detail && !detail.candidate ? <UnifiedPdmEntityDetailDrawer open entityKey={selectedKey.replace(/:(?:production|rd)$/u, "")} surface="drawing" reviewRequestId={reviewRequestId} width={drawerWidth} returnTo={reviewRequestId ? reviewReturnTo() : window.location.pathname + window.location.search} onStartResize={startDrawerResize} onClose={reviewRequestId ? () => router.push(reviewReturnTo()) : closeDetail} /> : null}
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
      <HumanStatusBadge status={row.humanStatus} responsibilityStatus={row.responsibilityStatus} viewerActionability={row.viewerActionability} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />
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
  embedded = false,
  readOnly = false
}: {
  drawing: DrawingDetail;
  row: DrawingWorkbenchRow;
  capabilities: DrawingWorkbenchCapabilities;
  productionSlice: ProductionSliceClientStatus | null;
  onDataChanged: () => Promise<void>;
  returnTo?: string;
  embedded?: boolean;
  readOnly?: boolean;
}) {
  const slots = createDrawingDetailSlots({ drawing, row, capabilities, productionSlice, onDataChanged, returnTo: returnToOverride, embedded, readOnly });
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
  embedded = false,
  readOnly = false
}: {
  drawing: DrawingDetail;
  row: DrawingWorkbenchRow;
  capabilities: DrawingWorkbenchCapabilities;
  productionSlice: ProductionSliceClientStatus | null;
  onDataChanged: () => Promise<void>;
  returnTo?: string;
  embedded?: boolean;
  readOnly?: boolean;
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
        <DrawingRecognitionStatusChip drawingNumber={drawing.drawingNumber} />
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
            {readOnly ? <div className="drawing-readonly-callout"><strong>圖號明細僅供查看</strong><span>進版、補件與維護動作請進入獨立圖號工作區；若要追加關聯資料，請建立候選工作。</span></div> : null}
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

function DrawingReadonlyCandidateDrawer({ detail, width, onStartResize, onClose, productionSlice }: { detail: DrawingWorkbenchDetailResponse; width: number; onStartResize: (clientX: number) => void; onClose: () => void; productionSlice: ProductionSliceClientStatus | null }) {
  const workspace = detail.candidate;
  if (!workspace) return null;
  const primaryRevision = workspace.candidateRevisions.find((revision) => revision.lifecycleStatus !== "cancelled") ?? workspace.candidateRevisions[0] ?? null;
  const primaryFiles = primaryRevision?.files.filter((file) => !file.removedAt) ?? [];
  const historyRevisions = workspace.candidateRevisions.filter((revision) => revision.id !== primaryRevision?.id);
  const threeDFile = primaryFiles.find((file) => file.role === "cad_3d") ?? null;
  const twoDFile = primaryFiles.find((file) => file.role === "drawing_2d") ?? primaryFiles.find((file) => file.role === "pdf") ?? null;
  const returnTo = `/numbering/drawings?view=all&detail=${encodeURIComponent(detail.row.rowKey)}`;
  const candidateFileHref = (revisionId: string, fileId: string, preview = false) => `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(revisionId)}/files/${encodeURIComponent(fileId)}${preview ? "?preview=1" : ""}`;
  const previewCards: DrawingDetailPreviewCard[] = [
    {
      kind: "three-d",
      title: "3D 模型",
      fileName: threeDFile?.displayName ?? null,
      state: threeDFile ? "ready" : "missing",
      stateTitle: threeDFile ? "預覽載入中" : "尚無主要 3D 模型",
      stateText: threeDFile ? "系統會自動載入預覽；點擊預覽可開啟檔案。" : "上傳主要 3D 模型後，預覽會顯示在這裡。",
      media: threeDFile && primaryRevision ? { href: candidateFileHref(primaryRevision.id, threeDFile.id, true), mode: "image", title: "3D 模型預覽", alt: threeDFile.displayName } : undefined
    },
    {
      kind: "two-d",
      title: "2D 圖面",
      fileName: twoDFile?.displayName ?? null,
      state: twoDFile ? "ready" : "missing",
      stateTitle: twoDFile ? "預覽載入中" : "尚無主要 2D 圖面",
      stateText: twoDFile ? "系統會自動載入預覽；點擊預覽可開啟檔案。" : "上傳主要 2D 圖面後，預覽會顯示在這裡。",
      media: twoDFile && primaryRevision ? { href: candidateFileHref(primaryRevision.id, twoDFile.id, true), mode: "document", title: "2D 圖面預覽", alt: twoDFile.displayName } : undefined
    }
  ];
  const revisionStatusLabel = (status: string) => ({ draft: "草稿", review_locked: "審核中", promoted: "已完成", cancelled: "已取消" } as Record<string, string>)[status] ?? status;
  return (
    <DrawingWorkspaceDrawer
      open
      width={width}
      ariaLabel="圖號唯讀明細"
      eyebrow="圖號"
      title={detail.row.displayCode}
      subtitle={detail.row.displayName}
      status={<span className="drawing-workbench-status-context"><span className="drawing-workbench-status-label">目前階段</span><HumanStatusBadge status={detail.row.humanStatus} responsibilityStatus={detail.row.responsibilityStatus} viewerActionability={detail.row.viewerActionability} viewerStatus={detail.row.viewerStatus} availabilityScope={detail.row.availabilityScope} /></span>}
      primaryAction={<PrimaryAction action={detail.row.primaryAction} rowKey={detail.row.rowKey} onOpenDetail={() => Promise.resolve()} productionSlice={productionSlice} />}
      entityType="candidate_bundle"
      entityCode={workspace.id}
      sourceContext="numbering_drawings"
      className="drawing-workbench-inline-header drawing-readonly-drawer"
      resizeLabel="調整圖號明細寬度"
      closeLabel="關閉圖號明細"
      onClose={onClose}
      onStartResize={onStartResize}
      keepOpenSelector="[data-drawing-workbench-row='true']"
      overviewLabel="圖號摘要"
      moreLabel="更多圖號資料"
      content={{
        overview: <DrawingDetailSummary facts={[{ label: "目前階段", value: detail.row.stageLabel }, { label: "圖面用途", value: detail.row.purposeCode ? `${detail.row.purposeCode} ${displayDrawingPurposeLabel(detail.row.purposeCode)}` : "首版準備中" }, { label: "關聯料號", value: detail.row.relatedPartSummary || "尚未關聯" }]} dataMode="lifecycle" />,
        body: <section className="drawing-readonly-summary" aria-label="候選版次摘要">
          <DrawingDetailPreview cards={previewCards} title={null} showMeta={false} className="drawing-readonly-preview" dataSection="drawing-readonly-preview" />
          <section className="drawing-readonly-current-version" aria-label="目前版次">
            <h3>目前版次</h3>
            <p>{primaryRevision ? `版次 ${primaryRevision.revision}` : "尚未建立版次"}</p>
            <h3>目前檔案</h3>
            {primaryFiles.length > 0 ? <ul>{primaryFiles.map((file) => <li key={file.id}><div><strong>{file.displayName}</strong><span>{file.role}</span></div>{primaryRevision ? <a className="drawing-readonly-file-link" href={candidateFileHref(primaryRevision.id, file.id)} target="_blank" rel="noreferrer">查看</a> : null}</li>)}</ul> : <p>尚未上傳必要檔案。</p>}
          </section>
          <details className="drawing-readonly-history" data-history-disclosure="true">
            <summary><span>歷史版次</span><strong>{historyRevisions.length} 個</strong></summary>
            {historyRevisions.length > 0 ? <div className="drawing-readonly-history-list">{historyRevisions.map((revision) => {
              const files = revision.files.filter((file) => !file.removedAt);
              return <details className="drawing-readonly-history-item" key={revision.id} data-history-revision={revision.revision}>
                <summary><span className="drawing-readonly-history-summary-copy"><strong>版次 {revision.revision}</strong><small>{revisionStatusLabel(revision.lifecycleStatus)} · {files.length} 個檔案{revision.updatedAt ? ` · 更新於 ${revision.updatedAt.slice(0, 10)}` : ""}</small></span><span className="drawing-readonly-history-expand">查看明細</span></summary>
                <div className="drawing-readonly-history-detail">
                  {files.length > 0 ? <ul>{files.map((file) => <li key={file.id}><div><strong>{file.displayName}</strong><span>{file.role}</span></div><a className="drawing-readonly-file-link" href={candidateFileHref(revision.id, file.id)} target="_blank" rel="noreferrer">查看</a></li>)}</ul> : <p>此版次沒有可查看的檔案。</p>}
                </div>
              </details>;
            })}</div> : <p className="drawing-readonly-history-empty">尚無歷史版次。</p>}
          </details>
        </section>,
        pending: null,
        more: <a className="secondary-button" href={returnTo}>返回圖號清單</a>,
        bodyTitle: null,
        bodyLabel: "版次與附件",
        moreTitle: "更多"
      }}
    />
  );
}

function DrawingMasterDrawer({ drawing, row, capabilities, productionSlice, width, onStartResize, onDataChanged, onOpenDetail, onClose }: { drawing: DrawingDetail; row: DrawingWorkbenchRow; capabilities: DrawingWorkbenchCapabilities; productionSlice: ProductionSliceClientStatus | null; width: number; onStartResize: (clientX: number) => void; onDataChanged: () => Promise<void>; onOpenDetail: (rowKey: string) => Promise<void>; onClose: () => void }) {
  const slots = createDrawingDetailSlots({ drawing, row, capabilities, productionSlice, onDataChanged, readOnly: true });
  return (
    <DrawingWorkspaceDrawer
      open
      width={width}
      ariaLabel="圖號明細"
      title={drawing.drawingNumber}
      subtitle={drawing.coreName}
      status={(
        <span className="drawing-workbench-status-context">
          <span className="drawing-workbench-status-label">圖號用途</span>
          <HumanStatusBadge status={row.humanStatus} responsibilityStatus={row.responsibilityStatus} viewerActionability={row.viewerActionability} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />
        </span>
      )}
      primaryAction={<div data-capability="drawing-revision"><PrimaryAction action={row.primaryAction} rowKey={row.rowKey} onOpenDetail={onOpenDetail} productionSlice={productionSlice} /></div>}
      secondaryActions={null}
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
  const pendingApproval = drawing.pendingApproval ?? null;
  const hasBlockingItems = incompleteParts.length > 0 || Boolean(pendingApproval);
  const outstandingCount = incompleteParts.length + (pendingApproval?.count ?? 0);
  if (!hasBlockingItems) return null;
  return (
    <>
      {hasBlockingItems ? (
        <section className="panel drawing-prerequisite-panel is-blocked" data-capability="submission-readiness">
          <div className="drawing-prerequisite-summary"><span>送審檢查</span><strong>{`${outstandingCount} 項待補`}</strong></div>
          <div className="drawing-workbench-readiness-list">
            {incompleteParts.length > 0 ? <ReadinessChip icon={<Link2 size={15} />} title="主資料" state={`${incompleteParts.length} 筆`} tone="danger" action={<a href="#drawing-same-root-parts">前往補資料</a>} /> : null}
            {pendingApproval ? <ReadinessChip icon={<ClipboardCheck size={15} />} title="進版審核" state={canReviewApprovals ? `${pendingApproval.count} 筆` : "等待主管"} tone="warning" action={canReviewApprovals ? <a href={pendingApproval.workbenchHref}>前往審核</a> : undefined} /> : null}
          </div>
        </section>
      ) : null}
    </>
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
  const material = part.materialLabel?.trim() || part.materialCode?.trim() || "";
  const surfaceTreatment = part.surfaceTreatment?.trim() || "";
  return (
    <article className="drawing-workbench-part-card">
      <div className="drawing-workbench-part-card-header">
        <div><Link className="link-button" href={`/parts?detail=${encodeURIComponent(part.partNumber)}`} aria-label={`開啟 ${part.partNumber} 的料號工作台`}>{part.partNumber}</Link><p>{part.partName}</p></div>
      </div>
      <div className="drawing-workbench-part-summary">
        {material ? <span>材質 {material}</span> : <span className="is-missing pdm-missing-field">材質待補</span>}
        {surfaceTreatment ? <span>表面處理 {surfaceTreatment}</span> : <span className="is-missing pdm-missing-field">表面處理待補</span>}
        {part.colorLabel || part.colorCode ? <span>顏色 {part.colorLabel || part.colorCode}</span> : null}
        {part.variantNote ? <span>變體 {part.variantNote}</span> : null}
        {part.primaryDrawingNumber && part.primaryDrawingNumber !== currentDrawingNumber ? <span>主要製造圖 {part.primaryDrawingNumber}</span> : null}
      </div>
    </article>
  );
}
