"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Grid2X2, ListTree, RefreshCcw, Search, X } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { HumanStatusFilterSelect } from "@/components/human-status-filter";
import { ConfirmDialog, NumberStateOwnerCreateAction, WorkspaceDrawer, type NumberingDraftWorkspace, type WorkspaceAction } from "@/components/number-state-workspace";
import type { CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { SearchHighlight } from "@/components/search-highlight";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import type { HumanStatusFilter, HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import { resolveNumberingSearchDetailTarget, type NumberingSearchDetailTarget } from "@/lib/numbering-search-target";
import type {
  ProjectedRelationRootDetail,
  RelationActiveChange,
  RelationMatrixCell,
  RelationWorkbenchDetailResponse,
  RelationWorkbenchListResponse,
  RelationWorkbenchRow,
  RelationWorkbenchView
} from "@/lib/relation-workbench";
import type { NumberingRecordStatus, NumberingSearchEntityType } from "@/lib/repositories/numbering-repository";

type RelationQueryState = {
  view: RelationWorkbenchView;
  query: string;
  seriesCode: string;
  entityType: NumberingSearchEntityType;
  recordStatus: "" | NumberingRecordStatus;
  humanStatus: HumanStatusFilter;
  includeHistory: boolean;
};
type RelationViewMode = "tree" | "matrix";
type ImpactAnalysis = {
  drawingNumber: { drawingNumber: string };
  applied: boolean;
  impactedPartNumbers: Array<{ id: string; partNumber: string; partName: string }>;
  requiredDocuments: string[];
  warnings: string[];
};
type OwnerHeaderProjection = {
  targetKey: string;
  entityType: "drawing_number" | "part_number";
  entityCode: string;
  name: string;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ProjectedRelationRootDetail["availabilityScope"];
};
export type RelationRootDetailRendererProps = {
  detail: ProjectedRelationRootDetail;
  detailTarget: NumberingSearchDetailTarget;
  activeChanges: RelationActiveChange[];
  onOpenChange: (change: RelationActiveChange) => void;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  width: number;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onRelationChange: (input: { operation: "link" | "set_primary" | "set_reference" | "remove"; drawingNumber: string; partNumber: string }) => Promise<void>;
  onChanged: () => Promise<void>;
  onCanonicalOwnerProjection: (projection: OwnerHeaderProjection) => void;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
  returnTo: string;
};

type FeatureStatus = { lifecycleV2?: { enabled?: boolean } };
type ProductionSliceStatus = { configured?: boolean; unopenedMessage?: string };
type ApiBody = { error?: string | { code?: string; message?: string }; message?: string };

const initialQuery: RelationQueryState = { view: "all", query: "", seriesCode: "", entityType: "all", recordStatus: "", humanStatus: "all", includeHistory: false };
const defaultUnopenedMessage = "此功能未納入本次正式領號 / 保留號 production slice。";

function readLocation(canonicalize = false): PdmWorkbenchLocationState<RelationQueryState> {
  const params = new URLSearchParams(window.location.search);
  const legacyReserved = params.get("tab") === "reserved";
  const rawView = params.get("view");
  const view: RelationWorkbenchView = legacyReserved || rawView === "work" ? "work" : rawView === "mine" ? "mine" : "all";
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detailKey = rawDetail ? rawDetail.includes(":") ? rawDetail : legacyReserved ? `candidate:${rawDetail}` : rawDetail : null;
  if (canonicalize) {
    params.delete("tab");
    params.set("view", view);
    if (detailKey && detailKey !== rawDetail) params.set("detail", detailKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  return {
    query: {
      view,
      query: params.get("query")?.trim() ?? "",
      seriesCode: params.get("seriesCode")?.trim() ?? "",
      entityType: (params.get("entityType")?.trim() ?? "all") as NumberingSearchEntityType,
      recordStatus: (params.get("recordStatus")?.trim() ?? "") as "" | NumberingRecordStatus,
      humanStatus: (params.get("humanStatus")?.trim() ?? "all") as HumanStatusFilter,
      includeHistory: params.get("history") === "include"
    },
    detailKey,
    legacyDetail: rawDetail && !rawDetail.includes(":") ? rawDetail : null
  };
}

function writeLocation(state: PdmWorkbenchLocationState<RelationQueryState>, mode: "replace" | "push") {
  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.set("view", state.query.view);
  const optional = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
  optional("query", state.query.query.trim());
  optional("seriesCode", state.query.seriesCode);
  optional("entityType", state.query.entityType === "all" ? "" : state.query.entityType);
  optional("recordStatus", state.query.recordStatus);
  optional("humanStatus", state.query.humanStatus === "all" ? "" : state.query.humanStatus);
  state.query.includeHistory ? params.set("history", "include") : params.delete("history");
  optional("detail", state.detailKey ?? "");
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${window.location.pathname}?${params.toString()}`);
}

function listUrl(query: RelationQueryState, cursor: string | null) {
  const params = new URLSearchParams({ projection: "workbench_v1", view: query.view, limit: "60", history: query.includeHistory ? "include" : "exclude", entityType: query.entityType });
  if (query.query.trim()) params.set("query", query.query.trim());
  if (query.seriesCode) params.set("seriesCode", query.seriesCode);
  if (query.recordStatus) params.set("recordStatus", query.recordStatus);
  if (query.humanStatus !== "all") params.set("humanStatus", query.humanStatus);
  if (cursor) params.set("cursor", cursor);
  return `/api/numbering/relations?${params.toString()}`;
}
function detailUrl(rowKey: string) { return `/api/numbering/relations/${encodeURIComponent(rowKey)}`; }
function rowKey(row: RelationWorkbenchRow) { return row.rowKey; }
function detailKey(detail: RelationWorkbenchDetailResponse) { return detail.row.rowKey; }
function copyText(row: RelationWorkbenchRow) { return row.displayCode; }
function normalizeList(value: unknown) { return value as RelationWorkbenchListResponse; }
function normalizeDetail(value: unknown) { return value as RelationWorkbenchDetailResponse; }
function initialLocation() { return readLocation(true); }
function currentLocation() { return readLocation(false); }
function redirectLogin() { window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); }
function newIdempotencyKey(action: string) { return `dev062:relation:${action}:${crypto.randomUUID()}`; }

async function readApi<T>(response: Response) { return response.json().catch(() => ({})) as Promise<T & ApiBody>; }
function apiError(body: ApiBody, fallback: string) { return typeof body.error === "object" && body.error?.message ? body.error.message : body.message?.trim() || (typeof body.error === "string" ? body.error : fallback); }

export function RelationWorkbench({ renderRootDetail }: { renderRootDetail: (props: RelationRootDetailRendererProps) => ReactNode }) {
  const controller = usePdmWorkbenchController<RelationWorkbenchRow, RelationWorkbenchDetailResponse, RelationQueryState, RelationWorkbenchListResponse["filters"]>({
    initialQuery, initialLocation, readLocation: currentLocation, writeLocation, buildListUrl: listUrl, buildDetailUrl: detailUrl,
    getRowKey: rowKey, normalizeResponse: normalizeList, normalizeDetail, detailRowKey: detailKey,
    detailHistoryMode: "push", listErrorMessage: "圖料工作台目前無法載入，請重新整理。", detailErrorMessage: "這筆圖料工作已不存在或目前無法查看。", onUnauthorized: redirectLogin
  });
  const {
    rows, filters, loading, detailLoading, error, setError, notice, setNotice,
    query, setQuery, selectedKey, setSelectedKey, detail, setDetail,
    nextCursor, pageIndex, loadRows, goNext, goPrevious,
    openDetail: openControllerDetail, closeDetail: closeControllerDetail
  } = controller;
  const [viewMode, setViewMode] = useState<RelationViewMode>("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailTarget, setDetailTarget] = useState<NumberingSearchDetailTarget | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [operationBusy, setOperationBusy] = useState<"search" | "detail" | "impact" | null>(null);
  const [feature, setFeature] = useState<FeatureStatus | null>(null);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceStatus | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const listRef = useRef<HTMLDivElement>(null);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-search-detail-drawer-width" });
  const productionSliceEnforced = productionSlice?.configured === true;
  const unopenedMessage = productionSlice?.unopenedMessage ?? defaultUnopenedMessage;

  useEffect(() => {
    if (!detail?.rootDetail) return;
    const rootCode = detail.rootDetail.root.rootCode;
    setDetailTarget((current) => current?.rootCode === rootCode
      ? current
      : { entityType: "part_root", rootCode });
  }, [detail?.rootDetail]);

  useEffect(() => {
    void fetch("/api/numbering/state-flow/status", { cache: "no-store" }).then((response) => response.json()).then((body) => setFeature(body as FeatureStatus)).catch(() => setFeature({}));
    void fetch("/api/production-slice/status", { cache: "no-store" }).then((response) => response.json()).then((body) => setProductionSlice(body as ProductionSliceStatus)).catch(() => setProductionSlice({}));
  }, []);

  const closeDetail = useCallback(() => {
    setEditing(false);
    setConfirmAction(null);
    setDetailTarget(null);
    setImpact(null);
    closeControllerDetail();
  }, [closeControllerDetail]);

  const openDetail = useCallback(async (key: string, target?: NumberingSearchDetailTarget) => {
    setOperationBusy("detail");
    const body = await openControllerDetail(key);
    setOperationBusy(null);
    if (body?.rootDetail) setDetailTarget(target ?? { entityType: "part_root", rootCode: body.rootDetail.root.rootCode });
    if (body?.row.stage === "history_only" && !query.includeHistory) {
      setQuery((current) => ({ ...current, includeHistory: true }));
      setNotice("此筆為歷史紀錄，已自動開啟「包含歷史」。");
    }
    return body;
  }, [openControllerDetail, query.includeHistory, setNotice, setQuery]);

  const openRootTarget = useCallback((row: RelationWorkbenchRow, target: NumberingSearchDetailTarget) => {
    void openDetail(row.rowKey, target);
  }, [openDetail]);

  const refresh = useCallback(async () => {
    await Promise.all([loadRows(), selectedKey ? openControllerDetail(selectedKey, "replace") : Promise.resolve(null)]);
  }, [loadRows, openControllerDetail, selectedKey]);

  const handleSelect = useCallback((row: RelationWorkbenchRow, options: { openDetail: boolean }) => {
    setSelectedKey(row.rowKey);
    if (options.openDetail) void openDetail(row.rowKey);
  }, [openDetail, setSelectedKey]);
  const handleOpen = useCallback((row: RelationWorkbenchRow) => { void openDetail(row.rowKey); }, [openDetail]);
  const keyboard = useListKeyboardShortcuts({ items: rows, selectedKey, listRef, rowSelector: "[data-relation-workbench-row]", getKey: rowKey, getCopyText: copyText, onSelect: handleSelect, onOpenDetail: handleOpen, onCloseDetail: closeDetail, isDetailOpen: Boolean(detail) || detailLoading });
  const updateQuery = useCallback((patch: Partial<RelationQueryState>) => setQuery((current) => ({ ...current, ...patch })), [setQuery]);

  const acceptWorkspace = useCallback((workspace: NumberingDraftWorkspace | CandidateRevisionWorkspace) => {
    const authoritative = workspace as unknown as NonNullable<RelationWorkbenchDetailResponse["candidate"]>;
    setDetail((current) => current?.candidate ? { ...current, candidate: authoritative } : current);
  }, [setDetail]);
  const refreshWorkspace = useCallback(async (workspaceId: string) => {
    await Promise.all([loadRows(), openControllerDetail(`candidate:${workspaceId}`, "replace")]);
  }, [loadRows, openControllerDetail]);

  async function updateWorkspace(payload: Record<string, unknown>) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    setWorkspaceBusy(true); setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, expectedRowVersion: workspace.rowVersion }) });
    const body = await readApi<{ workspace?: NumberingDraftWorkspace }>(response);
    setWorkspaceBusy(false);
    if (!response.ok || !body.workspace) { setError(apiError(body, "申請內容儲存失敗，請重新整理後再試。")); if (response.status === 409) await refreshWorkspace(workspace.id); return; }
    setEditing(false); setNotice("申請內容已更新。"); acceptWorkspace(body.workspace); await refreshWorkspace(body.workspace.id);
  }

  async function runWorkspaceAction(action: WorkspaceAction) {
    const workspace = detail?.candidate as NumberingDraftWorkspace | null;
    if (!workspace) return;
    if (productionSliceEnforced && action !== "cancel") { setError(unopenedMessage); setConfirmAction(null); return; }
    const endpoint = ({ cancel: "cancel", submit: feature?.lifecycleV2?.enabled ? "submit-bundle-review" : "submit-review", withdraw: feature?.lifecycleV2?.enabled ? "withdraw-bundle-review" : "withdraw-review", publish: "publish" } as const)[action];
    const mapKey = `${workspace.id}:${action}`;
    const requestKey = idempotencyKeys.current.get(mapKey) ?? newIdempotencyKey(action);
    idempotencyKeys.current.set(mapKey, requestKey);
    setWorkspaceBusy(true); setError("");
    let response: Response;
    try {
      response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
        method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          ...(feature?.lifecycleV2?.enabled && (action === "submit" || action === "withdraw") ? { expectedWorkspaceRowVersion: workspace.rowVersion } : { expectedRowVersion: workspace.rowVersion }),
          ...(action === "cancel" ? { reason: "user_cancelled_draft" } : {}),
          ...(action === "submit" ? { reason: feature?.lifecycleV2?.enabled ? "draft_owner_confirmed_candidate_bundle_review" : "draft_owner_confirmed_candidate_publication_review" } : {}),
          ...(action === "withdraw" && feature?.lifecycleV2?.enabled ? { reason: "draft_owner_withdrew_candidate_bundle_review" } : {})
        })
      });
    } catch {
      setWorkspaceBusy(false); setConfirmAction(null); setError("操作結果尚未確認；已重新讀取伺服器狀態，請確認後再決定下一步。"); await refreshWorkspace(workspace.id).catch(() => undefined); return;
    }
    const body = await readApi<{ workspace?: NumberingDraftWorkspace }>(response);
    setWorkspaceBusy(false); setConfirmAction(null);
    if (!response.ok || !body.workspace) { setError(apiError(body, "操作未完成，請重新整理後再試。")); if (response.status !== 503) idempotencyKeys.current.delete(mapKey); if (response.status === 409) await refreshWorkspace(workspace.id); return; }
    idempotencyKeys.current.delete(mapKey); setNotice(({ cancel: "申請已取消。", submit: "整包內容已送交審核。", withdraw: "審核已撤回，可繼續補正。", publish: "圖料號已正式建立。" } as const)[action]);
    acceptWorkspace(body.workspace); if (action === "cancel" || action === "publish") closeDetail(); await loadRows();
  }

  async function analyzeImpact(drawingNumber: string) {
    setOperationBusy("impact"); setError("");
    const response = await fetch("/api/numbering/impact-analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drawingNumber, applyInvalidation: false }) });
    const body = await readApi<ImpactAnalysis>(response); setOperationBusy(null);
    if (!response.ok) { setError(apiError(body, "製造圖作廢影響分析失敗。")); return; }
    setImpact(body);
  }

  async function maintainRelation(input: { operation: "link" | "set_primary" | "set_reference" | "remove"; drawingNumber: string; partNumber: string }) {
    setError("");
    const response = await fetch("/api/numbering/relations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body = await readApi<Record<string, unknown>>(response);
    if (!response.ok) throw new Error(apiError(body, "圖料關係維護失敗。"));
    await refresh();
  }

  const toggleExpanded = useCallback((key: string) => setExpanded((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; }), []);
  const seriesOptions = filters?.seriesCodeOptions ?? [];
  const recordOptions = filters?.recordStatusOptions ?? [];

  return (
    <>
      <div className="topbar"><div><h1>圖料工作台</h1><p>正式關係與進行中的變更集中在同一個主根視圖。</p></div><div className="number-state-owner-actions"><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCcw size={16} />重新整理</button><NumberStateOwnerCreateAction surface="search" seriesCodeOptions={seriesOptions} /></div></div>
      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status"><span>{notice}</span><button className="icon-button" type="button" onClick={() => setNotice("")} aria-label="關閉通知"><X size={16} /></button></div> : null}
      {error ? <div className="number-state-message is-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void refresh()}>重新載入</button><button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤"><X size={16} /></button></div> : null}
      <section className="panel drawing-workbench-toolbar">
        <div className="drawing-workbench-filter-grid">
          <label className="drawing-workbench-search"><span>搜尋</span><div><Search size={16} /><input value={query.query} onChange={(event) => updateQuery({ query: event.target.value })} placeholder="主根號、料號、圖號、名稱" /></div></label>
          <label><span>範圍</span><select value={query.view} onChange={(event) => updateQuery({ view: event.target.value as RelationWorkbenchView })}><option value="all">全部</option><option value="mine">我的待處理</option><option value="work">工作中</option></select></label>
          <label><span>工作狀態</span><HumanStatusFilterSelect value={query.humanStatus} onChange={(humanStatus) => updateQuery({ humanStatus })} /></label>
          <label><span>系列代號</span><select value={query.seriesCode} onChange={(event) => updateQuery({ seriesCode: event.target.value })}><option value="">全部系列</option>{seriesOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label><span>類型</span><select value={query.entityType} onChange={(event) => updateQuery({ entityType: event.target.value as NumberingSearchEntityType })}><option value="all">全部</option><option value="part_root">料件主根</option><option value="part_number">料號</option><option value="drawing_number">圖號</option></select></label>
          <label><span>資料狀態</span><select value={query.recordStatus} onChange={(event) => updateQuery({ recordStatus: event.target.value as "" | NumberingRecordStatus })}><option value="">全部狀態</option>{recordOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
        </div>
        <div className="pdm-relation-view-switch" role="tablist" aria-label="圖料關係顯示模式"><button className={viewMode === "tree" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "tree"} onClick={() => setViewMode("tree")}><ListTree size={16} />關係樹</button><button className={viewMode === "matrix" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "matrix"} onClick={() => setViewMode("matrix")}><Grid2X2 size={16} />矩陣</button></div>
        <label className="drawing-workbench-history-toggle"><input type="checkbox" checked={query.includeHistory} onChange={(event) => updateQuery({ includeHistory: event.target.checked })} /><span>包含歷史</span><small>顯示已取消、已作廢與已合併紀錄</small></label>
      </section>
      <section className="panel pdm-master-table-panel">
        {loading && rows.length === 0 ? <div className="empty">正在載入圖料工作...</div> : rows.length === 0 ? <div className="empty"><strong>目前沒有符合條件的圖料工作</strong><p>請調整搜尋或篩選條件，或建立新的圖料工作。</p></div> : (
          <div ref={listRef} className="pdm-relation-scroll" role="region" aria-label="圖料工作清單" tabIndex={0} onKeyDown={keyboard.handleKeyDown} aria-keyshortcuts={keyboard.shortcuts}>
            <div className="pdm-relation-list">{rows.map((row) => <RelationRowCard row={row} query={query.query} selected={row.rowKey === selectedKey} expanded={expanded.has(row.rowKey)} viewMode={viewMode} onToggle={() => toggleExpanded(row.rowKey)} onOpen={() => void openDetail(row.rowKey)} onOpenTarget={(target) => openRootTarget(row, target)} key={row.rowKey} />)}</div>
          </div>
        )}
        {(pageIndex > 0 || nextCursor) ? <div className="number-state-pagination"><button className="secondary-button" type="button" disabled={pageIndex === 0 || loading} onClick={goPrevious}><ChevronLeft size={16} />上一頁</button><span>第 {pageIndex + 1} 頁</span><button className="secondary-button" type="button" disabled={!nextCursor || loading} onClick={goNext}>下一頁<ChevronRight size={16} /></button></div> : null}
      </section>
      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.candidate ? <WorkspaceDrawer workspace={detail.candidate as NumberingDraftWorkspace} busy={workspaceBusy} editing={editing} onEdit={() => setEditing(true)} onCancelEdit={() => setEditing(false)} onUpdate={(payload) => void updateWorkspace(payload)} onSubmit={() => setConfirmAction("submit")} onWithdraw={() => setConfirmAction("withdraw")} onPublish={() => setConfirmAction("publish")} onCancel={() => setConfirmAction("cancel")} formalActionsUnopened={productionSliceEnforced} unopenedMessage={unopenedMessage} canCreateDrawingRevision={false} lifecycleV2Enabled={feature?.lifecycleV2?.enabled === true} onV2WorkspaceChange={acceptWorkspace} onV2Error={setError} onV2Notice={setNotice} seriesCodeOptions={seriesOptions} width={drawerWidth} onStartResize={startDrawerResize} keepOpenSelector="[data-relation-workbench-row='true']" presentation={{ entityLabel: "圖料變更", title: detail.row.displayCode, sourceContext: "relation_workbench", cancelLabel: "取消圖料變更", cancelTitle: "取消申請並釋出本次候選圖料號" }} onClose={closeDetail} /> : null}
      {detail?.candidate && confirmAction ? <ConfirmDialog action={confirmAction} workspace={detail.candidate as NumberingDraftWorkspace} busy={workspaceBusy} lifecycleV2Enabled={feature?.lifecycleV2?.enabled === true} onClose={() => setConfirmAction(null)} onConfirm={() => void runWorkspaceAction(confirmAction)} /> : null}
      {detail?.rootDetail && detailTarget ? renderRootDetail({ detail: detail.rootDetail, detailTarget, activeChanges: detail.row.activeChanges, onOpenChange: (change) => void openDetail(change.rowKey), impact, busy: operationBusy, width: drawerWidth, onAnalyzeImpact: (drawingNumber) => void analyzeImpact(drawingNumber), onRelationChange: maintainRelation, onChanged: refresh, onCanonicalOwnerProjection: () => undefined, onStartResize: startDrawerResize, onClose: closeDetail, returnTo: window.location.pathname + window.location.search }) : null}
    </>
  );
}

function RelationRowCard({ row, query, selected, expanded, viewMode, onToggle, onOpen, onOpenTarget }: {
  row: RelationWorkbenchRow; query: string; selected: boolean; expanded: boolean; viewMode: RelationViewMode;
  onToggle: () => void; onOpen: () => void; onOpenTarget: (target: NumberingSearchDetailTarget) => void;
}) {
  return (
    <article className={`pdm-relation-root${selected ? " selected" : ""}`} data-relation-workbench-row="true" data-search-row="true">
      <header className="pdm-relation-root-header pdm-relation-workbench-root-header">
        <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={expanded ? "收合關係" : "展開關係"}>{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
        <div className="pdm-relation-root-main">
          <button className="link-button pdm-identity-code" type="button" onClick={onOpen}><SearchHighlight value={row.displayCode} query={query} /></button>
          <strong className="pdm-identity-name"><SearchHighlight value={row.displayName} query={query} /></strong>
        </div>
        <div className="pdm-relation-root-meta">
          <HumanStatusBadge status={row.humanStatus} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />
          <span className={`pdm-relation-health ${row.relationshipHealth === "complete" ? "ok" : row.relationshipHealth === "blocked" ? "blocked" : row.relationshipHealth === "draft" ? "info" : "warning"}`}>{row.relationshipLabel}</span>
        </div>
      </header>
      {expanded ? <div className="pdm-relation-root-body">{viewMode === "tree" ? <RelationTree row={row} query={query} onOpenTarget={onOpenTarget} /> : <RelationMatrix row={row} query={query} onOpenTarget={onOpenTarget} />}{row.blockers.length > 0 ? <div className="pdm-relation-blocker-list">{row.blockers.map((blocker) => <span key={`${blocker.code}:${blocker.targetId ?? "root"}`}>{blocker.message}</span>)}</div> : null}</div> : null}
    </article>
  );
}

function RelationTree({ row, query, onOpenTarget }: { row: RelationWorkbenchRow; query: string; onOpenTarget: (target: NumberingSearchDetailTarget) => void }) {
  if (row.rowKind === "candidate_root") return <div className="pdm-relation-empty-line">候選關係尚不可作為正式製造依據；請開啟變更工作完成下一步。</div>;
  return (
    <div className="pdm-relation-tree">
      <section className="pdm-relation-tree-section">
        <strong className="pdm-relation-tree-label">圖號</strong>
        <div className="pdm-relation-drawing-list">
          {row.drawings.map((drawing) => (
            <button
              className={`pdm-relation-drawing-card ${drawing.isReferenceOnly ? "reference" : "manufacturing"}`}
              type="button"
              onClick={() => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: row.displayCode, drawingNumber: drawing.drawingNumber }))}
              key={drawing.id}
            >
              <span><SearchHighlight value={drawing.drawingNumber} query={query} /></span>
            </button>
          ))}
        </div>
      </section>
      <section className="pdm-relation-tree-section">
        <strong className="pdm-relation-tree-label">料號</strong>
        <div className="pdm-relation-part-list">
          {row.parts.map((part) => (
            <button
              className={`pdm-relation-part-chip${part.hasManufacturingDrawing ? "" : " missing"}`}
              type="button"
              onClick={() => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: row.displayCode, partNumber: part.partNumber }))}
              key={part.id}
            >
              <span><SearchHighlight value={part.partNumber} query={query} /></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function RelationMatrix({ row, query, onOpenTarget }: { row: RelationWorkbenchRow; query: string; onOpenTarget: (target: NumberingSearchDetailTarget) => void }) {
  if (row.drawings.length === 0 || row.parts.length === 0) return <div className="pdm-relation-empty-line">目前沒有可顯示的關係矩陣。</div>;
  const cellByPair = new Map(row.matrix.map((cell) => [`${cell.partNumber}:${cell.drawingNumber}`, cell]));
  return <div className="pdm-relation-matrix-wrap" role="region" aria-label={`${row.displayCode} 圖料關係矩陣`} tabIndex={0}><table className="pdm-relation-matrix"><thead><tr><th className="sticky-col">料號＼圖號</th>{row.drawings.map((drawing) => <th key={drawing.id}><button className="pdm-relation-matrix-identity" type="button" onClick={() => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: row.displayCode, drawingNumber: drawing.drawingNumber }))}><SearchHighlight value={drawing.drawingNumber} query={query} /></button></th>)}</tr></thead><tbody>{row.parts.map((part) => <tr key={part.id}><th className="sticky-col"><button className="pdm-relation-matrix-identity" type="button" onClick={() => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: row.displayCode, partNumber: part.partNumber }))}><SearchHighlight value={part.partNumber} query={query} /></button></th>{row.drawings.map((drawing) => { const cell = cellByPair.get(`${part.partNumber}:${drawing.drawingNumber}`); return <td key={drawing.id}><span className={`pdm-relation-cell is-${cell?.relationType ?? "not_applicable"}`}>{cellLabel(cell)}</span></td>; })}</tr>)}</tbody></table></div>;
}

function cellLabel(cell: RelationMatrixCell | undefined) {
  if (!cell || cell.relationType === "not_applicable") return "—";
  if (cell.relationType === "manufacturing_basis") return "製造";
  if (cell.relationType === "reference") return "參考";
  if (cell.relationType === "required_missing") return "缺必要";
  if (cell.relationType === "blocked") return "阻擋";
  return "待判定";
}
