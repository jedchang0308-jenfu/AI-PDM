"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Grid2X2, ListTree, RefreshCcw, Search, X } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { NumberStateOwnerCreateAction, WorkspaceReadonlyDrawer, type NumberingDraftWorkspace, type WorkspaceAction } from "@/components/number-state-workspace";
import type { CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { UnifiedPdmEntityDetailDrawer } from "@/components/unified-pdm-entity-detail-drawer";
import { SearchHighlight } from "@/components/search-highlight";
import { RelationMatrixTable } from "@/components/relation-matrix-table";
import { NumberSortHeader } from "@/components/number-sort-header";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { usePdmWorkbenchController, type PdmWorkbenchLocationState } from "@/components/use-pdm-workbench-controller";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import { parseWorkStatusSelection, WORK_STATUS_MULTI_SELECT_OPTIONS, type WorkStatusFilter } from "@/lib/work-status-presentation";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import { resolveNumberingSearchDetailTarget, type NumberingSearchDetailTarget } from "@/lib/numbering-search-target";
import type {
  ProjectedRelationRootDetail,
  RelationActiveChange,
  RelationWorkbenchDetailResponse,
  RelationWorkbenchListResponse,
  RelationWorkbenchRow,
  RelationWorkbenchView
} from "@/lib/relation-workbench";
import { RELATION_WORKBENCH_ENTITY_TYPE_VALUES } from "@/lib/pdm-workbench-filter-options";
import { PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import type { NumberingRecordStatus, NumberingSearchEntityType } from "@/lib/repositories/numbering-repository";
import { DEFAULT_NUMBER_SORT_DIRECTION, type NumberSortDirection } from "@/lib/number-sort";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { formatStatusForUser } from "@/lib/status-display";

type RelationQueryState = {
  view: RelationWorkbenchView;
  query: string;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  entityType: PdmWorkbenchFilterSelection<NumberingSearchEntityType>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  humanStatus: PdmWorkbenchFilterSelection<WorkStatusFilter>;
  includeHistory: boolean;
  sortDirection: NumberSortDirection;
  lane: PdmWorkbenchFilterSelection<"production" | "rd">;
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

type FeatureStatus = { lifecycleV2?: { enabled?: boolean }; entityDetail?: { enabled?: boolean } };
type ProductionSliceStatus = { configured?: boolean; unopenedMessage?: string };
type ApiBody = { error?: string | { code?: string; message?: string }; message?: string };

const initialQuery: RelationQueryState = { view: "all", query: "", seriesCode: { mode: "all" }, entityType: { mode: "all" }, recordStatus: { mode: "all" }, humanStatus: { mode: "all" }, includeHistory: false, sortDirection: DEFAULT_NUMBER_SORT_DIRECTION, lane: { mode: "all" } };
const defaultUnopenedMessage = "此功能未納入本次編號建立 production slice。";

function readLocation(canonicalize = false): PdmWorkbenchLocationState<RelationQueryState> {
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
  const view: RelationWorkbenchView = workStatusQuery.view === "work" ? "work" : workStatusQuery.view === "mine" ? "mine" : "all";
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detailKey = rawDetail ? rawDetail.includes(":") ? rawDetail : legacyReserved ? `candidate:${rawDetail}` : rawDetail : null;
  const seriesCode = parsePdmWorkbenchFilterSelectionForBrowser(params, "seriesCode", { maxValueLength: 80 });
  const entityType = parsePdmWorkbenchFilterSelectionForBrowser<NumberingSearchEntityType>(params, "entityType", { allowedValues: RELATION_WORKBENCH_ENTITY_TYPE_VALUES, maxValueLength: 30 });
  const recordStatus = parsePdmWorkbenchFilterSelectionForBrowser<NumberingRecordStatus>(params, "recordStatus", { allowedValues: PDM_WORKBENCH_RECORD_STATUS_VALUES, maxValueLength: 40 });
  const lane = parsePdmWorkbenchFilterSelectionForBrowser<"production" | "rd">(params, "lane", { allowedValues: ["production", "rd"] });
  if (canonicalize) {
    params.delete("tab");
    params.set("view", view);
    workStatusQuery.includeHistory ? params.set("history", "include") : params.delete("history");
    serializePdmWorkbenchFilterSelection(params, "humanStatus", workStatusQuery.selection);
    serializePdmWorkbenchFilterSelection(params, "seriesCode", seriesCode);
    serializePdmWorkbenchFilterSelection(params, "entityType", entityType);
    serializePdmWorkbenchFilterSelection(params, "recordStatus", recordStatus);
    serializePdmWorkbenchFilterSelection(params, "lane", lane);
    if (detailKey && detailKey !== rawDetail) params.set("detail", detailKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  return {
    query: {
      view,
      query: params.get("query")?.trim() ?? "",
      seriesCode,
      entityType,
      recordStatus,
      lane,
      humanStatus: workStatusQuery.selection,
      includeHistory: workStatusQuery.includeHistory,
      sortDirection: params.get("sortDirection") === "desc" ? "desc" : DEFAULT_NUMBER_SORT_DIRECTION
    },
    detailKey,
    legacyDetail: rawDetail && !rawDetail.includes(":") ? rawDetail : null,
    cursor: params.get("cursor"),
    pageIndex: Number(params.get("pageIndex") ?? "0") || 0
  };
}

function writeLocation(state: PdmWorkbenchLocationState<RelationQueryState>, mode: "replace" | "push") {
  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.set("view", state.query.view);
  const optional = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
  optional("query", state.query.query.trim());
  serializePdmWorkbenchFilterSelection(params, "seriesCode", state.query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "entityType", state.query.entityType);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", state.query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", state.query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", state.query.humanStatus);
  optional("sortDirection", state.query.sortDirection === DEFAULT_NUMBER_SORT_DIRECTION ? "" : state.query.sortDirection);
  state.query.includeHistory ? params.set("history", "include") : params.delete("history");
  const reviewRequestId = new URLSearchParams(window.location.search).get("reviewRequestId");
  reviewRequestId ? params.set("reviewRequestId", reviewRequestId) : params.delete("reviewRequestId");
  optional("detail", state.detailKey ?? "");
  optional("cursor", state.cursor ?? "");
  state.pageIndex && state.pageIndex > 0 ? params.set("pageIndex", String(state.pageIndex)) : params.delete("pageIndex");
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${window.location.pathname}?${params.toString()}`);
}

function listUrl(query: RelationQueryState, cursor: string | null) {
  const params = new URLSearchParams({ projection: "workbench_v1", view: query.view, limit: "60", history: query.includeHistory ? "include" : "exclude" });
  params.set("sortDirection", query.sortDirection);
  if (query.query.trim()) params.set("query", query.query.trim());
  serializePdmWorkbenchFilterSelection(params, "seriesCode", query.seriesCode);
  serializePdmWorkbenchFilterSelection(params, "entityType", query.entityType);
  serializePdmWorkbenchFilterSelection(params, "recordStatus", query.recordStatus);
  serializePdmWorkbenchFilterSelection(params, "lane", query.lane);
  serializePdmWorkbenchFilterSelection(params, "humanStatus", query.humanStatus);
  if (cursor) params.set("cursor", cursor);
  return `/api/numbering/relations?${params.toString()}`;
}
function detailUrl(rowKey: string, row?: RelationWorkbenchRow) { const token = row?.lane?.reference.projectionToken; return `/api/numbering/relations/${encodeURIComponent(rowKey)}${token ? `?projectionToken=${encodeURIComponent(token)}` : ""}`; }
function rowKey(row: RelationWorkbenchRow) { return row.rowKey; }
function detailKey(detail: RelationWorkbenchDetailResponse) { return detail.row.rowKey; }
function copyText(row: RelationWorkbenchRow) { return row.displayCode; }
function normalizeList(value: unknown) { return value as RelationWorkbenchListResponse; }
function normalizeDetail(value: unknown) { return value as RelationWorkbenchDetailResponse; }
function initialLocation() { return readLocation(true); }
function currentLocation() { return readLocation(false); }
function newIdempotencyKey(action: string) { return `dev062:relation:${action}:${crypto.randomUUID()}`; }
function shouldSkipUnifiedReviewDetail() { return Boolean(new URLSearchParams(window.location.search).get("reviewRequestId")); }
function reviewReturnTo() { const value = new URLSearchParams(window.location.search).get("returnTo") ?? ""; return normalizePdmApprovalReturnTo(value); }

function relationEntityKeyForTarget(row: RelationWorkbenchRow, target: NumberingSearchDetailTarget) {
  if (target.entityType === "drawing_number") {
    const drawing = row.drawings.find((item) => item.drawingNumber === target.drawingNumber);
    return drawing ? `drawing:${drawing.id}` : row.rowKey;
  }
  if (target.entityType === "part_number") {
    const part = row.parts.find((item) => item.partNumber === target.partNumber);
    return part ? `part:${part.id}` : row.rowKey;
  }
  return row.rowKey;
}

async function readApi<T>(response: Response) { return response.json().catch(() => ({})) as Promise<T & ApiBody>; }
function apiError(body: ApiBody, fallback: string) { return typeof body.error === "object" && body.error?.message ? body.error.message : body.message?.trim() || (typeof body.error === "string" ? body.error : fallback); }

export function RelationWorkbench({ renderRootDetail }: { renderRootDetail: (props: RelationRootDetailRendererProps) => ReactNode }) {
  const router = useRouter();
  const redirectLogin = useCallback(() => {
    router.push(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [router]);
  const [feature, setFeature] = useState<FeatureStatus | null>(null);
  const unifiedEntityDetailEnabled = feature?.entityDetail?.enabled === true;
  const skipUnifiedReviewDetail = useCallback(() => shouldSkipUnifiedReviewDetail(), []);
  const controller = usePdmWorkbenchController<RelationWorkbenchRow, RelationWorkbenchDetailResponse, RelationQueryState, RelationWorkbenchListResponse["filters"]>({
    initialQuery, initialLocation, readLocation: currentLocation, writeLocation, buildListUrl: listUrl, buildDetailUrl: detailUrl,
    getRowKey: rowKey, normalizeResponse: normalizeList, normalizeDetail, detailRowKey: detailKey,
    detailHistoryMode: "push", paginationMode: "server-bidirectional", shouldSkipDetailFetch: skipUnifiedReviewDetail, listErrorMessage: "圖料工作台目前無法載入，請重新整理。", detailErrorMessage: "這筆圖料工作已不存在或目前無法查看。", onUnauthorized: redirectLogin
  });
  const {
    rows, filters, loading, detailLoading, error, setError, notice, setNotice,
    query, setQuery, selectedKey, setSelectedKey, detail, setDetail,
    nextCursor, previousCursor, pageIndex, loadRows, goNext, goPrevious,
    openDetail: openControllerDetail, closeDetail: closeControllerDetail
  } = controller;
  const [viewMode, setViewMode] = useState<RelationViewMode>("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailTarget, setDetailTarget] = useState<NumberingSearchDetailTarget | null>(null);
  const [detailEntityKey, setDetailEntityKey] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [operationBusy, setOperationBusy] = useState<"search" | "detail" | "impact" | null>(null);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceStatus | null>(null);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  useEffect(() => { setReviewRequestId(new URLSearchParams(window.location.search).get("reviewRequestId")); }, []);
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
    setDetailEntityKey(null);
    setImpact(null);
    closeControllerDetail();
  }, [closeControllerDetail]);

  const openDetail = useCallback(async (key: string, target?: NumberingSearchDetailTarget, entityKey = key) => {
    setDetailTarget(target ?? null);
    setDetailEntityKey(entityKey);
    setOperationBusy("detail");
    const body = await openControllerDetail(key);
    setOperationBusy(null);
    if (body?.rootDetail) setDetailTarget(target ?? { entityType: "part_root", rootCode: body.rootDetail.root.rootCode });
    if (body?.row.stage === "history_only" && !query.includeHistory) {
      setQuery((current) => ({ ...current, includeHistory: true }));
      setNotice("此筆為歷史紀錄，已自動載入歷史資料。");
    }
    return body;
  }, [openControllerDetail, query.includeHistory, setNotice, setQuery]);

  const openRootTarget = useCallback((row: RelationWorkbenchRow, target: NumberingSearchDetailTarget) => {
    void openDetail(row.rowKey, target, relationEntityKeyForTarget(row, target));
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
  const recordOptions = filters?.recordStatusOptions ?? PDM_WORKBENCH_RECORD_STATUS_VALUES;
  const seriesFilterOptions = seriesOptions.map((option) => ({ value: option, label: option }));
  const entityFilterOptions = RELATION_WORKBENCH_ENTITY_TYPE_VALUES.map((value) => ({ value, label: value === "part_root" ? "圖料根號" : value === "part_number" ? "料號" : "圖號" }));
  const recordStatusFilterOptions = recordOptions.map((option) => ({ value: option, label: formatStatusForUser(option, "masterRecord") }));
  const laneFilterOptions = [{ value: "production" as const, label: "量產最新版" }, { value: "rd" as const, label: "研發最新版" }];
  const unifiedContextualActions = (() => {
    const rootDetail = detail?.rootDetail;
    if (!unifiedEntityDetailEnabled || !rootDetail || !detailTarget || reviewRequestId) return null;
    const root = rootDetail.root;
    if (detailTarget.entityType === "part_number") {
      const part = rootDetail.partNumbers.find((item) => item.partNumber === detailTarget.partNumber);
      if (!part) return null;
      const links = rootDetail.links.filter((link) => link.partNumberId === part.id);
      return <NumberingContextualEntrypoints mode="part" rootId={root.id} rootCode={root.rootCode} coreName={root.coreName} rootRecordStatus={root.recordStatus} part={{ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus, linkedDrawingNumbers: links.map((link) => link.drawingNumber) }} actionEmphasis="secondary" onChanged={refresh} />;
    }
    if (detailTarget.entityType === "drawing_number") {
      const drawing = rootDetail.drawingNumbers.find((item) => item.drawingNumber === detailTarget.drawingNumber);
      if (!drawing) return null;
      const links = rootDetail.links.filter((link) => link.drawingNumberId === drawing.id);
      return <NumberingContextualEntrypoints mode="drawing" rootId={root.id} rootCode={root.rootCode} coreName={root.coreName} rootRecordStatus={root.recordStatus} drawing={{ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus, linkedPartNumbers: links.map((link) => link.partNumber) }} actionEmphasis="secondary" onChanged={refresh} />;
    }
    const formalChildCount = [...rootDetail.partNumbers, ...rootDetail.drawingNumbers].filter((record) => ["Active", "Released", "MainDrawingInvalid"].includes(record.recordStatus)).length;
    return <NumberingContextualEntrypoints mode="root" rootId={root.id} rootCode={root.rootCode} coreName={root.coreName} rootRecordStatus={root.recordStatus} rootFormalChildCount={formalChildCount} rootPartCount={rootDetail.summary.partCount} rootDrawingCount={rootDetail.summary.drawingCount} actionEmphasis="secondary" onChanged={refresh} />;
  })();

  return (
    <>
      <div className="topbar pdm-workbench-topbar"><div><h1>圖料工作台</h1><p>正式關係與進行中的變更集中在同一個圖料根號視圖。</p></div><div className="number-state-owner-actions"><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCcw size={16} />重新整理</button><NumberStateOwnerCreateAction surface="search" seriesCodeOptions={seriesOptions} /></div></div>
      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status"><span>{notice}</span><button className="icon-button" type="button" onClick={() => setNotice("")} aria-label="關閉通知"><X size={16} /></button></div> : null}
      {error ? <div className="number-state-message is-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void refresh()}>重新載入</button><button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤"><X size={16} /></button></div> : null}
      <section className="panel pdm-workbench-toolbar">
        <div className="drawing-workbench-filter-grid">
          <label className="drawing-workbench-search"><span>搜尋</span><div><Search size={16} /><input value={query.query} onChange={(event) => updateQuery({ query: event.target.value })} placeholder="圖料根號、料號、圖號、名稱" /></div></label>
          <PdmWorkbenchMultiSelectFilter label="工作狀態" value={query.humanStatus} options={WORK_STATUS_MULTI_SELECT_OPTIONS} onApply={(value) => updateQuery({ humanStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="系列代號" value={query.seriesCode} options={seriesFilterOptions} searchable onApply={(value) => updateQuery({ seriesCode: value })} />
          <PdmWorkbenchMultiSelectFilter label="類型" value={query.entityType} options={entityFilterOptions} onApply={(value) => updateQuery({ entityType: value })} />
          <PdmWorkbenchMultiSelectFilter label="資料狀態" value={query.recordStatus} options={recordStatusFilterOptions} onApply={(value) => updateQuery({ recordStatus: value })} />
          <PdmWorkbenchMultiSelectFilter label="版本列" value={query.lane} options={laneFilterOptions} onApply={(value) => updateQuery({ lane: value })} />
        </div>
        <div className="pdm-workbench-toolbar-footer">
          <div className="pdm-workbench-toolbar-view-actions">
            <div className="pdm-relation-view-switch" role="tablist" aria-label="圖料關係顯示模式"><button className={viewMode === "tree" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "tree"} onClick={() => setViewMode("tree")}><ListTree size={16} aria-hidden="true" />關係樹</button><button className={viewMode === "matrix" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "matrix"} onClick={() => setViewMode("matrix")}><Grid2X2 size={16} aria-hidden="true" />矩陣</button></div>
          </div>
        </div>
      </section>
      <section className="panel pdm-master-table-panel">
        {loading && rows.length === 0 ? <div className="empty">正在載入圖料工作...</div> : rows.length === 0 ? <div className="empty"><strong>目前沒有符合條件的圖料工作</strong><p>請調整搜尋或篩選條件，或建立新的圖料工作。</p></div> : (
          <>
            <div className="pdm-relation-list-header" role="row">
              <div role="columnheader"><NumberSortHeader label="編號" direction={query.sortDirection} onToggle={() => updateQuery({ sortDirection: query.sortDirection === "asc" ? "desc" : "asc" })} /></div>
              <span>品名</span>
              <span>工作狀態</span>
            </div>
            <div ref={listRef} className="pdm-relation-scroll" role="region" aria-label="圖料工作清單" tabIndex={0} onKeyDown={keyboard.handleKeyDown} aria-keyshortcuts={keyboard.shortcuts}>
              <div className="pdm-relation-list">{[...new Map(rows.map((row) => [row.lane?.groupKey ?? row.rowKey, rows.filter((candidate) => (candidate.lane?.groupKey ?? candidate.rowKey) === (row.lane?.groupKey ?? row.rowKey))])).values()].map((group, index) => <div role="rowgroup" aria-label={group[0]?.lane ? `${group[0].displayCode} ${group[0].lane.laneLabel}` : undefined} key={String(index)}>{group.map((row) => <RelationRowCard row={row} query={query.query} selected={row.rowKey === selectedKey} expanded={expanded.has(row.rowKey)} viewMode={viewMode} onToggle={() => toggleExpanded(row.rowKey)} onOpen={() => void openDetail(row.rowKey)} onOpenChange={(change) => void openDetail(change.rowKey)} onOpenTarget={(target) => openRootTarget(row, target)} key={row.rowKey} />)}</div>)}</div>
            </div>
          </>
        )}
        <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={goPrevious} onNext={goNext} />
      </section>
      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.candidate ? <WorkspaceReadonlyDrawer workspace={detail.candidate as NumberingDraftWorkspace} ownerHref={`/numbering/workspaces/${encodeURIComponent(detail.candidate.id)}?intent=view&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} width={drawerWidth} onStartResize={startDrawerResize} keepOpenSelector="[data-relation-workbench-row='true']" presentation={{ entityLabel: "圖料變更", title: detail.row.displayCode, sourceContext: "relation_workbench" }} onClose={closeDetail} /> : null}
      {detail?.rootDetail && detailTarget && !unifiedEntityDetailEnabled ? renderRootDetail({ detail: detail.rootDetail, detailTarget, activeChanges: detail.row.activeChanges, onOpenChange: (change) => void openDetail(change.rowKey), impact, busy: operationBusy, width: drawerWidth, onAnalyzeImpact: (drawingNumber) => void analyzeImpact(drawingNumber), onRelationChange: maintainRelation, onChanged: refresh, onCanonicalOwnerProjection: () => undefined, onStartResize: startDrawerResize, onClose: closeDetail, returnTo: window.location.pathname + window.location.search }) : null}
      {unifiedEntityDetailEnabled && selectedKey && detail && !detail.candidate && (detailEntityKey || detail.rootDetail) ? <UnifiedPdmEntityDetailDrawer open entityKey={(detailEntityKey ?? (detail.rootDetail ? `root:${detail.rootDetail.root.id}` : selectedKey)).replace(/:(?:production|rd)$/u, "")} surface="relation" reviewRequestId={reviewRequestId} width={drawerWidth} returnTo={reviewRequestId ? reviewReturnTo() : window.location.pathname + window.location.search} onStartResize={startDrawerResize} onClose={reviewRequestId ? () => router.push(reviewReturnTo()) : closeDetail} /> : null}
    </>
  );
}

function RelationRowCard({ row, query, selected, expanded, viewMode, onToggle, onOpen, onOpenChange, onOpenTarget }: {
  row: RelationWorkbenchRow; query: string; selected: boolean; expanded: boolean; viewMode: RelationViewMode;
  onToggle: () => void; onOpen: () => void; onOpenChange: (change: RelationActiveChange) => void; onOpenTarget: (target: NumberingSearchDetailTarget) => void;
}) {
  const visibleBlockers = row.blockers.filter((blocker) => blocker.code !== "drawing_without_part");
  return (
    <article
      className={`pdm-relation-root${selected ? " selected" : ""}`}
      data-relation-workbench-row="true"
      data-search-row="true"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        onOpen();
      }}
    >
      <header className="pdm-relation-root-header pdm-relation-workbench-root-header">
        <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={expanded ? "收合關係" : "展開關係"}>{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
        <div className="pdm-relation-root-main">
          <button className="link-button pdm-identity-code" type="button" onClick={onOpen}><SearchHighlight value={row.displayCode} query={query} /></button>
          <strong className="pdm-identity-name"><SearchHighlight value={row.displayName} query={query} />{row.lane ? <span className={`pdm-workbench-lane-badge is-${row.lane.lane}`}>{row.lane.laneLabel}</span> : null}</strong>
        </div>
        <div className="pdm-relation-root-meta">
          <HumanStatusBadge
            status={row.humanStatus}
            responsibilityStatus={row.responsibilityStatus}
            viewerActionability={row.viewerActionability}
            viewerStatus={row.viewerStatus}
            availabilityScope={row.availabilityScope}
            exceptionSignals={row.relationshipHealth === "complete" ? [] : [{
              id: `${row.rowKey}:relationship`,
              context: "readinessStatus",
              raw: row.relationshipHealth === "blocked" ? "Blocked" : "Incomplete",
              isPrimaryAxis: false,
              affectsCurrentAction: row.relationshipHealth === "blocked",
              missingRequired: row.relationshipHealth === "blocked",
              label: row.relationshipLabel,
              description: row.blockers.length > 0 ? row.blockers.map((blocker) => blocker.message).join("；") : "關聯資料尚未完全收斂。"
            }]}
          />
        </div>
      </header>
      {expanded ? <div className="pdm-relation-root-body">{viewMode === "tree" ? <RelationTree row={row} query={query} onOpenChange={onOpenChange} onOpenTarget={onOpenTarget} /> : <RelationMatrix row={row} query={query} onOpenTarget={onOpenTarget} />}{visibleBlockers.length > 0 ? <div className="pdm-relation-blocker-list">{visibleBlockers.map((blocker) => <span key={`${blocker.code}:${blocker.targetId ?? "root"}`}>{blocker.message}</span>)}</div> : null}</div> : null}
    </article>
  );
}

function RelationTree({ row, query, onOpenChange, onOpenTarget }: { row: RelationWorkbenchRow; query: string; onOpenChange: (change: RelationActiveChange) => void; onOpenTarget: (target: NumberingSearchDetailTarget) => void }) {
  const linkedPartNumbers = new Set(row.drawings.flatMap((drawing) => drawing.linkedPartNumbers));
  const orphanParts = row.parts.filter((part) => !linkedPartNumbers.has(part.partNumber));
  const candidateChange = row.rowKind === "candidate_root" ? row.activeChanges[0] : null;
  const openDrawing = (drawingNumber: string) => candidateChange
    ? onOpenChange(candidateChange)
    : onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: row.displayCode, drawingNumber }));
  const openPart = (partNumber: string) => candidateChange
    ? onOpenChange(candidateChange)
    : onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: row.displayCode, partNumber }));
  if (row.drawings.length === 0 && row.parts.length === 0) {
    return <div className="pdm-relation-empty-line">尚未建立可顯示的圖號或料號。</div>;
  }
  return (
    <div className="pdm-relation-tree">
      {row.rowKind === "formal_root" && row.activeChanges.length > 0 ? (
        <section className="pdm-relation-tree-section pdm-relation-change-section" aria-label={`${row.displayCode} 圖料變更與歷史紀錄`}>
          <strong className="pdm-relation-tree-label">變更</strong>
          <div className="pdm-relation-change-list">
            {row.activeChanges.map((change) => {
              const codes = [...change.drawingCodes, ...change.partCodes];
              const codeLabel = codes.length > 0 ? codes.join("、") : change.displayCode;
              return (
                <button className={`pdm-relation-change-card${change.stage === "history_only" ? " history" : ""}`} type="button" onClick={() => onOpenChange(change)} key={change.workspaceId}>
                  <span><SearchHighlight value={codeLabel} query={query} /></span>
                  <small>{change.stageLabel}</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      <section className="pdm-relation-tree-section pdm-relation-tree-section-unlabeled">
        <div className="pdm-relation-drawing-list">
          {row.drawings.map((drawing) => {
            const linkedParts = row.parts.filter((part) => drawing.linkedPartNumbers.includes(part.partNumber));
            return (
              <div className={`pdm-relation-drawing-group ${drawing.isReferenceOnly ? "reference" : "manufacturing"}`} key={drawing.id}>
                <button
                  className={`pdm-relation-drawing-card ${drawing.isReferenceOnly ? "reference" : "manufacturing"}`}
                  type="button"
                  onClick={() => openDrawing(drawing.drawingNumber)}
                >
                  <span><SearchHighlight value={drawing.drawingNumber} query={query} /></span>
                </button>
                {linkedParts.length > 0 ? (
                  <div className="pdm-relation-drawing-children" aria-label={`${drawing.drawingNumber} 關聯料號`}>
                    {linkedParts.map((part) => (
                      <button
                        className={`pdm-relation-part-chip${part.hasManufacturingDrawing ? "" : " missing"}${part.hasMasterDataGap ? " pdm-missing-field" : ""}`}
                        type="button"
                        onClick={() => openPart(part.partNumber)}
                        key={part.id}
                      >
                        <span><SearchHighlight value={part.partNumber} query={query} /></span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      {orphanParts.length > 0 ? (
        <section className="pdm-relation-tree-section pdm-relation-orphan-section">
          <strong className="pdm-relation-tree-label">料號</strong>
          <div className="pdm-relation-part-list">
            {orphanParts.map((part) => (
              <button
                className={`pdm-relation-part-chip${part.hasManufacturingDrawing ? "" : " missing"}${part.hasMasterDataGap ? " pdm-missing-field" : ""}`}
                type="button"
                onClick={() => openPart(part.partNumber)}
                key={part.id}
              >
                <span><SearchHighlight value={part.partNumber} query={query} /></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RelationMatrix({ row, query, onOpenTarget }: { row: RelationWorkbenchRow; query: string; onOpenTarget: (target: NumberingSearchDetailTarget) => void }) {
  return <RelationMatrixTable
    rootCode={row.displayCode}
    drawings={row.drawings.map((drawing) => ({ id: drawing.id, number: drawing.drawingNumber }))}
    parts={row.parts.map((part) => ({ id: part.id, number: part.partNumber }))}
    matrix={row.matrix}
    query={query}
    onOpenDrawing={row.rowKind === "formal_root" ? (drawingNumber) => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: row.displayCode, drawingNumber })) : undefined}
    onOpenPart={row.rowKind === "formal_root" ? (partNumber) => onOpenTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: row.displayCode, partNumber })) : undefined}
  />;
}
