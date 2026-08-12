"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, FileText, GitBranch, Link2, RotateCcw, Search, ShieldAlert, Workflow } from "lucide-react";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import { DrawingWorkbench } from "@/components/drawing-workbench";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { SearchHighlight } from "@/components/search-highlight";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { NumberStateModuleTabs, NumberStateOwnerCreateAction, NumberStateWorkspaceWorkbench } from "@/components/number-state-workspace";
import { NumberSortHeader } from "@/components/number-sort-header";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { copyTextToClipboardBestEffort } from "@/lib/client-clipboard";
import { ACTIVE_DRAWING_PURPOSE_CODES, displayDrawingPurposeLabel, isManufacturingDrawingPurpose } from "@/lib/numbering-identity";
import { drawingRecordStatusFilterValues, formatStatusForUser } from "@/lib/status-display";
import { DEFAULT_NUMBER_SORT_DIRECTION, parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type NumberingRecordStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
type DrawingPurposeCode = "MA" | "OT" | "M" | "R";

type DrawingLinkedPartRecord = {
  id: string;
  partNumber: string;
  partName: string;
  recordStatus: NumberingRecordStatus;
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
  primaryDrawingNumber: string | null;
};

type DrawingPendingApprovalSummary = {
  count: number;
  revisions: string[];
  latestRequestedAt: string | null;
  latestRequestId: string | null;
  workbenchHref: string;
};

type DrawingListRecord = {
  id: string;
  partRootId: string;
  rootCode: string;
  coreName: string;
  itemKind: "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription: string;
  sequenceNo: number;
  isPrimaryManufacturing: boolean;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
  linkedPartCount: number;
  linkedPartNumbers: string[];
  sameRootParts: DrawingLinkedPartRecord[];
  titleBlockVariantWarning: boolean;
  warningCount: number;
  releaseStatusMismatch: {
    submissionId: string;
    revision: string;
    releasedAt: string | null;
  } | null;
  pendingApproval?: DrawingPendingApprovalSummary | null;
  updatedAt: string;
};

const statuses = ["", ...drawingRecordStatusFilterValues] as const;
const purposeCodes = ["", ...ACTIVE_DRAWING_PURPOSE_CODES] as const;
const DRAWING_DRAWER_WIDTH_STORAGE_KEY = "pdm-drawing-detail-drawer-width";

const mutedStyle = { color: "var(--muted)" };
const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  borderRadius: "999px",
  border: "1px solid var(--border)",
  padding: "0.2rem 0.5rem",
  fontSize: "0.75rem",
  color: "var(--muted)"
};

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}

function hasSelectedText() {
  return Boolean(window.getSelection()?.toString());
}

export default function DrawingNumbersPage() {
  const [workbenchEnabled, setWorkbenchEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"official" | "reserved" | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesCodeOptions, setSeriesCodeOptions] = useState<string[]>([]);
  const [recordStatus, setRecordStatus] = useState("");
  const [purposeCode, setPurposeCode] = useState("");
  const [sortDirection, setSortDirection] = useState<NumberSortDirection>(DEFAULT_NUMBER_SORT_DIRECTION);
  const [drawings, setDrawings] = useState<DrawingListRecord[]>([]);
  const [canReviewApprovals, setCanReviewApprovals] = useState(false);
  const [selectedDrawingNumber, setSelectedDrawingNumber] = useState<string | null>(null);
  const selectedDrawingNumberRef = useRef<string | null>(null);
  const initialDetailDrawingNumberRef = useRef<string | null>(null);
  const drawingListRef = useRef<HTMLDivElement | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { drawerWidth, startDrawerResize: startDrawingDrawerResize } = useRememberedDrawerWidth({
    storageKey: DRAWING_DRAWER_WIDTH_STORAGE_KEY
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedDrawing = drawings.find((drawing) => drawing.drawingNumber === selectedDrawingNumber) ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setActiveTab(params.get("tab") === "reserved" ? "reserved" : "official");
    const initialQuery = params.get("query")?.trim();
    const detailDrawingNumber = params.get("detail")?.trim();
    const initialSortDirection = parseNumberSortDirection(params.get("sortDirection"));
    if (initialQuery) setQuery(initialQuery);
    setSortDirection(initialSortDirection);
    if (detailDrawingNumber) initialDetailDrawingNumberRef.current = detailDrawingNumber;
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/numbering/state-flow/status", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      setWorkbenchEnabled(response.ok && body.drawingWorkbench?.enabled === true);
    })();
  }, []);

  const loadDrawings = useCallback(async () => {
    if (workbenchEnabled !== false || activeTab !== "official") return;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ limit: "80", sortDirection });
    if (query.trim()) params.set("query", query.trim());
    if (seriesCode) params.set("seriesCode", seriesCode);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (purposeCode) params.set("purposeCode", purposeCode);
    const response = await fetch(`/api/numbering/drawings?${params.toString()}`);
    setBusy(false);
    if (response.status === 401 || response.status === 403) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "圖號清單讀取失敗。");
      setState("error");
      return;
    }
    const nextDrawings = (body.drawings ?? []) as DrawingListRecord[];
    setSeriesCodeOptions((body.seriesCodeOptions ?? []) as string[]);
    setCanReviewApprovals(Boolean(body.approvalProjection?.canReview));
    const currentSelection = selectedDrawingNumberRef.current;
    const nextSelection = currentSelection && nextDrawings.some((drawing) => drawing.drawingNumber === currentSelection) ? currentSelection : null;
    selectedDrawingNumberRef.current = nextSelection;
    setDrawings(nextDrawings);
    setSelectedDrawingNumber(nextSelection);
    setIsDetailOpen((current) => current && Boolean(nextSelection));
    setState("ready");
  }, [activeTab, purposeCode, query, recordStatus, seriesCode, sortDirection, workbenchEnabled]);

  useEffect(() => {
    void loadDrawings();
  }, [loadDrawings]);

  const focusDrawingList = useCallback(() => {
    requestAnimationFrame(() => drawingListRef.current?.focus({ preventScroll: true }));
  }, []);

  const scrollDrawingRowIntoView = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const rows = drawingListRef.current?.querySelectorAll<HTMLTableRowElement>("[data-drawing-row='true']");
      rows?.[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const selectDrawingAt = useCallback(
    (index: number) => {
      if (drawings.length === 0) return;
      const nextIndex = Math.min(Math.max(index, 0), drawings.length - 1);
      const drawing = drawings[nextIndex];
      selectedDrawingNumberRef.current = drawing.drawingNumber;
      setSelectedDrawingNumber(drawing.drawingNumber);
      scrollDrawingRowIntoView(nextIndex);
      focusDrawingList();
    },
    [drawings, focusDrawingList, scrollDrawingRowIntoView]
  );

  const moveDrawingSelection = useCallback(
    (delta: number) => {
      if (drawings.length === 0) return;
      const currentIndex = drawings.findIndex((drawing) => drawing.drawingNumber === selectedDrawingNumberRef.current);
      const fallbackIndex = delta > 0 ? 0 : drawings.length - 1;
      selectDrawingAt(currentIndex === -1 ? fallbackIndex : currentIndex + delta);
    },
    [drawings, selectDrawingAt]
  );

  const getKeyboardPageStep = useCallback(() => {
    const listElement = drawingListRef.current;
    const firstRow = listElement?.querySelector<HTMLTableRowElement>("[data-drawing-row='true']");
    if (!listElement || !firstRow) return 8;
    return Math.max(1, Math.floor(listElement.clientHeight / Math.max(firstRow.getBoundingClientRect().height, 1)) - 1);
  }, []);

  const openSelectedDrawingDetail = useCallback(() => {
    if (drawings.length === 0) return;
    const currentIndex = drawings.findIndex((drawing) => drawing.drawingNumber === selectedDrawingNumberRef.current);
    const drawing = drawings[currentIndex === -1 ? 0 : currentIndex];
    selectedDrawingNumberRef.current = drawing.drawingNumber;
    setSelectedDrawingNumber(drawing.drawingNumber);
    setIsDetailOpen(true);
    focusDrawingList();
  }, [drawings, focusDrawingList]);

  const copySelectedDrawingNumber = useCallback(async () => {
    const drawingNumber = selectedDrawingNumberRef.current;
    if (!drawingNumber) return;
    await copyTextToClipboardBestEffort(drawingNumber);
  }, []);


  useEffect(() => {
    if (state !== "ready" || drawings.length === 0) return;

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isEditableShortcutTarget(event.target)) return;

      const target = event.target;
      const isListFocus = target instanceof Node && Boolean(drawingListRef.current?.contains(target));
      const isBodyFocus = target === document.body || target === document.documentElement;
      const allowListShortcut = isListFocus || isBodyFocus;

      if (event.key === "Escape" && isDetailOpen) {
        event.preventDefault();
        setIsDetailOpen(false);
        focusDrawingList();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (!allowListShortcut || hasSelectedText()) return;
        event.preventDefault();
        void copySelectedDrawingNumber();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!allowListShortcut) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          moveDrawingSelection(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveDrawingSelection(1);
          break;
        case "Enter":
          event.preventDefault();
          openSelectedDrawingDetail();
          break;
        case "PageUp":
          event.preventDefault();
          moveDrawingSelection(-getKeyboardPageStep());
          break;
        case "PageDown":
          event.preventDefault();
          moveDrawingSelection(getKeyboardPageStep());
          break;
        case "Home":
          event.preventDefault();
          selectDrawingAt(0);
          break;
        case "End":
          event.preventDefault();
          selectDrawingAt(drawings.length - 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    copySelectedDrawingNumber,
    drawings.length,
    focusDrawingList,
    getKeyboardPageStep,
    isDetailOpen,
    moveDrawingSelection,
    openSelectedDrawingDetail,
    selectDrawingAt,
    state
  ]);

  const openDrawingDetail = useCallback((drawingNumber: string) => {
    selectedDrawingNumberRef.current = drawingNumber;
    setSelectedDrawingNumber(drawingNumber);
    setIsDetailOpen(true);
    focusDrawingList();
  }, [focusDrawingList]);

  useEffect(() => {
    if (state !== "ready") return;
    const detailDrawingNumber = initialDetailDrawingNumberRef.current;
    if (!detailDrawingNumber) return;
    if (!drawings.some((drawing) => drawing.drawingNumber === detailDrawingNumber)) return;
    initialDetailDrawingNumberRef.current = null;
    openDrawingDetail(detailDrawingNumber);
  }, [drawings, openDrawingDetail, state]);

  if (workbenchEnabled === null) return <section className="panel"><div className="empty">正在開啟圖號模組...</div></section>;
  if (workbenchEnabled) return <DrawingWorkbench />;
  if (activeTab === null) return <section className="panel"><div className="empty">正在開啟圖號模組...</div></section>;
  if (activeTab === "reserved") return <NumberStateWorkspaceWorkbench module="drawings" />;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖號模組</h1>
          <p>管理圖面技術文件、版次用途、發行狀態與關聯料號；圖料模組維持跨物件追溯入口。</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={loadDrawings} disabled={busy}>
            <RotateCcw size={16} />
            重新整理
          </button>
          <NumberStateOwnerCreateAction surface="drawings" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>
      <NumberStateModuleTabs module="drawings" active="official" />

      {state === "unauthorized" ? <AccessPanel /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadDrawings} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入圖號清單...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div className="pdm-master-workbench">
          <section className="panel pdm-master-toolbar pdm-drawing-toolbar">
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="圖號 / 料號 / 文件用途" />
              </label>
              <SelectField label="系列代號" value={seriesCode} onChange={setSeriesCode} options={["", ...seriesCodeOptions]} allLabel="全部系列代號" />
              <SelectField label="用途" value={purposeCode} onChange={setPurposeCode} options={purposeCodes} formatOption={formatDrawingPurposeFilterOption} />
              <SelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />
              <button className="primary-button pdm-master-filter-action" type="button" onClick={loadDrawings} disabled={busy}>
                <Search size={16} />
                查詢
              </button>
            </div>
          </section>

          <div className="pdm-drawing-list-layout">
            {drawings.length === 0 ? (
              <section className="panel pdm-master-table-panel pdm-drawing-table-panel">
                <div className="empty">
                  <h2>尚無符合條件的圖號</h2>
                  <p>可先到編號申請建立圖號，或用圖料模組確認是否已存在相近主根號。</p>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.5rem" }}>
                    <Link className="primary-button" href="/numbering/drawings?tab=reserved">
                      編號申請
                    </Link>
                    <Link className="secondary-button" href="/numbering/search">
                      圖料模組
                    </Link>
                  </div>
                </div>
              </section>
            ) : (
            <section className="panel pdm-master-table-panel pdm-drawing-table-panel">
                <div className="number-sort-mobile-control">
                  <NumberSortHeader label="圖號" direction={sortDirection} onToggle={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} />
                </div>
                <div
                  ref={drawingListRef}
                  className="table-wrap pdm-identity-scroll"
                  role="region"
                  aria-label="圖號清單（可用上下鍵快速查閱）"
                  aria-keyshortcuts="ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C"
                  tabIndex={0}
                >
                  <table className="data-table pdm-identity-table">
                    <colgroup>
                      <col className="pdm-identity-col-code" />
                      <col className="pdm-identity-col-name" />
                      <col className="pdm-identity-col-part" />
                      <col className="pdm-identity-col-meta" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th aria-sort={sortDirection === "asc" ? "ascending" : "descending"}>
                          <NumberSortHeader label="圖號" direction={sortDirection} onToggle={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} />
                        </th>
                        <th>名稱</th>
                        <th>關聯摘要</th>
                        <th>
                          <StatusColumnHeader label="資料狀態 / 提醒" context="masterRecord" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawings.map((drawing) => (
                        <tr
                          data-drawing-row="true"
                          key={drawing.id}
                          aria-selected={drawing.drawingNumber === selectedDrawingNumber}
                          className={drawing.drawingNumber === selectedDrawingNumber ? "selected-row" : undefined}
                          onClick={() => openDrawingDetail(drawing.drawingNumber)}
                          style={{ cursor: "pointer" }}
                        >
                          <td data-label="圖號">
                            <button
                              className="link-button pdm-identity-code"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDrawingDetail(drawing.drawingNumber);
                              }}
                            >
                              <SearchHighlight value={drawing.drawingNumber} query={query} />
                            </button>
                          </td>
                          <td data-label="名稱">
                            <div className="pdm-identity-name" title={drawing.coreName}>
                              <SearchHighlight value={drawing.coreName} query={query} />
                            </div>
                            <small className="pdm-identity-subline"><SearchHighlight value={displayDrawingPurposeLabel(drawing.purposeCode)} query={query} /></small>
                          </td>
                          <td data-label="關聯摘要">
                            {drawing.linkedPartCount > 0 ? (
                              <div className="pdm-meta-strip">
                                {drawing.linkedPartNumbers.slice(0, 3).map((partNumber) => (
                                  <span className="pdm-meta-chip" key={partNumber}>
                                    <SearchHighlight value={partNumber} query={query} />
                                  </span>
                                ))}
                                {drawing.linkedPartCount > 3 ? <span className="pdm-meta-chip">+{drawing.linkedPartCount - 3}</span> : null}
                              </div>
                            ) : (
                              <span style={mutedStyle}>尚未關聯</span>
                            )}
                          </td>
                          <td data-label="資料狀態 / 提醒">
                            <div className="pdm-meta-strip">
                              <StatusBadge status={drawing.recordStatus} context="masterRecord" highlightQuery={query} />
                              {drawing.pendingApproval ? <PendingApprovalBadge pending={drawing.pendingApproval} canReview={canReviewApprovals} /> : null}
                              {drawing.releaseStatusMismatch ? <ReleaseStatusMismatchBadge mismatch={drawing.releaseStatusMismatch} /> : null}
                              {drawing.warningCount > 0 ? <WarningBadge count={drawing.warningCount} /> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
          <DrawingDetailDrawer
            drawing={selectedDrawing}
            open={isDetailOpen}
            width={drawerWidth}
            onStartResize={startDrawingDrawerResize}
            onDataChanged={loadDrawings}
            canReviewApprovals={canReviewApprovals}
            onClose={() => setIsDetailOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  formatOption,
  allLabel = "全部"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  formatOption?: (option: string) => string;
  allLabel?: string;
}) {
  return (
    <label className="pdm-master-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || "all"} value={option}>
            {option ? formatOption?.(option) ?? option : allLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDrawingPurposeFilterOption(option: string) {
  if (!option) return "全部";
  return `${option} ${displayDrawingPurposeLabel(option)}`;
}

function revisionRangeLabel(revisions: string[]) {
  const clean = [...new Set(revisions.map((revision) => revision.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "zh-Hant", { numeric: true, sensitivity: "base" })
  );
  if (clean.length === 0) return "版次待確認";
  if (clean.length <= 2) return `rev ${clean.join("、")}`;
  return `rev ${clean[0]}-${clean[clean.length - 1]}`;
}

function ReleaseStatusMismatchBadge({ mismatch }: { mismatch: NonNullable<DrawingListRecord["releaseStatusMismatch"]> }) {
  return (
    <Link
      className="pdm-meta-chip"
      href={`/submissions/${encodeURIComponent(mismatch.submissionId)}`}
      onClick={(event) => event.stopPropagation()}
      style={{ borderColor: "#f59e0b", color: "#92400e" }}
    >
      已發布送審待同步
    </Link>
  );
}

function ReleaseStatusMismatchPanel({ drawing }: { drawing: DrawingListRecord }) {
  const mismatch = drawing.releaseStatusMismatch;
  if (!mismatch) return null;
  return (
    <section className="panel" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
      <div className="panel-header">
        <div>
          <h2>發布狀態待確認</h2>
          <p style={mutedStyle}>
            系統找到已發布的送審版次 {mismatch.revision}，但這筆圖號主資料目前仍是 {formatStatusForUser(drawing.recordStatus, "masterRecord")}。
          </p>
        </div>
        <Link className="secondary-button" href={`/submissions/${encodeURIComponent(mismatch.submissionId)}`}>
          查看送審明細
        </Link>
      </div>
    </section>
  );
}

function PendingApprovalBadge({ pending, canReview }: { pending: DrawingPendingApprovalSummary; canReview: boolean }) {
  const label = `待審 ${pending.count}`;
  const title = `圖面進版影響審核：${revisionRangeLabel(pending.revisions)}`;
  if (canReview) {
    return (
      <Link
        className="pdm-meta-chip drawing-pending-approval-chip"
        href={pending.workbenchHref}
        onClick={(event) => event.stopPropagation()}
        title={title}
      >
        {label}
      </Link>
    );
  }
  return (
    <span className="pdm-meta-chip drawing-pending-approval-chip" title={title}>
      {label}
    </span>
  );
}

function WarningBadge({ count }: { count: number }) {
  return (
    <span style={{ ...badgeStyle, color: "var(--danger)", borderColor: "rgba(220, 38, 38, 0.35)" }}>
      <AlertTriangle size={14} />
      {count}
    </span>
  );
}

function DrawingDetailDrawer({
  drawing,
  open,
  width,
  onStartResize,
  onDataChanged,
  canReviewApprovals,
  onClose
}: {
  drawing: DrawingListRecord | null;
  open: boolean;
  width: number;
  onStartResize: (clientX: number) => void;
  onDataChanged: () => Promise<void>;
  canReviewApprovals: boolean;
  onClose: () => void;
}) {
  if (!open || !drawing) return null;
  return (
    <PdmEntityDetailDrawer
      open
      width={width}
      ariaLabel="圖號治理明細"
      title={drawing.drawingNumber}
      subtitle={drawing.coreName}
      status={<StatusBadge status={drawing.recordStatus} context="masterRecord" />}
      entityType="drawing_number"
      entityCode={drawing.drawingNumber}
      sourceContext="numbering_drawings"
      resizeLabel="調整圖號明細寬度"
      resizeTitle="拖拉調整寬度"
      closeLabel="關閉圖號明細"
      onClose={onClose}
      onStartResize={onStartResize}
      keepOpenSelector="[data-drawing-row='true']"
    >
        <div className="pdm-entity-drawer-body pdm-master-detail-panel pdm-master-detail-stack">
          <section className="panel drawing-detail-hero">
            <div className="drawing-detail-action-row">
              <Link className="primary-button" href={`/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`}>
                <GitBranch size={16} />
                進版
              </Link>
              <Link className="secondary-button" href={`/drawings/${encodeURIComponent(drawing.drawingNumber)}/submission-workbench`}>
                <FileText size={16} />
                送審
              </Link>
              <Link className="secondary-button" href={`/numbering/search?query=${encodeURIComponent(drawing.drawingNumber)}&entityType=drawing_number`}>
                <Search size={16} />
                追溯
              </Link>
              {isManufacturingDrawingPurpose(drawing.purposeCode) ? (
                <Link className="secondary-button" href={`/numbering/impact?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`}>
                  <Workflow size={16} />
                  影響
                </Link>
              ) : null}
            </div>
          </section>

          {drawing.titleBlockVariantWarning ? <TitleBlockVariantWarning /> : null}
          {drawing.releaseStatusMismatch ? <ReleaseStatusMismatchPanel drawing={drawing} /> : null}

          <MasterAttachmentPanel
            entityType="drawing_number"
            entityCode={drawing.drawingNumber}
            processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}
            pendingRevisionReviews={drawing.pendingApproval ? { ...drawing.pendingApproval, canReview: canReviewApprovals } : null}
          />

          <DrawingSubmissionPrerequisitePanel drawing={drawing} canReviewApprovals={canReviewApprovals} />

          <SameRootPartPanel drawing={drawing} />

          <NumberingContextualEntrypoints
            mode="drawing"
            rootId={drawing.partRootId}
            rootCode={drawing.rootCode}
            coreName={drawing.coreName}
            rootRecordStatus={drawing.recordStatus}
            drawing={{
              id: drawing.id,
              drawingNumber: drawing.drawingNumber,
              purposeCode: drawing.purposeCode,
              recordStatus: drawing.recordStatus,
              linkedPartNumbers: drawing.linkedPartNumbers
            }}
            onChanged={onDataChanged}
          />

        </div>
    </PdmEntityDetailDrawer>
  );
}

function TitleBlockVariantWarning() {
  return (
    <section className="panel" style={warningPanelStyle}>
      <div className="panel-header">
        <div>
          <h2>Title block 變體風險</h2>
          <p style={mutedStyle}>同一張製造圖已對應多個料號，且圖面描述含材質、顏色或表面處理字樣；請確認 title block 沒有寫死單一變體。</p>
        </div>
        <AlertTriangle size={18} color="var(--danger)" />
      </div>
    </section>
  );
}

function DrawingSubmissionPrerequisitePanel({ drawing, canReviewApprovals }: { drawing: DrawingListRecord; canReviewApprovals: boolean }) {
  const incompleteParts = getIncompleteSameRootParts(drawing);
  const pendingApproval = drawing.pendingApproval ?? null;
  const hasOutstandingItems = incompleteParts.length > 0 || Boolean(pendingApproval);
  return (
    <section className="panel drawing-prerequisite-panel">
      <div className="panel-header">
        <h2>送審檢查</h2>
        <strong>{hasOutstandingItems ? "需處理" : "可確認送審"}</strong>
      </div>
      <div style={readinessListStyle}>
        <ReadinessChip
          icon={<FileText size={16} />}
          title="圖面附件"
          state="先確認"
        />
        <ReadinessChip
          icon={<Link2 size={16} />}
          title="主資料"
          state={incompleteParts.length > 0 ? `${incompleteParts.length} 筆待補` : "完成"}
          tone={incompleteParts.length > 0 ? "danger" : "success"}
        />
        {pendingApproval ? (
          <ReadinessChip
            icon={<ClipboardCheck size={16} />}
            title="進版審核"
            state={canReviewApprovals ? `${pendingApproval.count} 筆待審` : "等待主管"}
            tone="warning"
          />
        ) : null}
      </div>
    </section>
  );
}

function ReadinessChip({
  icon,
  title,
  state,
  tone = "default"
}: {
  icon: ReactNode;
  title: string;
  state: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : tone === "warning" ? "#92400e" : "var(--accent-3)";
  return (
    <div style={readinessChipStyle}>
      <span style={{ color }}>{icon}</span>
      <span>{title}</span>
      <strong style={{ color }}>{state}</strong>
    </div>
  );
}

function SameRootPartPanel({ drawing }: { drawing: DrawingListRecord }) {
  const relatedParts = getRelatedParts(drawing);
  const incompleteParts = relatedParts.filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
  if (relatedParts.length === 0) return null;
  const allReady = incompleteParts.length === 0;
  return (
    <section className="panel same-root-part-panel">
      <div className="same-root-part-details">
        <div className="same-root-part-details-heading">
          <h2>關聯料號</h2>
          <strong>{allReady ? `已完成 · ${relatedParts.length} 筆` : `${incompleteParts.length} 筆待補`}</strong>
        </div>
        <div style={sameRootPartListStyle}>
        {relatedParts.map((part) => (
          <PartMasterDataCard key={part.id} part={part} />
        ))}
        </div>
      </div>
    </section>
  );
}

function getIncompleteSameRootParts(drawing: DrawingListRecord) {
  return getRelatedParts(drawing).filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
}

function getRelatedParts(drawing: Pick<DrawingListRecord, "linkedPartNumbers" | "sameRootParts">) {
  const relatedPartNumbers = new Set(drawing.linkedPartNumbers);
  return drawing.sameRootParts.filter((part) => relatedPartNumbers.has(part.partNumber));
}

function PartMasterDataCard({ part }: { part: DrawingLinkedPartRecord }) {
  const missingRequired = !(part.materialLabel || part.materialCode) || !part.surfaceTreatment;
  return (
    <article style={sameRootPartCardStyle}>
      <div style={partCardHeaderStyle}>
        <div className="drawing-workbench-part-title">
          <strong>{part.partNumber}</strong>
          <p style={mutedStyle}>{part.partName}</p>
        </div>
      </div>
      <div className="pdm-meta-strip">
        <StatusBadge status={part.recordStatus} context="masterRecord" />
        {missingRequired ? <span style={{ ...badgeStyle, color: "var(--danger)", borderColor: "rgba(220, 38, 38, 0.35)" }}>送審資料未完成</span> : null}
      </div>

      <div style={sameRootPartMetaGridStyle}>
        <InfoBlock icon={<FileText size={16} />} title="材質" value={part.materialLabel || part.materialCode || "未填"} />
        <InfoBlock icon={<FileText size={16} />} title="顏色" value={part.colorLabel || part.colorCode || "未填"} />
        <InfoBlock icon={<Workflow size={16} />} title="變體" value={variantDescriptor(part)} />
        <InfoBlock icon={<Link2 size={16} />} title="主要製造圖" value={part.primaryDrawingNumber ?? "未連結"} />
      </div>
    </article>
  );
}

function variantDescriptor(part: DrawingLinkedPartRecord) {
  const values = [part.surfaceTreatment, part.variantNote].filter(Boolean);
  return values.length ? values.join(" / ") : "未填";
}

function InfoBlock({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="info-block">
      <span style={{ color: "var(--accent-3)" }}>{icon}</span>
      <strong>{title}</strong>
      <p>{value}</p>
    </div>
  );
}

const warningPanelStyle: CSSProperties = {
  borderColor: "rgba(220, 38, 38, 0.35)",
  boxShadow: "inset 3px 0 0 var(--danger)"
};

const sameRootPartListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem"
};

const readinessListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem"
};

const readinessChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.35rem 0.6rem",
  fontSize: "0.85rem",
  background: "var(--surface)"
};

const sameRootPartCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0.75rem",
  background: "var(--surface)"
};

const partCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem"
};

const sameRootPartMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.5rem"
};

function AccessPanel() {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={28} />
        <h2>沒有圖號模組權限</h2>
        <p>請由管理員在權限矩陣開啟 numbering.drawings.view 頁面權限。</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={28} />
        <h2>圖號清單讀取失敗</h2>
        <p>{message}</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RotateCcw size={16} />
          重試
        </button>
      </div>
    </section>
  );
}
