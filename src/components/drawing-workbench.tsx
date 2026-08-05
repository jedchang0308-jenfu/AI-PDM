"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, DollarSign, FileText, GitBranch, Link2, RefreshCcw, Search, Workflow, X } from "lucide-react";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import type { CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import {
  ConfirmDialog,
  NumberStateOwnerCreateAction,
  WorkspaceDrawer,
  type NumberingDraftWorkspace,
  type WorkspaceAction
} from "@/components/number-state-workspace";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { PdmDetailDrawer, useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusBadge, StatusScopeHelp } from "@/components/status-help-popover";
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

const stageOptions: Array<{ value: "" | DrawingWorkbenchStage; label: string }> = [
  { value: "", label: "全部工作狀態" },
  { value: "building", label: "建立中" },
  { value: "drawing_preparation", label: "首版準備" },
  { value: "bundle_ready", label: "可送審" },
  { value: "in_review", label: "審核中" },
  { value: "auto_finalizing", label: "系統正式化中" },
  { value: "recovery_required", label: "需要處理" },
  { value: "official_controlled", label: "研發受控" },
  { value: "revision_in_review", label: "新版審核中" },
  { value: "released", label: "已發布" },
  { value: "history_only", label: "歷史紀錄" }
];

const usageLabels: Record<DrawingWorkbenchRow["usage"], string> = {
  not_for_formal_use: "尚不可正式使用",
  rd_controlled: "研發受控",
  released: "可正式使用",
  historical_only: "僅供查閱"
};

type DrawingDetail = NonNullable<DrawingWorkbenchDetailResponse["drawing"]>;
type DrawingPurposeFilter = NonNullable<DrawingWorkbenchRow["purposeCode"]>;
type DrawingRecordStatusFilter = NonNullable<DrawingWorkbenchRow["recordStatus"]>;
type ProductionSliceClientStatus = {
  configured: boolean;
  openPagePaths: string[];
  unopenedMessage: string;
};

const defaultProductionSliceUnopenedMessage = "此功能未納入本次正式領號 / 保留號 production slice。";

function readBody<T>(response: Response) {
  return response.json().catch(() => ({})) as Promise<T & { error?: string; message?: string }>;
}

function apiMessage(body: { error?: string; message?: string }, fallback: string) {
  return body.message?.trim() || body.error?.trim() || fallback;
}

function createIdempotencyKey(action: string) {
  return `dev053:${action}:${crypto.randomUUID()}`;
}

function normalizeInitialLocation() {
  const params = new URLSearchParams(window.location.search);
  const legacyReserved = params.get("tab") === "reserved";
  const rawView = params.get("view");
  const view: DrawingWorkbenchView = legacyReserved || rawView === "work" ? "work" : rawView === "all" ? "all" : "mine";
  const rawDetail = params.get("detail")?.trim() ?? "";
  const detail = rawDetail.includes(":") ? rawDetail : rawDetail.startsWith("draft-workspace-") ? `candidate:${rawDetail}` : "";
  const legacyDrawingCode = rawDetail && !detail ? rawDetail : "";
  params.delete("tab");
  params.set("view", view);
  if (detail) params.set("detail", detail);
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", nextUrl);
  return {
    view,
    query: params.get("query")?.trim() || legacyDrawingCode,
    stage: (params.get("stage")?.trim() || "") as "" | DrawingWorkbenchStage,
    seriesCode: params.get("seriesCode")?.trim() || "",
    purposeCode: (params.get("purposeCode")?.trim() || "") as "" | DrawingPurposeFilter,
    recordStatus: (params.get("recordStatus")?.trim() || "") as "" | DrawingRecordStatusFilter,
    detail
  };
}

export function DrawingWorkbench() {
  const [initialized, setInitialized] = useState(false);
  const [view, setView] = useState<DrawingWorkbenchView>("mine");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"" | DrawingWorkbenchStage>("");
  const [seriesCode, setSeriesCode] = useState("");
  const [purposeCode, setPurposeCode] = useState<"" | DrawingPurposeFilter>("");
  const [recordStatus, setRecordStatus] = useState<"" | DrawingRecordStatusFilter>("");
  const [seriesCodeOptions, setSeriesCodeOptions] = useState<string[]>([]);
  const [purposeCodeOptions, setPurposeCodeOptions] = useState<DrawingPurposeFilter[]>([]);
  const [recordStatusOptions, setRecordStatusOptions] = useState<DrawingRecordStatusFilter[]>([]);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const [rows, setRows] = useState<DrawingWorkbenchRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<DrawingWorkbenchDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const initialDetailRef = useRef("");
  const detailRequestRef = useRef(0);
  const autoOpenedQueryRef = useRef("");
  const idempotencyKeys = useRef(new Map<string, string>());
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({
    storageKey: "pdm-unified-drawing-workbench-drawer-width",
    defaultWidth: 660,
    minWidth: 420
  });

  useEffect(() => {
    const initial = normalizeInitialLocation();
    setView(initial.view);
    setQuery(initial.query);
    setStage(initial.stage);
    setSeriesCode(initial.seriesCode);
    setPurposeCode(initial.purposeCode);
    setRecordStatus(initial.recordStatus);
    initialDetailRef.current = initial.detail;
    setInitialized(true);
  }, []);

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

  const currentCursor = cursorHistory[pageIndex] ?? "";
  const loadRows = useCallback(async () => {
    if (!initialized) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ view, limit: "50" });
    if (query.trim()) params.set("query", query.trim());
    if (stage) params.set("stage", stage);
    if (seriesCode) params.set("seriesCode", seriesCode);
    if (purposeCode) params.set("purposeCode", purposeCode);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (currentCursor) params.set("cursor", currentCursor);
    const response = await fetch(`/api/numbering/drawings/workbench?${params.toString()}`, { cache: "no-store" });
    const body = await readBody<DrawingWorkbenchListResponse>(response);
    setLoading(false);
    if (response.status === 401) {
      window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!response.ok) {
      setRows([]);
      setError(apiMessage(body, "圖號工作台目前無法載入，請重新整理。"));
      return;
    }
    setRows(body.rows ?? []);
    setNextCursor(body.nextCursor ?? null);
    setSeriesCodeOptions(body.filters?.seriesCodeOptions ?? []);
    setPurposeCodeOptions(body.filters?.purposeCodeOptions ?? []);
    setRecordStatusOptions(body.filters?.recordStatusOptions ?? []);
  }, [currentCursor, initialized, purposeCode, query, recordStatus, seriesCode, stage, view]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const resetPagination = useCallback(() => {
    setCursorHistory([""]);
    setPageIndex(0);
  }, []);

  const closeDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setSelectedKey("");
    setDetail(null);
    setDetailLoading(false);
    setEditing(false);
    const params = new URLSearchParams(window.location.search);
    params.delete("detail");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  const openDetail = useCallback(async (rowKey: string) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedKey(rowKey);
    setDetailLoading(true);
    setError("");
    const response = await fetch(`/api/numbering/drawings/workbench/${encodeURIComponent(rowKey)}`, { cache: "no-store" });
    const body = await readBody<DrawingWorkbenchDetailResponse>(response);
    if (detailRequestRef.current !== requestId) return;
    setDetailLoading(false);
    if (!response.ok || !body.row) {
      setDetail(null);
      setError(apiMessage(body, "這筆圖號工作已不存在或目前無法查看。"));
      return;
    }
    setDetail(body);
    const params = new URLSearchParams(window.location.search);
    params.set("detail", rowKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  useEffect(() => {
    if (!initialized || !initialDetailRef.current) return;
    const rowKey = initialDetailRef.current;
    initialDetailRef.current = "";
    void openDetail(rowKey);
  }, [initialized, openDetail]);

  useEffect(() => {
    if (!initialized || initialDetailRef.current || selectedKey || !query.trim()) return;
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
    if (autoOpenedQueryRef.current === normalizedQuery) return;
    const exact = rows.find((row) => row.displayCode.toLocaleLowerCase("zh-Hant") === normalizedQuery);
    if (exact) {
      autoOpenedQueryRef.current = normalizedQuery;
      void openDetail(exact.rowKey);
    }
  }, [initialized, openDetail, query, rows, selectedKey]);

  const selectedRow = useMemo(() => rows.find((row) => row.rowKey === selectedKey) ?? detail?.row ?? null, [detail?.row, rows, selectedKey]);

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
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        ...(action === "cancel" ? { expectedRowVersion: workspace.rowVersion, reason: "user_cancelled_draft" } : {}),
        ...(action === "submit" ? { expectedWorkspaceRowVersion: workspace.rowVersion, reason: "draft_owner_confirmed_candidate_bundle_review" } : {}),
        ...(action === "withdraw" ? { expectedWorkspaceRowVersion: workspace.rowVersion, reason: "draft_owner_withdrew_candidate_bundle_review" } : {}),
        ...(action === "publish" ? { expectedRowVersion: workspace.rowVersion } : {})
      })
    });
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

  function nextPage() {
    if (!nextCursor) return;
    setCursorHistory((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
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
            <div><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => { resetPagination(); setQuery(event.target.value); }} placeholder="圖號、品名、料號" /></div>
          </label>
          <label><span>範圍</span><select value={view} onChange={(event) => { resetPagination(); setView(event.target.value as DrawingWorkbenchView); }}><option value="mine">我的待處理</option><option value="work">工作中</option><option value="all">全部</option></select></label>
          <label><span>工作狀態</span><select value={stage} onChange={(event) => { resetPagination(); setStage(event.target.value as "" | DrawingWorkbenchStage); }}>{stageOptions.map((option) => <option value={option.value} key={option.value || "all"}>{option.label}</option>)}</select></label>
          <label><span>系列代號</span><select value={seriesCode} onChange={(event) => { resetPagination(); setSeriesCode(event.target.value); }}><option value="">全部系列</option>{seriesCodeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label><span>圖面用途</span><select value={purposeCode} onChange={(event) => { resetPagination(); setPurposeCode(event.target.value as "" | DrawingPurposeFilter); }}><option value="">全部用途</option>{purposeCodeOptions.map((option) => <option value={option} key={option}>{option} {displayDrawingPurposeLabel(option)}</option>)}</select></label>
          <label><span>資料狀態</span><select value={recordStatus} onChange={(event) => { resetPagination(); setRecordStatus(event.target.value as "" | DrawingRecordStatusFilter); }}><option value="">全部狀態</option>{recordStatusOptions.map((option) => <option value={option} key={option}>{formatStatusForUser(option, "masterRecord")}</option>)}</select></label>
        </div>
      </section>

      <section className="panel pdm-master-table-panel drawing-workbench-list-panel">
        {loading && rows.length === 0 ? <div className="empty">正在載入圖號工作...</div> : null}
        {!loading && rows.length === 0 && !error ? <div className="empty"><strong>目前沒有符合條件的圖號工作</strong><p>{view === "mine" ? "你目前沒有待處理事項；可切換到「工作中」或建立圖號。" : "請調整搜尋或篩選條件。"}</p></div> : null}
        {rows.length > 0 ? (
          <div className="table-wrap pdm-identity-scroll drawing-workbench-table-wrap" role="region" aria-label="圖號工作清單" tabIndex={0}>
            <table className="pdm-identity-table drawing-workbench-table">
              <colgroup><col className="drawing-workbench-col-code" /><col className="drawing-workbench-col-name" /><col className="drawing-workbench-col-stage" /><col className="drawing-workbench-col-action" /></colgroup>
              <thead><tr><th>圖號</th><th>品名</th><th>工作狀態</th><th>下一步</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.rowKey} className={selectedKey === row.rowKey ? "selected-row" : undefined} aria-selected={selectedKey === row.rowKey} onClick={() => void openDetail(row.rowKey)}>
                  <td data-label="圖號"><button className="link-button pdm-identity-code" type="button" onClick={(event) => { event.stopPropagation(); void openDetail(row.rowKey); }}>{row.displayCode}{row.additionalDrawingCount > 0 ? ` +${row.additionalDrawingCount}` : ""}</button></td>
                  <td data-label="品名"><div className="pdm-identity-name">{row.displayName}</div>{row.relatedPartSummary ? <div className="pdm-identity-name-sub">料號：{row.relatedPartSummary}</div> : null}</td>
                  <td data-label="工作狀態"><div className="drawing-workbench-stage"><span className={`drawing-workbench-stage-badge is-${row.stage}`}>{row.stageLabel}</span><small>{usageLabels[row.usage]}</small><WorkbenchRowSignals row={row} />{row.warning ? <span className="drawing-workbench-warning"><AlertTriangle size={14} />{row.warning.message}</span> : null}</div></td>
                  <td data-label="下一步"><PrimaryAction action={row.primaryAction} rowKey={row.rowKey} onOpenDetail={openDetail} productionSlice={productionSlice} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        {(pageIndex > 0 || nextCursor) ? <div className="number-state-pagination"><button className="secondary-button" type="button" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />上一頁</button><span>第 {pageIndex + 1} 頁</span><button className="secondary-button" type="button" disabled={!nextCursor || loading} onClick={nextPage}>下一頁<ChevronRight size={16} /></button></div> : null}
      </section>

      {detailLoading && !detail ? <div className="drawing-workbench-detail-loading" role="status">正在載入明細...</div> : null}
      {detail?.candidate ? (
        <WorkspaceDrawer
          workspace={detail.candidate as NumberingDraftWorkspace}
          busy={actionBusy}
          editing={editing}
          onEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onUpdate={(payload) => void updateWorkspace(payload)}
          onSubmit={() => setConfirmAction("submit")}
          onWithdraw={() => setConfirmAction("withdraw")}
          onPublish={() => setConfirmAction("publish")}
          onCancel={() => setConfirmAction("cancel")}
          formalActionsUnopened={Boolean(productionSlice?.configured)}
          unopenedMessage={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage}
          canCreateDrawingRevision={false}
          lifecycleV2Enabled
          onV2WorkspaceChange={acceptCandidateWorkspace}
          onV2Error={setError}
          onV2Notice={setNotice}
          seriesCodeOptions={seriesCodeOptions}
          width={drawerWidth}
          onStartResize={startDrawerResize}
          onClose={closeDetail}
        />
      ) : null}
      {detail?.drawing ? <DrawingMasterDrawer drawing={detail.drawing} row={detail.row} canReviewApprovals={detail.capabilities.canReviewApprovals} productionSlice={productionSlice} width={drawerWidth} onStartResize={startDrawerResize} onDataChanged={async () => { await refreshDetailAndRows(); }} onOpenDetail={openDetail} onClose={closeDetail} /> : null}
      {confirmAction && detail?.candidate ? <ConfirmDialog action={confirmAction} workspace={detail.candidate as NumberingDraftWorkspace} busy={actionBusy} lifecycleV2Enabled onClose={() => setConfirmAction(null)} onConfirm={() => void runWorkspaceAction(confirmAction)} /> : null}
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
    return <button className="primary-button drawing-workbench-row-action" type="button" disabled={!action.enabled} title={action.disabledReason ?? action.label} onClick={(event) => { event.stopPropagation(); if (action.enabled) void onOpenDetail(rowKey); }}>{action.label}</button>;
  }
  return <Link className="primary-button drawing-workbench-row-action" aria-disabled={!action.enabled} tabIndex={action.enabled ? undefined : -1} href={action.enabled ? action.href : "#"} title={action.disabledReason ?? action.label} onClick={(event) => { event.stopPropagation(); if (!action.enabled) event.preventDefault(); }}>{action.label}</Link>;
}

function WorkbenchRowSignals({ row }: { row: DrawingWorkbenchRow }) {
  if (!row.recordStatus && row.pendingApprovalCount === 0 && !row.releaseStatusMismatch && row.warningCount === 0) return null;
  return (
    <div className="pdm-meta-strip drawing-workbench-row-signals">
      {row.recordStatus ? <StatusBadge status={row.recordStatus} context="masterRecord" /> : null}
      {row.purposeCode ? <span className="pdm-meta-chip">{row.purposeCode} {displayDrawingPurposeLabel(row.purposeCode)}</span> : null}
      {row.pendingApprovalCount > 0 ? <span className="pdm-meta-chip drawing-pending-approval-chip">待審 {row.pendingApprovalCount}</span> : null}
      {row.releaseStatusMismatch ? <span className="pdm-meta-chip drawing-workbench-mismatch-chip">發布待同步</span> : null}
      {row.warningCount > 0 ? <span className="pdm-meta-chip drawing-workbench-alert-chip"><AlertTriangle size={13} />警示 {row.warningCount}</span> : null}
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

function DrawingMasterDrawer({ drawing, row, canReviewApprovals, productionSlice, width, onStartResize, onDataChanged, onOpenDetail, onClose }: { drawing: DrawingDetail; row: DrawingWorkbenchRow; canReviewApprovals: boolean; productionSlice: ProductionSliceClientStatus | null; width: number; onStartResize: (clientX: number) => void; onDataChanged: () => Promise<void>; onOpenDetail: (rowKey: string) => Promise<void>; onClose: () => void }) {
  const sourcePart = drawing.sameRootParts.find((part) => drawing.linkedPartNumbers.includes(part.partNumber)) ?? drawing.sameRootParts[0] ?? null;
  const revisionHref = `/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
  const submissionHref = `/drawings/${encodeURIComponent(drawing.drawingNumber)}/submission-workbench`;
  const relationHref = `/numbering/search?query=${encodeURIComponent(drawing.drawingNumber)}&entityType=drawing_number`;
  const impactHref = `/numbering/impact?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
  const primaryIsRevision = row.primaryAction?.kind === "create_revision";
  return (
    <PdmDetailDrawer open width={width} ariaLabel="圖號明細" resizeLabel="調整圖號明細寬度" onClose={onClose} onStartResize={onStartResize} className="drawing-workbench-master-drawer">
      <div className="drawing-workbench-drawer-header"><div><span>{row.stageLabel}</span><h2>{drawing.drawingNumber}</h2><p>{drawing.coreName}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉圖號明細"><X size={20} /></button></div>
      <div className="drawing-workbench-drawer-body">
        <section className="drawing-workbench-drawer-primary"><div><strong>{usageLabels[row.usage]}</strong>{row.warning ? <span>{row.warning.message}</span> : null}</div><PrimaryAction action={row.primaryAction} rowKey={row.rowKey} onOpenDetail={onOpenDetail} productionSlice={productionSlice} /></section>
        <dl className="drawing-workbench-facts"><div><dt>用途</dt><dd>{drawing.purposeCode} {displayDrawingPurposeLabel(drawing.purposeCode)}</dd></div><div><dt>關聯料號</dt><dd>{drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : "尚未關聯"}</dd></div><div><dt>資料狀態</dt><dd><StatusBadge status={drawing.recordStatus} context="masterRecord" /></dd></div><div><dt>同根料號</dt><dd>{drawing.sameRootParts.length} 筆</dd></div></dl>
        <section className="panel drawing-workbench-management-actions" aria-label="圖面資料管理">
          <div className="panel-header"><div><h2>圖面資料管理</h2><p>主要下一步只保留一個；其他既有管理功能集中在這裡。</p></div></div>
          <div className="drawing-detail-action-row">
            {primaryIsRevision ? null : <WorkbenchActionLink href={revisionHref} label="圖面進版" icon={<GitBranch size={16} />} productionSlice={productionSlice} capability="drawing-revision" />}
            <WorkbenchActionLink href={submissionHref} label="上傳與送審" icon={<FileText size={16} />} productionSlice={productionSlice} capability="drawing-submission" />
            <WorkbenchActionLink href={relationHref} label="完整圖料關係" icon={<Search size={16} />} productionSlice={productionSlice} capability="drawing-relations" />
            {isManufacturingDrawingPurpose(drawing.purposeCode) ? <WorkbenchActionLink href={impactHref} label="製造影響" icon={<Workflow size={16} />} productionSlice={productionSlice} capability="manufacturing-impact" /> : null}
          </div>
        </section>
        {drawing.titleBlockVariantWarning ? <TitleBlockVariantWarning /> : null}
        {drawing.releaseStatusMismatch ? <ReleaseStatusMismatchPanel drawing={drawing} productionSlice={productionSlice} /> : null}
        <MasterAttachmentPanel entityType="drawing_number" entityCode={drawing.drawingNumber} processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)} readOnly pendingRevisionReviews={drawing.pendingApproval ? { ...drawing.pendingApproval, canReview: canReviewApprovals } : null} productionSliceEnforced={Boolean(productionSlice?.configured)} productionSliceUnopenedMessage={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage} />
        <DrawingSubmissionPrerequisitePanel drawing={drawing} canReviewApprovals={canReviewApprovals} />
        <SameRootPartPanel drawing={drawing} mutationsBlocked={Boolean(productionSlice?.configured)} blockedReason={productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage} onDataChanged={onDataChanged} />
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
    </PdmDetailDrawer>
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
    <section className="panel drawing-workbench-risk-panel is-warning" data-capability="release-status-remediation">
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
  const hasOutstandingItems = incompleteParts.length > 0 || missingCostParts.length > 0 || Boolean(pendingApproval);
  return (
    <section className="panel drawing-prerequisite-panel" data-capability="submission-readiness">
      <div className="panel-header"><h2>送審檢查</h2><strong>{hasOutstandingItems ? "需處理" : "可確認送審"}</strong></div>
      <div className="drawing-workbench-readiness-list">
        <ReadinessChip icon={<FileText size={16} />} title="圖面附件" state="由受控檔案摘要確認" />
        <ReadinessChip icon={<Link2 size={16} />} title="主資料" state={incompleteParts.length > 0 ? `${incompleteParts.length} 筆待補` : "完成"} tone={incompleteParts.length > 0 ? "danger" : "success"} />
        <ReadinessChip icon={<Workflow size={16} />} title="標準成本" state={missingCostParts.length > 0 ? `${missingCostParts.length} 筆待補` : "完成"} tone={missingCostParts.length > 0 ? "danger" : "success"} />
        {pendingApproval ? <ReadinessChip icon={<ClipboardCheck size={16} />} title="進版審核" state={canReviewApprovals ? `${pendingApproval.count} 筆待審` : "等待主管"} tone="warning" /> : null}
      </div>
    </section>
  );
}

function ReadinessChip({ icon, title, state, tone = "default" }: { icon: ReactNode; title: string; state: string; tone?: "default" | "success" | "danger" | "warning" }) {
  return <div className={`drawing-workbench-readiness-chip is-${tone}`}><span>{icon}</span><span>{title}</span><strong>{state}</strong></div>;
}

function getIncompleteSameRootParts(drawing: DrawingDetail) {
  return drawing.sameRootParts.filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
}

type SameRootPart = DrawingDetail["sameRootParts"][number];

function SameRootPartPanel({ drawing, mutationsBlocked, blockedReason, onDataChanged }: { drawing: DrawingDetail; mutationsBlocked: boolean; blockedReason: string; onDataChanged: () => Promise<void> }) {
  const incompleteParts = getIncompleteSameRootParts(drawing);
  if (drawing.sameRootParts.length === 0) return null;
  const allReady = incompleteParts.length === 0;
  return (
    <section className="panel same-root-part-panel" data-capability="same-root-part-management">
      <details className="same-root-part-details" open={!allReady}>
        <summary><h2>同主根號料號</h2><strong>{allReady ? `已完成 · ${drawing.sameRootParts.length} 筆` : `${incompleteParts.length} 筆待補`}</strong></summary>
        <div className="drawing-workbench-part-list">
          {drawing.sameRootParts.map((part) => <PartMasterDataCard key={part.id} part={part} mutationsBlocked={mutationsBlocked} blockedReason={blockedReason} onDataChanged={onDataChanged} />)}
        </div>
      </details>
    </section>
  );
}

function PartMasterDataCard({ part, mutationsBlocked, blockedReason, onDataChanged }: { part: SameRootPart; mutationsBlocked: boolean; blockedReason: string; onDataChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => partDraftFromRecord(part));
  const missingRequired = !draft.materialLabel.trim() || !draft.surfaceTreatment.trim();

  useEffect(() => {
    if (editing) return;
    setDraft(partDraftFromRecord(part));
    setMessage("");
  }, [editing, part]);

  async function savePartMasterData() {
    if (mutationsBlocked) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/parts/${encodeURIComponent(part.partNumber)}/variant`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialCode: part.materialCode,
        materialLabel: draft.materialLabel,
        colorCode: part.colorCode,
        colorLabel: draft.colorLabel,
        surfaceTreatment: draft.surfaceTreatment,
        variantNote: draft.variantNote
      })
    });
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(body.message || body.error || "主資料儲存失敗。");
      return;
    }
    setEditing(false);
    await onDataChanged();
  }

  return (
    <article className="drawing-workbench-part-card">
      <div className="drawing-workbench-part-card-header">
        <div><strong>{part.partNumber}</strong><p>{part.partName}</p></div>
        <div className="drawing-workbench-part-card-actions">
          {part.standardCostStatus === "missing" ? <Link className="secondary-button" href={partCostHref(part)} data-capability="standard-cost-maintenance"><DollarSign size={16} />補標準成本</Link> : null}
          <button className="secondary-button" type="button" onClick={() => setEditing((current) => !current)} disabled={saving || mutationsBlocked} title={mutationsBlocked ? blockedReason : undefined} data-capability="part-variant-maintenance">{editing ? "取消" : missingRequired ? "補主資料" : "編輯主資料"}{mutationsBlocked ? <span className="drawing-workbench-inline-unopened">未開放</span> : null}</button>
        </div>
      </div>
      <div className="pdm-meta-strip">
        <StatusBadge status={part.recordStatus} context="masterRecord" />
        <span className={`pdm-meta-chip ${part.standardCostStatus === "active" ? "is-success" : "is-danger"}`}>{standardCostLabel(part)}</span>
        {missingRequired ? <span className="pdm-meta-chip is-danger">送審資料未完成</span> : null}
      </div>
      {editing ? (
        <div className="drawing-workbench-part-edit-grid">
          <label className="pdm-master-field"><span>材質</span><input value={draft.materialLabel} onChange={(event) => setDraft((current) => ({ ...current, materialLabel: event.target.value }))} /><small>送審必要。</small></label>
          <label className="pdm-master-field"><span>表面處理</span><input value={draft.surfaceTreatment} onChange={(event) => setDraft((current) => ({ ...current, surfaceTreatment: event.target.value }))} /><small>送審必要。</small></label>
          <label className="pdm-master-field"><span>顏色</span><input value={draft.colorLabel} onChange={(event) => setDraft((current) => ({ ...current, colorLabel: event.target.value }))} /></label>
          <label className="pdm-master-field"><span>變體</span><input value={draft.variantNote} onChange={(event) => setDraft((current) => ({ ...current, variantNote: event.target.value }))} /></label>
          {message ? <p className="drawing-workbench-part-error">{message}</p> : null}
          <div className="drawing-workbench-part-edit-actions"><button className="primary-button" type="button" onClick={() => void savePartMasterData()} disabled={saving || missingRequired}>{saving ? "儲存中..." : "儲存主資料"}</button></div>
        </div>
      ) : (
        <div className="drawing-workbench-part-info-grid">
          <InfoBlock icon={<FileText size={16} />} title="材質" value={part.materialLabel || part.materialCode || "未填"} />
          <InfoBlock icon={<FileText size={16} />} title="顏色" value={part.colorLabel || part.colorCode || "未填"} />
          <InfoBlock icon={<Workflow size={16} />} title="變體" value={variantDescriptor(part)} />
          <InfoBlock icon={<Link2 size={16} />} title="主要製造圖" value={part.primaryDrawingNumber ?? "未連結"} />
        </div>
      )}
    </article>
  );
}

function partDraftFromRecord(part: SameRootPart) {
  return {
    materialLabel: part.materialLabel || part.materialCode || "",
    colorLabel: part.colorLabel || part.colorCode || "",
    surfaceTreatment: part.surfaceTreatment || "",
    variantNote: part.variantNote || ""
  };
}

function variantDescriptor(part: SameRootPart) {
  const values = [part.surfaceTreatment, part.variantNote].filter(Boolean);
  return values.length ? values.join(" / ") : "未填";
}

function standardCostLabel(part: SameRootPart) {
  if (part.standardCostStatus === "missing") return "標準成本未設定";
  return part.standardCostProfileName ? `標準成本 active / ${part.standardCostProfileName}` : "標準成本 active";
}

function partCostHref(part: SameRootPart) {
  return `/parts?detail=${encodeURIComponent(part.partNumber)}&focus=cost`;
}

function InfoBlock({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="info-block"><span>{icon}</span><strong>{title}</strong><p>{value}</p></div>;
}
