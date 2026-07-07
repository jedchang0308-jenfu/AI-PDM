"use client";

import type { CSSProperties, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSearch, Link2, RotateCcw, Search, ShieldAlert, X } from "lucide-react";
import { CompactSummary, RiskHint } from "@/components/compact-hints";
import { ObjectLifecycleStatusPanel } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { formatDevelopmentPhaseForUser, formatStatusErrorForUser, formatStatusForUser, masterRecordStatusFilterValues } from "@/lib/status-display";

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type EntityType = "all" | "part_root" | "part_number" | "drawing_number";
type NumberingRecordStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type DrawingPurposeCode = "MA" | "OT" | "M" | "R";

type SearchResult = {
  entityType: Exclude<EntityType, "all">;
  entityId: string;
  rootCode: string;
  coreName: string;
  displayCode: string;
  displayName: string;
  itemKind: "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  purposeCode: DrawingPurposeCode | null;
  partNumber: string | null;
  drawingNumber: string | null;
  primaryDrawingNumber: string | null;
  partCount: number;
  drawingCount: number;
  linkedPartCount: number;
  warningCount: number;
};

type PartRoot = {
  id: string;
  rootCode: string;
  coreName: string;
  itemKind: SearchResult["itemKind"];
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

type PartNumber = {
  id: string;
  partRootId: string;
  partNumber: string;
  sequenceNo: number;
  sequenceCode: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  isUniversal: boolean;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  universalReason: string | null;
  ruleVersionId: string;
};

type DrawingNumber = {
  id: string;
  partRootId: string;
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription: string;
  sequenceNo: number;
  isPrimaryManufacturing: boolean;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

type NumberingLink = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  linkType: "primary_manufacturing" | "reference";
  createdAt: string;
};

type NumberingVariant = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  fieldName: string;
  fieldValue: string;
  createdAt: string;
};

type NumberingWarning = {
  id: string;
  warningCode: string;
  severity: "info" | "warning" | "blocker";
  entityType: string;
  entityId: string | null;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

type NumberingAudit = {
  id: string;
  action: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

type RootDetail = {
  root: PartRoot;
  partNumbers: PartNumber[];
  drawingNumbers: DrawingNumber[];
  links: NumberingLink[];
  variants: NumberingVariant[];
  warnings: NumberingWarning[];
  auditTrail: NumberingAudit[];
  summary: {
    partCount: number;
    drawingCount: number;
    primaryManufacturingCount: number;
    warningCount: number;
    hasMainDrawingInvalid: boolean;
  };
};

type ImpactAnalysis = {
  drawingNumber: DrawingNumber;
  applied: boolean;
  impactedPartNumbers: PartNumber[];
  requiredDocuments: string[];
  warnings: string[];
};

const statusOptions = masterRecordStatusFilterValues;
const phaseOptions: NumberingPhase[] = ["EVT", "DVT", "PVT", "Release", "ECR"];
const SEARCH_DRAWER_WIDTH_STORAGE_KEY = "pdm-search-detail-drawer-width";
const DETAIL_DRAWER_DEFAULT_WIDTH = 500;
const DETAIL_DRAWER_MIN_WIDTH = 380;
const DETAIL_DRAWER_MAX_WIDTH_RATIO = 0.72;

function clampDetailDrawerWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(DETAIL_DRAWER_MIN_WIDTH, Math.floor(viewportWidth * DETAIL_DRAWER_MAX_WIDTH_RATIO));
  return Math.min(Math.max(width, DETAIL_DRAWER_MIN_WIDTH), maxWidth);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}

function hasSelectedText() {
  return Boolean(window.getSelection()?.toString());
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export default function NumberingSearchPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("all");
  const [recordStatus, setRecordStatus] = useState("");
  const [developmentPhase, setDevelopmentPhase] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedRootCode, setSelectedRootCode] = useState<string | null>(null);
  const selectedRootCodeRef = useRef<string | null>(null);
  const initialDetailRootCodeRef = useRef<string | null>(null);
  const searchListRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<RootDetail | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DETAIL_DRAWER_DEFAULT_WIDTH);
  const [busy, setBusy] = useState<"search" | "detail" | "impact" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("query")?.trim();
    const initialEntityType = params.get("entityType") as EntityType | null;
    const detailRootCode = params.get("detail")?.trim();
    if (initialQuery) setQuery(initialQuery);
    if (initialEntityType && ["all", "part_root", "part_number", "drawing_number"].includes(initialEntityType)) setEntityType(initialEntityType);
    if (detailRootCode) initialDetailRootCodeRef.current = detailRootCode;
  }, []);

  const summary = useMemo(
    () => ({
      total: results.length,
      roots: results.filter((result) => result.entityType === "part_root").length,
      parts: results.filter((result) => result.entityType === "part_number").length,
      drawings: results.filter((result) => result.entityType === "drawing_number").length,
      warnings: results.reduce((sum, result) => sum + result.warningCount, 0)
    }),
    [results]
  );

  const loadDetail = useCallback(async (rootCode: string) => {
    setBusy("detail");
    setError("");
    selectedRootCodeRef.current = rootCode;
    setSelectedRootCode(rootCode);
    setImpact(null);
    const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "圖料號明細讀取失敗", "masterRecord"));
      setState("error");
      return;
    }
    setDetail(body as RootDetail);
    setIsDetailOpen(true);
    setState("ready");
  }, []);

  const loadResults = useCallback(async () => {
    setBusy("search");
    setError("");
    const params = new URLSearchParams({ limit: "60" });
    if (query.trim()) params.set("query", query.trim());
    if (entityType !== "all") params.set("entityType", entityType);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (developmentPhase) params.set("developmentPhase", developmentPhase);
    const response = await fetch(`/api/numbering/search?${params.toString()}`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "圖料號查詢失敗", "masterRecord"));
      setState("error");
      return;
    }
    const nextResults = (body.results ?? []) as SearchResult[];
    const currentSelection = selectedRootCodeRef.current;
    const selectedStillVisible = currentSelection && nextResults.some((result) => result.rootCode === currentSelection);
    setResults(nextResults);
    setState("ready");
    if (!selectedStillVisible) {
      selectedRootCodeRef.current = null;
      setSelectedRootCode(null);
      setDetail(null);
      setImpact(null);
      setIsDetailOpen(false);
    }
  }, [developmentPhase, entityType, query, recordStatus]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (state !== "ready") return;
    const detailRootCode = initialDetailRootCodeRef.current;
    if (!detailRootCode) return;
    if (!results.some((result) => result.rootCode === detailRootCode)) return;
    initialDetailRootCodeRef.current = null;
    void loadDetail(detailRootCode);
  }, [loadDetail, results, state]);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(SEARCH_DRAWER_WIDTH_STORAGE_KEY);
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : Number.NaN;
    if (!Number.isFinite(parsedWidth)) return;
    const nextWidth = clampDetailDrawerWidth(parsedWidth, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(SEARCH_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  const resizeDetailDrawer = useCallback((clientX: number) => {
    const nextWidth = clampDetailDrawerWidth(window.innerWidth - clientX, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(SEARCH_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setDrawerWidth((currentWidth) => {
        const nextWidth = clampDetailDrawerWidth(currentWidth, window.innerWidth);
        window.localStorage.setItem(SEARCH_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
        return nextWidth;
      });
    }
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const startDetailDrawerResize = useCallback(
    (clientX: number) => {
      function handlePointerMove(event: PointerEvent) {
        resizeDetailDrawer(event.clientX);
      }
      function stopResizing() {
        document.body.classList.remove("pdm-drawer-resizing");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
      }

      resizeDetailDrawer(clientX);
      document.body.classList.add("pdm-drawer-resizing");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing, { once: true });
      window.addEventListener("pointercancel", stopResizing, { once: true });
    },
    [resizeDetailDrawer]
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove("pdm-drawer-resizing");
    };
  }, []);

  const focusSearchList = useCallback(() => {
    requestAnimationFrame(() => searchListRef.current?.focus({ preventScroll: true }));
  }, []);

  const scrollSearchRowIntoView = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const rows = searchListRef.current?.querySelectorAll<HTMLTableRowElement>("[data-search-row='true']");
      rows?.[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const selectSearchResultAt = useCallback(
    (index: number) => {
      if (results.length === 0) return;
      const nextIndex = Math.min(Math.max(index, 0), results.length - 1);
      const result = results[nextIndex];
      selectedRootCodeRef.current = result.rootCode;
      setSelectedRootCode(result.rootCode);
      scrollSearchRowIntoView(nextIndex);
      focusSearchList();
      if (isDetailOpen) void loadDetail(result.rootCode);
    },
    [focusSearchList, isDetailOpen, loadDetail, results, scrollSearchRowIntoView]
  );

  const moveSearchSelection = useCallback(
    (delta: number) => {
      if (results.length === 0) return;
      const currentIndex = results.findIndex((result) => result.rootCode === selectedRootCodeRef.current);
      const fallbackIndex = delta > 0 ? 0 : results.length - 1;
      selectSearchResultAt(currentIndex === -1 ? fallbackIndex : currentIndex + delta);
    },
    [results, selectSearchResultAt]
  );

  const getKeyboardPageStep = useCallback(() => {
    const listElement = searchListRef.current;
    const firstRow = listElement?.querySelector<HTMLTableRowElement>("[data-search-row='true']");
    if (!listElement || !firstRow) return 8;
    return Math.max(1, Math.floor(listElement.clientHeight / Math.max(firstRow.getBoundingClientRect().height, 1)) - 1);
  }, []);

  const openSelectedSearchDetail = useCallback(() => {
    if (results.length === 0) return;
    const currentIndex = results.findIndex((result) => result.rootCode === selectedRootCodeRef.current);
    const result = results[currentIndex === -1 ? 0 : currentIndex];
    selectedRootCodeRef.current = result.rootCode;
    setSelectedRootCode(result.rootCode);
    void loadDetail(result.rootCode);
    focusSearchList();
  }, [focusSearchList, loadDetail, results]);

  const copySelectedRootCode = useCallback(async () => {
    const rootCode = selectedRootCodeRef.current;
    if (!rootCode) return;
    await copyTextToClipboard(rootCode);
  }, []);

  useEffect(() => {
    if (!isDetailOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-search-row='true']")) return;
      setIsDetailOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDetailOpen]);

  useEffect(() => {
    if (state !== "ready" || results.length === 0) return;

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isEditableShortcutTarget(event.target)) return;

      const target = event.target;
      const isListFocus = target instanceof Node && Boolean(searchListRef.current?.contains(target));
      const isBodyFocus = target === document.body || target === document.documentElement;
      const allowListShortcut = isListFocus || isBodyFocus;

      if (event.key === "Escape" && isDetailOpen) {
        event.preventDefault();
        setIsDetailOpen(false);
        focusSearchList();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (!allowListShortcut || hasSelectedText()) return;
        event.preventDefault();
        void copySelectedRootCode();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!allowListShortcut) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          moveSearchSelection(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveSearchSelection(1);
          break;
        case "Enter":
          event.preventDefault();
          openSelectedSearchDetail();
          break;
        case "PageUp":
          event.preventDefault();
          moveSearchSelection(-getKeyboardPageStep());
          break;
        case "PageDown":
          event.preventDefault();
          moveSearchSelection(getKeyboardPageStep());
          break;
        case "Home":
          event.preventDefault();
          selectSearchResultAt(0);
          break;
        case "End":
          event.preventDefault();
          selectSearchResultAt(results.length - 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    copySelectedRootCode,
    focusSearchList,
    getKeyboardPageStep,
    isDetailOpen,
    moveSearchSelection,
    openSelectedSearchDetail,
    results.length,
    selectSearchResultAt,
    state
  ]);

  async function analyzeImpact(drawingNumber: string) {
    setBusy("impact");
    setError("");
    const response = await fetch("/api/numbering/impact-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drawingNumber, applyInvalidation: false })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "製造圖作廢影響分析失敗", "masterRecord"));
      setState("error");
      return;
    }
    setImpact(body as ImpactAnalysis);
    setState("ready");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖料模組</h1>
          <p>料件、料號與圖號集中查詢，明細標示風險與影響資訊。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadResults}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      {state === "unauthorized" ? <AccessPanel /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadResults} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入圖料號查詢...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div className="pdm-master-workbench">
          <section className="panel pdm-master-toolbar pdm-drawing-toolbar">
            <div className="panel-header">
              <div>
                <h2>查詢條件</h2>
                <CompactSummary
                  items={[
                    { label: "總筆數", value: summary.total },
                    { label: "主根", value: summary.roots },
                    { label: "料號", value: summary.parts },
                    { label: "圖號", value: summary.drawings }
                  ]}
                />
              </div>
            </div>
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="主根號 / 料號 / 圖號 / 名稱" />
              </label>
              <label className="pdm-master-field">
                <span>類型</span>
                <select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType)}>
                  <option value="all">全部</option>
                  <option value="part_root">料件主根</option>
                  <option value="part_number">料號</option>
                  <option value="drawing_number">圖號</option>
                </select>
              </label>
              <label className="pdm-master-field">
                <span>狀態</span>
                <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
                  <option value="">全部狀態</option>
                  {statusOptions.map((status) => (
                    <option value={status} key={status}>
                      {formatStatusForUser(status, "masterRecord")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pdm-master-field">
                <span>階段</span>
                <select value={developmentPhase} onChange={(event) => setDevelopmentPhase(event.target.value)}>
                  <option value="">全部階段</option>
                  {phaseOptions.map((phase) => (
                    <option value={phase} key={phase}>
                      {formatDevelopmentPhaseForUser(phase)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button pdm-master-filter-action" type="button" onClick={loadResults} disabled={busy === "search"}>
                <Search size={16} />
                查詢
              </button>
            </div>
          </section>

          <div className="pdm-drawing-list-layout">
            <SearchResultsTable results={results} selectedRootCode={selectedRootCode} listRef={searchListRef} onSelect={loadDetail} />
          </div>
          <RootDetailDrawer
            detail={detail}
            impact={impact}
            busy={busy}
            open={isDetailOpen}
            width={drawerWidth}
            onAnalyzeImpact={analyzeImpact}
            onStartResize={startDetailDrawerResize}
            onClose={() => setIsDetailOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function SearchResultsTable({
  results,
  selectedRootCode,
  listRef,
  onSelect
}: {
  results: SearchResult[];
  selectedRootCode: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  onSelect: (rootCode: string) => void;
}) {
  if (results.length === 0) {
    return (
      <section className="panel pdm-master-table-panel">
        <NextStepState
          eyebrow="查無結果"
          title="目前沒有符合條件的圖料號資料"
          body="現在請先清除或放寬搜尋條件。若這是新圖號或新料號，請改到編號申請建立來源資料。"
          actions={[
            { href: "/numbering/search", label: "重新查詢", variant: "primary" },
            { href: "/numbering/request", label: "建立編號申請" }
          ]}
        />
      </section>
    );
  }

  return (
    <section className="panel pdm-master-table-panel">
      <div className="panel-header">
        <div>
          <h2>查詢結果</h2>
          <p style={mutedTextStyle}>點選任一列可開啟同主根明細。</p>
        </div>
      </div>
      <div
        ref={listRef}
        className="table-wrap pdm-identity-scroll"
        role="region"
        aria-label="圖料模組清單"
        aria-keyshortcuts="ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C"
        tabIndex={0}
      >
        <table className="pdm-identity-table">
          <colgroup>
            <col className="pdm-identity-col-code" />
            <col className="pdm-identity-col-name" />
            <col className="pdm-identity-col-part" />
            <col className="pdm-identity-col-meta" />
          </colgroup>
          <thead>
            <tr>
              <th>主根號</th>
              <th>品名</th>
              <th>料號</th>
              <th>
                <StatusColumnHeader label="狀態 / 階段 / 提醒" context="masterRecord" />
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const drawingIdentity = result.drawingNumber ?? result.primaryDrawingNumber;
              const partIdentity = result.partNumber ?? partSummary(result);
              return (
                <tr
                  data-search-row="true"
                  className={selectedRootCode === result.rootCode ? "selected-row" : undefined}
                  key={`${result.entityType}:${result.entityId}`}
                  onClick={() => onSelect(result.rootCode)}
                  style={{ cursor: "pointer" }}
                >
                  <td data-label="主根號">
                    <button
                      type="button"
                      className="pdm-identity-code"
                      style={linkButtonStyle}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(result.rootCode);
                      }}
                    >
                      {result.rootCode}
                    </button>
                    <div className="pdm-identity-meta">{resultRelation(result)}</div>
                  </td>
                  <td data-label="品名">
                    <div className="pdm-identity-name">{result.coreName || result.displayName || "-"}</div>
                    {result.entityType === "part_number" && result.displayName !== result.coreName ? <div className="pdm-identity-name-sub">{result.displayName}</div> : null}
                  </td>
                  <td data-label="料號">
                    <div className="pdm-identity-code">{partIdentity}</div>
                    <div className="pdm-identity-meta">{result.entityType === "part_root" ? `${result.partCount} 筆料號` : entityLabel(result.entityType)}</div>
                  </td>
                  <td data-label="狀態 / 階段 / 提醒">
                    <div className="pdm-meta-strip">
                      {drawingIdentity ? <span className="pdm-meta-chip">{drawingIdentity}</span> : null}
                      {result.entityType === "drawing_number" ? <span className="pdm-meta-chip">{purposeLabel(result.purposeCode ?? "R")}</span> : null}
                      <StatusBadge status={result.recordStatus} context="masterRecord" />
                      <span className="pdm-meta-chip">{formatDevelopmentPhaseForUser(result.developmentPhase)}</span>
                      <InfoMarkers result={result} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RootDetailDrawer({
  detail,
  impact,
  busy,
  open,
  width,
  onAnalyzeImpact,
  onStartResize,
  onClose
}: {
  detail: RootDetail | null;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  open: boolean;
  width: number;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
}) {
  if (!open || !detail) return null;
  return (
    <div className="pdm-detail-drawer-backdrop" role="presentation">
      <aside className="pdm-detail-drawer" aria-label="圖料明細" role="dialog" style={{ "--pdm-detail-drawer-width": `${width}px` } as CSSProperties}>
        <button
          className="pdm-detail-drawer-resize-handle"
          type="button"
          aria-label="調整圖料明細寬度"
          title="拖拉調整寬度"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStartResize(event.clientX);
          }}
        />
        <button className="icon-button pdm-detail-drawer-floating-close" type="button" aria-label="關閉圖料明細" onClick={onClose}>
          <X size={16} />
        </button>
        <RootDetailPanel detail={detail} impact={impact} busy={busy} onAnalyzeImpact={onAnalyzeImpact} />
      </aside>
    </div>
  );
}

function RootDetailPanel({
  detail,
  impact,
  busy,
  onAnalyzeImpact
}: {
  detail: RootDetail | null;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
}) {
  if (!detail) {
    return (
      <section className="panel pdm-master-detail-panel">
        <EmptyBlock text={busy === "detail" ? "正在載入明細..." : "尚未選取圖料號"} />
      </section>
    );
  }

  const primaryPart = detail.partNumbers[0] ?? null;
  const primaryDrawing = detail.drawingNumbers.find((drawingNumber) => drawingNumber.isPrimaryManufacturing) ?? detail.drawingNumbers[0] ?? null;
  const primaryAction = primaryDrawing
    ? {
        href: `/drawings/${encodeURIComponent(primaryDrawing.drawingNumber)}/submission-workbench`,
        label: detail.root.recordStatus === "Released" ? "檢查新版送審條件" : "檢查送審條件"
      }
    : undefined;

  return (
    <section className="panel pdm-master-detail-panel">
      <div className="panel-header">
        <div>
          <h2>主根明細 {detail.root.rootCode}</h2>
          <p style={mutedTextStyle}>{detail.root.coreName}</p>
        </div>
        <div style={actionGroupStyle}>
          {detail.summary.hasMainDrawingInvalid ? <WarningDot title="此主根或料號含主圖失效狀態，恢復可用前需完成重新送審。" /> : null}
          {detail.summary.warningCount > 0 ? <WarningDot title={`尚有 ${detail.summary.warningCount} 則未確認提醒。`} /> : null}
        </div>
      </div>
      <div style={detailBodyStyle}>
        <div className="metrics" style={{ marginBottom: 0 }}>
          <Metric label="料號" value={detail.summary.partCount} />
          <Metric label="圖號" value={detail.summary.drawingCount} />
          <Metric label="製造圖" value={detail.summary.primaryManufacturingCount} />
          <Metric label="提醒" value={detail.summary.warningCount} />
        </div>

        <ObjectLifecycleStatusPanel
          title="這個主根目前狀態"
          objectName={`${detail.root.rootCode} / ${detail.root.coreName}`}
          status={detail.root.recordStatus}
          phase={detail.root.developmentPhase}
          owner="RD / Manager"
          identities={[
            { label: "主根號", value: detail.root.rootCode },
            { label: "主要料號", value: primaryPart?.partNumber ?? "-" },
            { label: "主要圖號", value: primaryDrawing?.drawingNumber ?? "-" },
            { label: "提醒", value: detail.summary.warningCount }
          ]}
          blockers={[
            detail.root.recordStatus === "Draft" ? "已領號但尚未建立送審單" : "需確認送審、BOM 與審核關卡狀態",
            detail.summary.primaryManufacturingCount === 0 ? "尚未找到主要製造圖" : "主要製造圖可在下方圖號區檢查",
            detail.summary.warningCount > 0 ? `仍有 ${detail.summary.warningCount} 則提醒未收斂` : "目前沒有未確認提醒"
          ]}
          nextStep={detail.root.recordStatus === "Released" ? "若要改版，先進行 ECR / 影響分析，再建立新版送審。" : "RD 需接續送審或補齊缺口；主管核准後才會進入已發布。"}
          primaryAction={primaryAction}
          secondaryActions={[
            { href: "/numbering/tasks", label: "看待辦 / 草稿" },
            { href: "/numbering/impact", label: "製造圖影響分析" }
          ]}
        />

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>料號</h3>
          <div style={cardListStyle}>
            {detail.partNumbers.map((partNumber) => (
              <PartNumberCard partNumber={partNumber} detail={detail} key={partNumber.id} />
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>圖號</h3>
          <div style={cardListStyle}>
            {detail.drawingNumbers.map((drawingNumber) => (
              <DrawingNumberCard drawingNumber={drawingNumber} detail={detail} busy={busy} onAnalyzeImpact={onAnalyzeImpact} key={drawingNumber.id} />
            ))}
          </div>
        </section>

        <WarningsPanel warnings={detail.warnings} />
        <ImpactPanel impact={impact} />
        <AuditPanel auditTrail={detail.auditTrail} />
      </div>
    </section>
  );
}

function PartNumberCard({ partNumber, detail }: { partNumber: PartNumber; detail: RootDetail }) {
  const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
  const variants = detail.variants.filter((variant) => variant.partNumberId === partNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id && !warning.acknowledgedAt);
  const missingPrimaryMa = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && ["DVT", "Release"].includes(partNumber.developmentPhase) && !links.some((link) => link.linkType === "primary_manufacturing");
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{partNumber.partNumber}</strong>
        <StatusBadge status={partNumber.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{partNumber.partName}</div>
      <div style={metaRowStyle}>
        <span>{kindLabel(partNumber.itemKind)}</span>
        <span>{formatDevelopmentPhaseForUser(partNumber.developmentPhase)}</span>
        <span>{partNumber.isUniversal ? "共用件" : `序號 ${partNumber.sequenceCode}`}</span>
      </div>
      <div style={chipsStyle}>
        {links.map((link) => (
          <span style={chipStyle} key={link.id}>
            <Link2 size={13} />
            {link.drawingNumber}
          </span>
        ))}
      </div>
      <div style={actionGroupStyle}>
        {missingPrimaryMa ? <WarningDot title="DVT 或正式階段的自製、發包、客製件缺主要製造圖時會被關卡阻擋，需補圖或走 override。" /> : null}
        {partNumber.recordStatus === "MainDrawingInvalid" ? <WarningDot title="主要製造圖已失效，料號需重新送審並指定有效製造圖後才能恢復使用。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此料號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
      </div>
    </article>
  );
}

function DrawingNumberCard({
  drawingNumber,
  detail,
  busy,
  onAnalyzeImpact
}: {
  drawingNumber: DrawingNumber;
  detail: RootDetail;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
}) {
  const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
  const variants = detail.variants.filter((variant) => variant.drawingNumberId === drawingNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id && !warning.acknowledgedAt);
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{drawingNumber.drawingNumber}</strong>
        <StatusBadge status={drawingNumber.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}</div>
      <div style={metaRowStyle}>
        <span>{purposeLabel(drawingNumber.purposeCode)}</span>
        <span>{formatDevelopmentPhaseForUser(drawingNumber.developmentPhase)}</span>
        <span>{drawingNumber.isPrimaryManufacturing ? "主要製造圖" : "參考/其他"}</span>
      </div>
      <div style={chipsStyle}>
        {links.map((link) => (
          <span style={chipStyle} key={link.id}>
            <Link2 size={13} />
            {link.partNumber}
          </span>
        ))}
      </div>
      <div style={actionGroupStyle}>
        {isReferenceDrawingPurpose(drawingNumber.purposeCode) ? <WarningDot title="參考圖必填用途描述，且不可作為主要製造圖。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此圖號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.partNumber} ${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
        {isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? (
          <button className="secondary-button" type="button" disabled={busy === "impact"} onClick={() => onAnalyzeImpact(drawingNumber.drawingNumber)}>
            <ShieldAlert size={16} />
            影響範圍
          </button>
        ) : null}
      </div>
    </article>
  );
}

function WarningsPanel({ warnings }: { warnings: NumberingWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>提醒</h3>
      <div style={cardListStyle}>
        {warnings.map((warning) => (
          <div style={recordCardStyle} key={warning.id}>
            <div style={recordTitleStyle}>
              <strong>{warning.title}</strong>
              <span className="badge">{warningSeverityLabel(warning.severity)}</span>
            </div>
            <div style={mutedTextStyle}>{warning.message}</div>
            <small style={mutedTextStyle}>{warning.warningCode}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function warningSeverityLabel(severity: NumberingWarning["severity"]) {
  if (severity === "blocker") return "阻擋";
  if (severity === "warning") return "注意";
  return "提醒";
}

function ImpactPanel({ impact }: { impact: ImpactAnalysis | null }) {
  if (!impact) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>製造圖作廢影響</h3>
      <div style={recordCardStyle}>
        <div style={recordTitleStyle}>
          <strong>{impact.drawingNumber.drawingNumber}</strong>
          <span className="badge">影響分析</span>
        </div>
        <div style={metaRowStyle}>
          <span>受影響料號 {impact.impactedPartNumbers.length}</span>
          <span>需進版文件 {impact.requiredDocuments.length}</span>
        </div>
        <div style={chipsStyle}>
          {impact.impactedPartNumbers.map((partNumber) => (
            <span style={chipStyle} key={partNumber.id}>
              {partNumber.partNumber}
            </span>
          ))}
          {impact.requiredDocuments.map((documentName) => (
            <span style={chipStyle} key={documentName}>
              {documentName}
            </span>
          ))}
        </div>
        {impact.warnings.length > 0 ? <div style={mutedTextStyle}>{impact.warnings.join("、")}</div> : null}
      </div>
    </section>
  );
}

function AuditPanel({ auditTrail }: { auditTrail: NumberingAudit[] }) {
  if (auditTrail.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>近期異動</h3>
      <div style={cardListStyle}>
        {auditTrail.slice(0, 6).map((audit) => (
          <div style={auditRowStyle} key={audit.id}>
            <span>{audit.action}</span>
            <small style={mutedTextStyle}>{new Date(audit.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoMarkers({ result }: { result: SearchResult }) {
  const markers: string[] = [];
  if (result.warningCount > 0) markers.push(`${result.warningCount} 則未確認提醒`);
  if (result.recordStatus === "MainDrawingInvalid") markers.push("主要製造圖失效，需重新送審恢復");
  if (result.recordStatus === "PendingReview") markers.push("審核中，未核准前不可直接視為可用");
  if (result.entityType === "drawing_number" && isReferenceDrawingPurpose(result.purposeCode)) markers.push("參考圖不可作主要製造圖");
  if (markers.length === 0) return <span style={mutedTextStyle}>-</span>;
  return (
    <div style={actionGroupStyle}>
      {markers.map((marker) => (
        <WarningDot title={marker} key={marker} />
      ))}
    </div>
  );
}

function WarningDot({ title }: { title: string }) {
  return <RiskHint title={title} className="search-warning-marker" />;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="empty">
      <FileSearch size={24} />
      <p>{text}</p>
    </div>
  );
}

function AccessPanel() {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
        <h2>需要登入</h2>
        <p>請先登入後再使用圖料模組。</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
        <h2>圖料查詢暫時無法完成</h2>
        <p>{message} 現在請重試；若仍失敗，請放寬查詢條件或請 Admin 協助確認來源資料。</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            重試
          </button>
        </div>
      </div>
    </section>
  );
}

function entityLabel(entityType: SearchResult["entityType"]) {
  if (entityType === "part_root") return "料件";
  if (entityType === "part_number") return "料號";
  return "圖號";
}

function kindLabel(kind: SearchResult["itemKind"]) {
  const labels: Record<SearchResult["itemKind"], string> = {
    purchased: "外購",
    manufactured: "自製",
    outsourced: "發包",
    shared: "共用",
    custom: "客製"
  };
  return labels[kind] ?? kind;
}

function purposeLabel(purposeCode: DrawingPurposeCode) {
  return `${purposeCode} ${displayDrawingPurposeLabel(purposeCode)}`;
}

function resultRelation(result: SearchResult) {
  if (result.entityType === "part_root") return `${result.partCount} 料號 / ${result.drawingCount} 圖號`;
  if (result.entityType === "part_number") return result.primaryDrawingNumber ? `製造圖 ${result.primaryDrawingNumber}` : `${result.drawingCount} 張圖`;
  return `${result.linkedPartCount} 料號`;
}

function partSummary(result: SearchResult) {
  if (result.entityType === "drawing_number") return result.linkedPartCount > 0 ? `${result.linkedPartCount} 筆關聯料號` : "未關聯料號";
  if (result.entityType === "part_root") return result.partCount > 0 ? `${result.partCount} 筆料號` : "未建立料號";
  return "-";
}

const mutedTextStyle = { color: "var(--muted)" };
const linkButtonStyle = {
  border: 0,
  background: "transparent",
  padding: 0,
  color: "var(--accent)",
  fontWeight: 700,
  textAlign: "left" as const
};
const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap" as const
};
const detailBodyStyle = {
  display: "grid",
  gap: "1rem",
  padding: "16px"
};
const sectionStyle = {
  display: "grid",
  gap: "0.6rem",
  minWidth: 0
};
const sectionHeadingStyle = {
  margin: 0,
  fontSize: "15px"
};
const cardListStyle = {
  display: "grid",
  gap: "0.65rem"
};
const recordCardStyle = {
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "12px",
  display: "grid",
  gap: "0.55rem",
  minWidth: 0,
  background: "#fff"
};
const recordTitleStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  flexWrap: "wrap" as const
};
const metaRowStyle = {
  display: "flex",
  gap: "0.75rem",
  color: "var(--muted)",
  flexWrap: "wrap" as const
};
const chipsStyle = {
  display: "flex",
  gap: "0.4rem",
  flexWrap: "wrap" as const
};
const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "3px 8px",
  background: "var(--panel-2)",
  fontSize: "12px"
};
const auditRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  borderBottom: "1px solid var(--line)",
  paddingBottom: "0.5rem",
  flexWrap: "wrap" as const
};
