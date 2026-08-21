"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PackageSearch, RefreshCcw, Search, X } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { NumberStateOwnerCreateAction, WorkspaceReadonlyDrawer, type NumberingDraftWorkspace, type WorkspaceAction } from "@/components/number-state-workspace";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { UnifiedPdmEntityDetailDrawer } from "@/components/unified-pdm-entity-detail-drawer";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { PdmWorkbenchLayoutSwitch, type PdmWorkbenchLayout } from "@/components/pdm-workbench-layout-switch";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { PdmWorkbenchPreviewGallery } from "@/components/pdm-workbench-preview-gallery";
import { SearchHighlight } from "@/components/search-highlight";
import { NumberSortHeader } from "@/components/number-sort-header";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import type { CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import { parseWorkStatusSelection, WORK_STATUS_MULTI_SELECT_OPTIONS, type WorkStatusFilter } from "@/lib/work-status-presentation";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import { formatStatusForUser } from "@/lib/status-display";
import type { PartWorkbenchDetailResponse, PartWorkbenchListResponse, PartWorkbenchRow, PartWorkbenchStage, PartWorkbenchView } from "@/lib/part-workbench";
import { PART_WORKBENCH_ITEM_KIND_VALUES } from "@/lib/pdm-workbench-filter-options";
import { PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import { DEFAULT_NUMBER_SORT_DIRECTION, type NumberSortDirection } from "@/lib/number-sort";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";

type PartWorkbenchQueryState = {
  view: PartWorkbenchView;
  query: string;
  stage: "" | PartWorkbenchStage;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  itemKind: PdmWorkbenchFilterSelection<string>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  humanStatus: PdmWorkbenchFilterSelection<WorkStatusFilter>;
  includeHistory: boolean;
  sortDirection: NumberSortDirection;
  lane: PdmWorkbenchFilterSelection<"production" | "rd">;
};

export type PartFormalDetailRendererProps = {
  detail: NonNullable<PartWorkbenchDetailResponse["part"]>;
  busy: boolean;
  productionSliceEnforced: boolean;
  productionSliceUnopenedMessage: string;
  setBusy: (value: boolean) => void;
  onUpdated: () => Promise<void>;
};

type FeatureStatus = { lifecycleV2?: { enabled?: boolean }; partRelationWorkbench?: { enabled?: boolean }; previewGallery?: { partEnabled?: boolean }; entityDetail?: { enabled?: boolean } };
type ProductionSliceStatus = { configured?: boolean; unopenedMessage?: string };
type ApiBody = { error?: string | { code?: string; message?: string }; message?: string };

const initialQuery: PartWorkbenchQueryState = {
  view: "all",
  query: "",
  stage: "",
  seriesCode: { mode: "all" },
  itemKind: { mode: "all" },
  recordStatus: { mode: "all" },
  humanStatus: { mode: "all" },
  includeHistory: false,
  sortDirection: DEFAULT_NUMBER_SORT_DIRECTION,
  lane: { mode: "all" }
};
const defaultUnopenedMessage = "此功能未納入本次編號建立 production slice。";
const PART_LAYOUT_STORAGE_KEY = "pdm:part-workbench:layout:v1";
function validPartLayout(value: string | null): value is PdmWorkbenchLayout { return value === "list" || value === "preview"; }
function readPartLayout(enabled: boolean): PdmWorkbenchLayout {
  if (!enabled) return "list";
  const urlValue = new URLSearchParams(window.location.search).get("layout");
  if (validPartLayout(urlValue)) return urlValue;
  const stored = window.localStorage.getItem(PART_LAYOUT_STORAGE_KEY);
  return validPartLayout(stored) ? stored : "list";
}

function readLocation(canonicalize = false): PdmWorkbenchLocationState<PartWorkbenchQueryState> {
  const params = new URLSearchParams(window.location.search);
  const legacyReserved = params.get("tab") === "reserved" || params.get("tab") === "drafts";
  const rawView = legacyReserved ? "work" : params.get("view");
  let workStatusQuery: ReturnType<typeof parseWorkStatusSelection>;
  try {
    workStatusQuery = parseWorkStatusSelection(params, { history: params.get("history"), view: rawView, supportsMineView: true, strict: true });
  } catch {
    params.delete("humanStatus");
    params.set("humanStatus", "__none__");
    workStatusQuery = { selection: { mode: "none" }, includeHistory: false, view: "all", rewriteRequired: true };
  }
  const view: PartWorkbenchView = workStatusQuery.view === "work" ? "work" : workStatusQuery.view === "mine" ? "mine" : "all";
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detailKey = rawDetail
    ? rawDetail.includes(":") ? rawDetail : legacyReserved ? `candidate:${rawDetail}` : rawDetail
    : null;
  const seriesCode = parsePdmWorkbenchFilterSelectionForBrowser(params, "seriesCode", { maxValueLength: 80 });
  const itemKind = parsePdmWorkbenchFilterSelectionForBrowser(params, "itemKind", { allowedValues: PART_WORKBENCH_ITEM_KIND_VALUES, maxValueLength: 30 });
  const recordStatus = parsePdmWorkbenchFilterSelectionForBrowser<NumberingRecordStatus>(params, "recordStatus", { allowedValues: PDM_WORKBENCH_RECORD_STATUS_VALUES, maxValueLength: 40 });
  const lane = parsePdmWorkbenchFilterSelectionForBrowser<"production" | "rd">(params, "lane", { allowedValues: ["production", "rd"] });
  if (canonicalize) {
    params.delete("tab");
    params.set("view", view);
    workStatusQuery.includeHistory ? params.set("history", "include") : params.delete("history");
    serializePdmWorkbenchFilterSelection(params, "humanStatus", workStatusQuery.selection);
    serializePdmWorkbenchFilterSelection(params, "seriesCode", seriesCode);
    serializePdmWorkbenchFilterSelection(params, "itemKind", itemKind);
    serializePdmWorkbenchFilterSelection(params, "recordStatus", recordStatus);
    serializePdmWorkbenchFilterSelection(params, "lane", lane);
    if (detailKey && detailKey !== rawDetail) params.set("detail", detailKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  return {
    query: {
      view,
      query: params.get("query")?.trim() ?? "",
      stage: (params.get("stage")?.trim() ?? "") as "" | PartWorkbenchStage,
      seriesCode,
      itemKind,
      recordStatus,
      humanStatus: workStatusQuery.selection,
      includeHistory: workStatusQuery.includeHistory,
      sortDirection: params.get("sortDirection") === "desc" ? "desc" : DEFAULT_NUMBER_SORT_DIRECTION,
      lane
    },
    detailKey,
    legacyDetail: rawDetail && !rawDetail.includes(":") ? rawDetail : null,
    cursor: params.get("cursor"),
    pageIndex: Number(params.get("pageIndex") ?? "0") || 0
  };
}

function writeLocation(state: PdmWorkbenchLocationState<PartWorkbenchQueryState>, mode: "replace" | "push") {
  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.set("view", state.query.view);
  const setOptional = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
  setOptional("query", state.query.query.trim());
  setOptional("stage", state.query.stage);
  serializePdmWorkbenchFilterSelection(params, "seriesCode", state.query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "itemKind", state.query.itemKind);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", state.query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", state.query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", state.query.humanStatus);
  setOptional("sortDirection", state.query.sortDirection === DEFAULT_NUMBER_SORT_DIRECTION ? "" : state.query.sortDirection);
  state.query.includeHistory ? params.set("history", "include") : params.delete("history");
  const reviewRequestId = new URLSearchParams(window.location.search).get("reviewRequestId");
  reviewRequestId ? params.set("reviewRequestId", reviewRequestId) : params.delete("reviewRequestId");
  setOptional("detail", state.detailKey ?? "");
  setOptional("cursor", state.cursor ?? "");
  state.pageIndex && state.pageIndex > 0 ? params.set("pageIndex", String(state.pageIndex)) : params.delete("pageIndex");
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${window.location.pathname}?${params.toString()}`);
}

function buildListUrl(query: PartWorkbenchQueryState, cursor: string | null) {
  const params = new URLSearchParams({ view: query.view, limit: "50", history: query.includeHistory ? "include" : "exclude", sortDirection: query.sortDirection });
  if (query.query.trim()) params.set("query", query.query.trim());
  if (query.stage) params.set("stage", query.stage);
  serializePdmWorkbenchFilterSelection(params, "seriesCode", query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "itemKind", query.itemKind);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", query.humanStatus);
  if (cursor) params.set("cursor", cursor);
  return `/api/parts/workbench?${params.toString()}`;
}

function buildDetailUrl(rowKey: string, row?: PartWorkbenchRow) { const token = row?.lane?.reference.projectionToken; return `/api/parts/workbench/${encodeURIComponent(rowKey)}${token ? `?projectionToken=${encodeURIComponent(token)}` : ""}`; }
function getRowKey(row: PartWorkbenchRow) { return row.rowKey; }
function getDetailKey(detail: PartWorkbenchDetailResponse) { return detail.row.rowKey; }
function getCopyText(row: PartWorkbenchRow) { return row.displayCode; }
function normalizeList(value: unknown) { return value as PartWorkbenchListResponse; }
function normalizeDetail(value: unknown) { return value as PartWorkbenchDetailResponse; }
function initialLocation() { return readLocation(true); }
function currentLocation() { return readLocation(false); }
async function readApiBody<T>(response: Response) {
  return response.json().catch(() => ({})) as Promise<T & ApiBody>;
}

function errorMessage(body: ApiBody, fallback: string) {
  if (typeof body.error === "object" && body.error?.message) return body.error.message;
  return body.message?.trim() || (typeof body.error === "string" ? body.error : fallback);
}

function idempotencyKey(action: string) {
  return `dev062:part:${action}:${crypto.randomUUID()}`;
}

function shouldSkipUnifiedReviewDetail() {
  return Boolean(new URLSearchParams(window.location.search).get("reviewRequestId"));
}

function reviewReturnTo() {
  const value = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  return normalizePdmApprovalReturnTo(value);
}

export function PartWorkbench({ renderFormalDetail }: { renderFormalDetail: (props: PartFormalDetailRendererProps) => ReactNode }) {
  const router = useRouter();
  const redirectLogin = useCallback(() => {
    router.push(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [router]);
  const [feature, setFeature] = useState<FeatureStatus | null>(null);
  const unifiedEntityDetailEnabled = feature?.entityDetail?.enabled === true;
  const skipUnifiedReviewDetail = useCallback(() => shouldSkipUnifiedReviewDetail(), []);
  const controller = usePdmWorkbenchController<PartWorkbenchRow, PartWorkbenchDetailResponse, PartWorkbenchQueryState, PartWorkbenchListResponse["filters"]>({
    initialQuery,
    initialLocation,
    readLocation: currentLocation,
    writeLocation,
    buildListUrl,
    buildDetailUrl,
    getRowKey,
    normalizeResponse: normalizeList,
    normalizeDetail,
    detailRowKey: getDetailKey,
    detailHistoryMode: "push",
    paginationMode: "server-bidirectional",
    shouldSkipDetailFetch: skipUnifiedReviewDetail,
    listErrorMessage: "料號工作台目前無法載入，請重新整理。",
    detailErrorMessage: "這筆料號工作已不存在或目前無法查看。",
    onUnauthorized: redirectLogin
  });
  const {
    rows, filters, loading, detailLoading, error, setError, notice, setNotice,
    query, setQuery, selectedKey, setSelectedKey, detail, setDetail,
    nextCursor, previousCursor, pageIndex, loadRows, goNext, goPrevious, openDetail: openControllerDetail,
    closeDetail: closeControllerDetail
  } = controller;
  const [layout, setLayout] = useState<PdmWorkbenchLayout>("list");
  const [productionSlice, setProductionSlice] = useState<ProductionSliceStatus | null>(null);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  useEffect(() => { setReviewRequestId(new URLSearchParams(window.location.search).get("reviewRequestId")); }, []);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const listRef = useRef<HTMLDivElement>(null);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-part-detail-drawer-width" });
  const productionSliceEnforced = productionSlice?.configured === true;
  const unopenedMessage = productionSlice?.unopenedMessage ?? defaultUnopenedMessage;

  useEffect(() => {
    void fetch("/api/numbering/state-flow/status", { cache: "no-store" }).then((response) => response.json()).then((body) => setFeature(body as FeatureStatus)).catch(() => setFeature({}));
    void fetch("/api/production-slice/status", { cache: "no-store" }).then((response) => response.json()).then((body) => setProductionSlice(body as ProductionSliceStatus)).catch(() => setProductionSlice({}));
  }, []);

  const previewEnabled = feature?.previewGallery?.partEnabled === true;
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
    setLayout(readPartLayout(true));
  }, [previewEnabled, query]);
  const changeLayout = useCallback((next: PdmWorkbenchLayout) => {
    if (!previewEnabled) return;
    setLayout(next);
    window.localStorage.setItem(PART_LAYOUT_STORAGE_KEY, next);
    const params = new URLSearchParams(window.location.search);
    params.set("layout", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [previewEnabled]);

  const closeDetail = useCallback(() => {
    setEditing(false);
    setConfirmAction(null);
    closeControllerDetail();
  }, [closeControllerDetail]);

  const openDetail = useCallback(async (rowKey: string) => {
    const body = await openControllerDetail(rowKey);
    if (body?.row.stage === "history_only" && !query.includeHistory) {
      setQuery((current) => ({ ...current, includeHistory: true }));
      setNotice("此筆為歷史紀錄，已自動載入歷史資料。");
    }
    return body;
  }, [openControllerDetail, query.includeHistory, setNotice, setQuery]);

  const refresh = useCallback(async () => {
    await Promise.all([loadRows(), selectedKey ? openControllerDetail(selectedKey, "replace") : Promise.resolve(null)]);
  }, [loadRows, openControllerDetail, selectedKey]);

  const handleSelect = useCallback((row: PartWorkbenchRow, options: { openDetail: boolean }) => {
    setSelectedKey(row.rowKey);
    if (options.openDetail) void openDetail(row.rowKey);
  }, [openDetail, setSelectedKey]);
  const handleOpen = useCallback((row: PartWorkbenchRow) => { void openDetail(row.rowKey); }, [openDetail]);
  const keyboard = useListKeyboardShortcuts({
    items: rows,
    selectedKey,
    listRef,
    rowSelector: "[data-part-workbench-row]",
    getKey: getRowKey,
    getCopyText,
    onSelect: handleSelect,
    onOpenDetail: handleOpen,
    onCloseDetail: closeDetail,
    isDetailOpen: Boolean(detail) || detailLoading
  });

  const updateQuery = useCallback((patch: Partial<PartWorkbenchQueryState>) => setQuery((current) => ({ ...current, ...patch })), [setQuery]);

  const acceptWorkspace = useCallback((workspace: NumberingDraftWorkspace | CandidateRevisionWorkspace) => {
    const authoritativeWorkspace = workspace as unknown as NonNullable<PartWorkbenchDetailResponse["candidate"]>;
    setDetail((current) => current?.candidate ? { ...current, candidate: authoritativeWorkspace } : current);
  }, [setDetail]);

  const refreshWorkspace = useCallback(async (workspaceId: string) => {
    await Promise.all([loadRows(), openControllerDetail(`candidate:${workspaceId}`, "replace")]);
  }, [loadRows, openControllerDetail]);

  async function updateWorkspace(payload: Record<string, unknown>) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, expectedRowVersion: workspace.rowVersion })
    });
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setBusy(false);
    if (!response.ok || !body.workspace) {
      setError(errorMessage(body, "申請內容儲存失敗，請重新整理後再試。"));
      if (response.status === 409) await refreshWorkspace(workspace.id);
      return;
    }
    setEditing(false);
    setNotice("申請內容已更新。");
    acceptWorkspace(body.workspace);
    await refreshWorkspace(body.workspace.id);
  }

  async function runWorkspaceAction(action: WorkspaceAction) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    if (productionSliceEnforced && action !== "cancel") {
      setError(unopenedMessage);
      setConfirmAction(null);
      return;
    }
    const endpoint = ({ cancel: "cancel", submit: feature?.lifecycleV2?.enabled ? "submit-bundle-review" : "submit-review", withdraw: feature?.lifecycleV2?.enabled ? "withdraw-bundle-review" : "withdraw-review", publish: "publish" } as const)[action];
    const key = `${workspace.id}:${action}`;
    const requestKey = idempotencyKeys.current.get(key) ?? idempotencyKey(action);
    idempotencyKeys.current.set(key, requestKey);
    setBusy(true);
    setError("");
    let response: Response;
    try {
      response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          ...(feature?.lifecycleV2?.enabled && (action === "submit" || action === "withdraw") ? { expectedWorkspaceRowVersion: workspace.rowVersion } : { expectedRowVersion: workspace.rowVersion }),
          ...(action === "cancel" ? { reason: "user_cancelled_draft" } : {}),
          ...(action === "submit" ? { reason: feature?.lifecycleV2?.enabled ? "draft_owner_confirmed_candidate_bundle_review" : "draft_owner_confirmed_candidate_publication_review" } : {}),
          ...(action === "withdraw" && feature?.lifecycleV2?.enabled ? { reason: "draft_owner_withdrew_candidate_bundle_review" } : {})
        })
      });
    } catch {
      setBusy(false);
      setConfirmAction(null);
      setError("操作結果尚未確認；已重新讀取伺服器狀態，請確認後再決定下一步。");
      await refreshWorkspace(workspace.id).catch(() => undefined);
      return;
    }
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setBusy(false);
    setConfirmAction(null);
    if (!response.ok || !body.workspace) {
      setError(errorMessage(body, "操作未完成，請重新整理後再試。"));
      if (response.status !== 503) idempotencyKeys.current.delete(key);
      if (response.status === 409) await refreshWorkspace(workspace.id);
      return;
    }
    idempotencyKeys.current.delete(key);
    setNotice(({ cancel: "申請已取消。", submit: "整包內容已送交審核。", withdraw: "審核已撤回，可繼續補正。", publish: "圖料號已正式建立。" } as const)[action]);
    acceptWorkspace(body.workspace);
    if (action === "cancel" || action === "publish") closeDetail();
    await loadRows();
  }

  const seriesCodeOptions = filters?.seriesCodeOptions ?? [];
  const itemKindOptions = filters?.itemKindOptions ?? [];
  const recordStatusOptions = filters?.recordStatusOptions ?? PDM_WORKBENCH_RECORD_STATUS_VALUES;
  const seriesFilterOptions = seriesCodeOptions.map((option) => ({ value: option, label: option }));
  const itemKindFilterOptions = itemKindOptions.map((option) => ({ value: option, label: option }));
  const recordStatusFilterOptions = recordStatusOptions.map((option) => ({ value: option, label: formatStatusForUser(option, "masterRecord") }));
  const laneFilterOptions = [{ value: "production" as const, label: "量產最新版" }, { value: "rd" as const, label: "研發最新版" }];

  return (
    <>
      <div className="topbar pdm-workbench-topbar">
        <div><h1>料號工作台</h1><p>料號與流程狀態集中在同一清單，直接完成目前下一步。</p></div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCcw size={16} />重新整理</button>
          <NumberStateOwnerCreateAction surface="parts" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>
      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status"><span>{notice}</span><button className="icon-button" type="button" onClick={() => setNotice("")} aria-label="關閉通知"><X size={16} /></button></div> : null}
      {error ? <div className="number-state-message is-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void refresh()}>重新載入</button><button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤"><X size={16} /></button></div> : null}

      <section className="panel pdm-workbench-toolbar">
        <div className="drawing-workbench-filter-grid">
          <label className="drawing-workbench-search"><span>搜尋</span><div><Search size={16} /><input value={query.query} onChange={(event) => updateQuery({ query: event.target.value })} placeholder="料號、圖料根號、名稱、材質、顏色" /></div></label>
          <PdmWorkbenchMultiSelectFilter label="工作狀態" value={query.humanStatus} options={WORK_STATUS_MULTI_SELECT_OPTIONS} onApply={(value) => updateQuery({ humanStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="系列代號" value={query.seriesCode} options={seriesFilterOptions} searchable onApply={(value) => updateQuery({ seriesCode: value })} />
          <PdmWorkbenchMultiSelectFilter label="類型" value={query.itemKind} options={itemKindFilterOptions} onApply={(value) => updateQuery({ itemKind: value })} />
          <PdmWorkbenchMultiSelectFilter label="資料狀態" value={query.recordStatus} options={recordStatusFilterOptions} onApply={(value) => updateQuery({ recordStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="版本列" value={query.lane} options={laneFilterOptions} onApply={(value) => updateQuery({ lane: value })} />
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
            label="料號"
            direction={query.sortDirection}
            onToggle={() => updateQuery({ sortDirection: query.sortDirection === "asc" ? "desc" : "asc" })}
          />
        </div>
        {layout === "preview" && previewEnabled ? <PdmWorkbenchPreviewGallery
          rows={rows}
          selectedKey={selectedKey}
          ariaLabel="料號 3D 預覽圖"
          loading={loading}
          emptyState={<div className="empty"><PackageSearch size={24} /><strong>目前沒有符合條件的料號工作</strong><p>請調整搜尋或篩選條件，或建立新的料號工作。</p></div>}
          onSelect={(row) => setSelectedKey(row.rowKey)}
          onOpen={(row) => void openDetail(row.rowKey)}
          onCloseDetail={closeDetail}
          getSourceLabel={(row) => `代表圖 ${row.preview?.sourceDrawingNumber ?? "未指定"}`}
        /> : <PdmWorkbenchList
          rows={rows}
          getRowKey={getRowKey}
          selectedKey={selectedKey}
          ariaLabel="料號工作清單"
          rowDataAttribute="data-part-workbench-row"
          containerRef={listRef}
          onContainerKeyDown={keyboard.handleKeyDown}
          rowAriaKeyShortcuts={keyboard.shortcuts}
          loading={loading}
          loadingState={<div className="empty">正在載入料號工作...</div>}
          emptyState={<div className="empty"><PackageSearch size={24} /><strong>目前沒有符合條件的料號工作</strong><p>請調整搜尋或篩選條件，或建立新的料號工作。</p></div>}
          onOpenRow={(row) => void openDetail(row.rowKey)}
          getGroupKey={(row) => row.lane?.groupKey ?? row.rowKey}
          getGroupAriaLabel={(row) => row.lane ? `${row.displayCode} ${row.lane.laneLabel}` : row.displayCode}
          columns={[
            { key: "code", header: <NumberSortHeader label="料號" direction={query.sortDirection} onToggle={() => updateQuery({ sortDirection: query.sortDirection === "asc" ? "desc" : "asc" })} />, ariaSort: query.sortDirection === "asc" ? "ascending" : "descending", dataLabel: "料號", className: "pdm-identity-col-code", render: (row) => <button className="link-button pdm-identity-code" type="button" onClick={(event) => { event.stopPropagation(); void openDetail(row.rowKey); }}><SearchHighlight value={row.displayCode} query={query.query} />{row.additionalPartCount > 0 ? ` +${row.additionalPartCount}` : ""}{row.lane ? <span className={`pdm-workbench-lane-badge is-${row.lane.lane}`}>{row.lane.laneLabel}</span> : null}</button> },
            { key: "name", header: "品名", dataLabel: "品名", className: "pdm-identity-col-name", render: (row) => <div className="pdm-identity-name"><SearchHighlight value={row.displayName} query={query.query} /></div> },
            { key: "drawing", header: "圖號", dataLabel: "圖號", className: "pdm-identity-col-part", render: (row) => <div><span className="pdm-identity-code">{row.primaryDrawingNumber ?? "未關聯圖號"}</span>{row.drawingCount > 1 ? <small className="pdm-identity-subline">共 {row.drawingCount} 張圖號</small> : null}</div> },
            { key: "spacer", header: null, className: "pdm-identity-layout-spacer", cellClassName: "pdm-identity-layout-spacer", ariaHidden: true },
            { key: "status", header: "工作狀態", dataLabel: "工作狀態", className: "pdm-identity-col-meta", render: (row) => <div className="pdm-meta-strip"><HumanStatusBadge status={row.humanStatus} responsibilityStatus={row.responsibilityStatus} viewerActionability={row.viewerActionability} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} /></div> }
          ]}
        />}
        <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={goPrevious} onNext={goNext} />
      </section>

      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.candidate ? <WorkspaceReadonlyDrawer workspace={detail.candidate as NumberingDraftWorkspace} ownerHref={`/numbering/workspaces/${encodeURIComponent(detail.candidate.id)}?intent=view&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} width={drawerWidth} onStartResize={startDrawerResize} keepOpenSelector="[data-part-workbench-row='true']" presentation={{ entityLabel: "料號", title: detail.row.displayCode, sourceContext: "part_workbench" }} onClose={closeDetail} /> : null}
      {detail?.part && !unifiedEntityDetailEnabled ? <PdmEntityDetailDrawer
        open
        width={drawerWidth}
        ariaLabel="料號明細"
        title={detail.part.partNumber}
        subtitle={detail.part.partName}
        status={<HumanStatusBadge status={detail.row.humanStatus} responsibilityStatus={detail.row.responsibilityStatus} viewerActionability={detail.row.viewerActionability} viewerStatus={detail.row.viewerStatus} availabilityScope={detail.row.availabilityScope} />}
        entityType="part_number"
        entityCode={detail.part.partNumber}
        sourceContext="parts"
        resizeLabel="調整料號明細寬度"
        closeLabel="關閉料號明細"
        onClose={closeDetail}
        onStartResize={startDrawerResize}
        keepOpenSelector="[data-part-workbench-row='true']"
      ><div className="pdm-entity-drawer-body">{renderFormalDetail({ detail: detail.part, busy, productionSliceEnforced, productionSliceUnopenedMessage: unopenedMessage, setBusy, onUpdated: refresh })}</div></PdmEntityDetailDrawer> : null}
      {unifiedEntityDetailEnabled && selectedKey && detail && !detail.candidate ? <UnifiedPdmEntityDetailDrawer open entityKey={selectedKey.replace(/:(?:production|rd)$/u, "")} surface="part" reviewRequestId={reviewRequestId} width={drawerWidth} returnTo={reviewRequestId ? reviewReturnTo() : window.location.pathname + window.location.search} onStartResize={startDrawerResize} onClose={reviewRequestId ? () => router.push(reviewReturnTo()) : closeDetail} /> : null}
    </>
  );
}
