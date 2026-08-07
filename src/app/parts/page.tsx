"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, CheckCircle2, DollarSign, FileText, Link2, PackageSearch, Palette, RotateCcw, Save, Search, Workflow, X, XCircle } from "lucide-react";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { NextStepState } from "@/components/next-step-state";
import { PdmDetailDrawer } from "@/components/pdm-detail-drawer";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { NumberStateModuleTabs, NumberStateOwnerCreateAction, NumberStateWorkspaceWorkbench } from "@/components/number-state-workspace";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { formatStatusErrorForUser, formatStatusForUser, partRecordStatusFilterValues } from "@/lib/status-display";
import type { HumanStatusFilter, HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { AvailabilityScopeProjection } from "@/lib/availability-scope";

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
type PartVariant = {
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
};
type PartStandardCost = {
  profileName: string;
  costType: string;
  currency: string;
  uom: string;
  basisQty: number;
  unitCost: number | null;
};
type PartListRecord = {
  id: string;
  partRootId: string;
  rootCode: string;
  coreName: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  seriesCode: string | null;
  recordStatus: NumberingRecordStatus;
  variant: PartVariant | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  standardCost: PartStandardCost | null;
  pendingCostRequestCount: number;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
};
export type PartDetail = PartListRecord & {
  linkedDrawings: Array<{ id: string; drawingNumber: string; linkType: string }>;
  sameDrawingVariants: Array<{ id: string; drawingNumber: string; fieldName: string; fieldValue: string }>;
  costProfiles: Array<{
    id: string;
    costType: string;
    profileName: string;
    currency: string;
    uom: string;
    supplierName: string | null;
    processName: string | null;
    status: string;
    tiers: Array<{ id: string; minQty: number; maxQty: number | null; unitCost: number; setupCost: number; leadTimeDays: number | null }>;
  }>;
  costChangeRequests: Array<{
    id: string;
    proposedCostProfileId: string | null;
    requestType: string;
    reviewStatus: string;
    changeReason: string;
    requestedAt: string;
    reviewedAt: string | null;
    reviewComment: string | null;
  }>;
};
type SharedModelVersion = {
  id: string;
  sourceFileAssetId: string;
  modelRevision: string;
  contentHash: string;
  hashAlgorithm: string;
  status: string;
  releasedAt: string | null;
};
type SharedModelAttachmentOption = {
  id: string;
  documentCategory: string;
  displayName: string;
  fileName: string;
  revision: string | null;
  createdAt: string;
};
type RequiredMaPackage = {
  id: string;
  drawingNumberId: string;
  drawingNumber: string;
  revision: string;
  releasedAt: string | null;
};
type RequiredMaItem = {
  drawingNumberId: string;
  drawingNumber: string;
  latestReleasedPackage: RequiredMaPackage | null;
};
type RequiredMaResolverState = {
  required: RequiredMaItem[];
  missing: Array<{ drawingNumberId: string; drawingNumber: string; reason: string }>;
};
type ManufacturingBaselineDraftState = {
  id: string;
  baselineCode: string;
  baselineRevision: string;
  status: string;
};
export type PartDetailFocusSection = "cost" | null;
type ProductionSliceClientStatus = {
  configured: boolean;
  active: boolean;
  mode: string;
  unopenedMessage?: string;
};

const statuses = ["", ...partRecordStatusFilterValues] as const;
const itemKinds = ["", "purchased", "manufactured", "outsourced", "shared", "custom"] as const;
const humanStatusFilters: Array<{ value: HumanStatusFilter; label: string }> = [
  { value: "all", label: "全部狀態" },
  { value: "needs_action", label: "待我處理" },
  { value: "waiting", label: "等他人處理" },
  { value: "system", label: "系統處理中" },
  { value: "usable", label: "可使用" },
  { value: "history", label: "歷史" }
];
const PART_DRAWER_WIDTH_STORAGE_KEY = "pdm-part-detail-drawer-width";
const DETAIL_DRAWER_DEFAULT_WIDTH = 500;
const DETAIL_DRAWER_MIN_WIDTH = 380;
const DETAIL_DRAWER_MAX_WIDTH_RATIO = 0.72;
const defaultProductionSliceUnopenedMessage = "此功能未納入本次正式領號 / 保留號 production slice。";

const mutedStyle = { color: "var(--muted)" };

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

export default function PartsPage() {
  const [activeTab, setActiveTab] = useState<"official" | "reserved" | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesCodeOptions, setSeriesCodeOptions] = useState<string[]>([]);
  const [itemKind, setItemKind] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [humanStatus, setHumanStatus] = useState<HumanStatusFilter>("all");
  const [parts, setParts] = useState<PartListRecord[]>([]);
  const [selectedPartNumber, setSelectedPartNumber] = useState<string | null>(null);
  const selectedPartNumberRef = useRef<string | null>(null);
  const initialDetailPartNumberRef = useRef<string | null>(null);
  const initialDetailFocusRef = useRef<PartDetailFocusSection>(null);
  const partListRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailFocus, setDetailFocus] = useState<PartDetailFocusSection>(null);
  const [drawerWidth, setDrawerWidth] = useState(DETAIL_DRAWER_DEFAULT_WIDTH);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const productionSliceEnforced = productionSlice?.configured === true;
  const productionSliceUnopenedMessage = productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    setActiveTab(tab === "drafts" || tab === "reserved" ? "reserved" : "official");
    const initialQuery = params.get("query")?.trim();
    const initialHumanStatus = params.get("humanStatus") as HumanStatusFilter | null;
    const detailPartNumber = params.get("detail")?.trim();
    const focusSection = params.get("focus")?.trim();
    if (initialQuery) setQuery(initialQuery);
    if (initialHumanStatus && humanStatusFilters.some((option) => option.value === initialHumanStatus)) setHumanStatus(initialHumanStatus);
    if (detailPartNumber) initialDetailPartNumberRef.current = detailPartNumber;
    if (focusSection === "cost") initialDetailFocusRef.current = "cost";
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/production-slice/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: ProductionSliceClientStatus | null) => {
        if (!cancelled && body?.configured) setProductionSlice(body);
      })
      .catch(() => {
        if (!cancelled) setProductionSlice(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadParts = useCallback(async () => {
    if (activeTab !== "official") return;
    setState("loading");
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (seriesCode) params.set("seriesCode", seriesCode);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (humanStatus !== "all") params.set("humanStatus", humanStatus);
    const response = await fetch(`/api/parts?${params.toString()}`);
    if (response.status === 401 || response.status === 403) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "料號清單讀取失敗", "masterRecord"));
      setState("error");
      return;
    }
    const nextParts = (body.parts ?? []) as PartListRecord[];
    setSeriesCodeOptions((body.seriesCodeOptions ?? []) as string[]);
    const currentSelection = selectedPartNumberRef.current;
    const nextSelection = currentSelection && nextParts.some((part) => part.partNumber === currentSelection) ? currentSelection : null;
    setParts(nextParts);
    selectedPartNumberRef.current = nextSelection;
    setSelectedPartNumber(nextSelection);
    if (!nextSelection) {
      setDetail(null);
      setIsDetailOpen(false);
    }
    setState("ready");
  }, [activeTab, humanStatus, query, recordStatus, seriesCode]);

  const loadDetail = useCallback(async (partNumber: string | null) => {
    if (!partNumber) {
      setDetail(null);
      return;
    }
    const response = await fetch(`/api/parts/${encodeURIComponent(partNumber)}`);
    const body = await response.json().catch(() => ({}));
    if (selectedPartNumberRef.current !== partNumber) return;
    if (response.ok) {
      setDetail(body.part);
    } else {
      setError(formatStatusErrorForUser(body.error ?? "料號明細讀取失敗", "masterRecord"));
      setState("error");
    }
  }, []);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  const visibleParts = useMemo(() => (itemKind ? parts.filter((part) => part.itemKind === itemKind) : parts), [itemKind, parts]);
  const selectedPartIsVisible = selectedPartNumber ? visibleParts.some((part) => part.partNumber === selectedPartNumber) : false;

  useEffect(() => {
    if (state !== "ready") return;
    if (visibleParts.length === 0 || !selectedPartNumber || !selectedPartIsVisible) {
      selectedPartNumberRef.current = null;
      setSelectedPartNumber(null);
      setDetail(null);
      setIsDetailOpen(false);
      return;
    }
  }, [selectedPartIsVisible, selectedPartNumber, state, visibleParts]);

  const focusPartList = useCallback(() => {
    requestAnimationFrame(() => partListRef.current?.focus({ preventScroll: true }));
  }, []);

  const scrollPartRowIntoView = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const rows = partListRef.current?.querySelectorAll<HTMLTableRowElement>("[data-part-row='true']");
      rows?.[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const selectPartAt = useCallback(
    (index: number) => {
      if (visibleParts.length === 0) return;
      const nextIndex = Math.min(Math.max(index, 0), visibleParts.length - 1);
      const part = visibleParts[nextIndex];
      const previousPartNumber = selectedPartNumberRef.current;
      selectedPartNumberRef.current = part.partNumber;
      setSelectedPartNumber(part.partNumber);
      scrollPartRowIntoView(nextIndex);
      focusPartList();
      if (isDetailOpen) {
        if (previousPartNumber !== part.partNumber) setDetail(null);
        setDetailFocus(null);
        void loadDetail(part.partNumber);
      }
    },
    [focusPartList, isDetailOpen, loadDetail, scrollPartRowIntoView, visibleParts]
  );

  const movePartSelection = useCallback(
    (delta: number) => {
      if (visibleParts.length === 0) return;
      const currentIndex = visibleParts.findIndex((part) => part.partNumber === selectedPartNumberRef.current);
      const fallbackIndex = delta > 0 ? 0 : visibleParts.length - 1;
      selectPartAt(currentIndex === -1 ? fallbackIndex : currentIndex + delta);
    },
    [selectPartAt, visibleParts]
  );

  const getKeyboardPageStep = useCallback(() => {
    const listElement = partListRef.current;
    const firstRow = listElement?.querySelector<HTMLTableRowElement>("[data-part-row='true']");
    if (!listElement || !firstRow) return 8;
    return Math.max(1, Math.floor(listElement.clientHeight / Math.max(firstRow.getBoundingClientRect().height, 1)) - 1);
  }, []);

  async function refreshSelected() {
    await loadParts();
    await loadDetail(selectedPartNumber);
  }

  const openPartDetail = useCallback(
    (partNumber: string, focusSection: PartDetailFocusSection = null) => {
      selectedPartNumberRef.current = partNumber;
      setSelectedPartNumber(partNumber);
      setDetail((currentDetail) => (currentDetail?.partNumber === partNumber ? currentDetail : null));
      setIsDetailOpen(true);
      setDetailFocus(focusSection);
      void loadDetail(partNumber);
      focusPartList();
    },
    [focusPartList, loadDetail]
  );

  useEffect(() => {
    if (state !== "ready") return;
    const detailPartNumber = initialDetailPartNumberRef.current;
    if (!detailPartNumber) return;
    if (!visibleParts.some((part) => part.partNumber === detailPartNumber)) return;
    initialDetailPartNumberRef.current = null;
    const focusSection = initialDetailFocusRef.current;
    initialDetailFocusRef.current = null;
    openPartDetail(detailPartNumber, focusSection);
  }, [openPartDetail, state, visibleParts]);

  const openSelectedPartDetail = useCallback(() => {
    if (visibleParts.length === 0) return;
    const currentIndex = visibleParts.findIndex((part) => part.partNumber === selectedPartNumberRef.current);
    const part = visibleParts[currentIndex === -1 ? 0 : currentIndex];
    openPartDetail(part.partNumber);
  }, [openPartDetail, visibleParts]);

  const copySelectedPartNumber = useCallback(async () => {
    const partNumber = selectedPartNumberRef.current;
    if (!partNumber) return;
    await copyTextToClipboard(partNumber);
  }, []);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(PART_DRAWER_WIDTH_STORAGE_KEY);
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : Number.NaN;
    if (!Number.isFinite(parsedWidth)) return;
    const nextWidth = clampDetailDrawerWidth(parsedWidth, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(PART_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  const resizeDetailDrawer = useCallback((clientX: number) => {
    const nextWidth = clampDetailDrawerWidth(window.innerWidth - clientX, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(PART_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setDrawerWidth((currentWidth) => {
        const nextWidth = clampDetailDrawerWidth(currentWidth, window.innerWidth);
        window.localStorage.setItem(PART_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
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

  useEffect(() => {
    if (!isDetailOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-part-row='true']")) return;
      setIsDetailOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDetailOpen]);

  useEffect(() => {
    if (state !== "ready" || visibleParts.length === 0) return;

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isEditableShortcutTarget(event.target)) return;

      const target = event.target;
      const isListFocus = target instanceof Node && Boolean(partListRef.current?.contains(target));
      const isBodyFocus = target === document.body || target === document.documentElement;
      const allowListShortcut = isListFocus || isBodyFocus;

      if (event.key === "Escape" && isDetailOpen) {
        event.preventDefault();
        setIsDetailOpen(false);
        focusPartList();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (!allowListShortcut || hasSelectedText()) return;
        event.preventDefault();
        void copySelectedPartNumber();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!allowListShortcut) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          movePartSelection(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          movePartSelection(1);
          break;
        case "Enter":
          event.preventDefault();
          openSelectedPartDetail();
          break;
        case "PageUp":
          event.preventDefault();
          movePartSelection(-getKeyboardPageStep());
          break;
        case "PageDown":
          event.preventDefault();
          movePartSelection(getKeyboardPageStep());
          break;
        case "Home":
          event.preventDefault();
          selectPartAt(0);
          break;
        case "End":
          event.preventDefault();
          selectPartAt(visibleParts.length - 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    copySelectedPartNumber,
    focusPartList,
    getKeyboardPageStep,
    isDetailOpen,
    movePartSelection,
    openSelectedPartDetail,
    selectPartAt,
    state,
    visibleParts.length
  ]);

  if (activeTab === null) return <section className="panel"><div className="empty">正在開啟料號模組...</div></section>;
  if (activeTab === "reserved") return <NumberStateWorkspaceWorkbench module="parts" />;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>料號模組</h1>
          <p>以主根號自動串聯圖號與料號，材質、顏色與成本都以料號為主體管理。</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={refreshSelected}>
            <RotateCcw size={16} />
            重新整理
          </button>
          <NumberStateOwnerCreateAction surface="parts" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>
      <NumberStateModuleTabs module="parts" active="official" />

      {state === "unauthorized" ? <section className="panel"><div className="empty">沒有料號模組檢視權限。</div></section> : null}
      {state === "error" ? (
        <section className="panel">
          <NextStepState
            eyebrow="重新嘗試"
            title="料號資料暫時無法讀取"
            body={`${error} 現在請重試或回圖料模組重新定位來源資料；若仍失敗，請 Admin 協助確認。`}
            actions={[
              { href: "/parts", label: "重新整理", variant: "primary" },
              { href: "/numbering/search", label: "回圖料模組" }
            ]}
          />
        </section>
      ) : null}
      {state === "loading" ? <section className="panel"><div className="empty">正在讀取料號資料...</div></section> : null}
      {state === "ready" ? (
        <div className="pdm-master-workbench">
          <section className="panel pdm-master-toolbar pdm-drawing-toolbar">
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} placeholder="料號、主根號、名稱、材質、顏色" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <FilterSelectField label="系列代號" value={seriesCode} onChange={setSeriesCode} options={["", ...seriesCodeOptions]} allLabel="全部系列代號" />
              <FilterSelectField label="類型" value={itemKind} onChange={setItemKind} options={itemKinds} />
              <FilterSelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />
              <label className="pdm-master-field">
                <span>工作狀態</span>
                <select value={humanStatus} onChange={(event) => setHumanStatus(event.target.value as HumanStatusFilter)}>
                  {humanStatusFilters.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button className="primary-button pdm-master-filter-action" type="button" onClick={loadParts}>
                <PackageSearch size={16} />
                查詢
              </button>
            </div>
          </section>

          <div className="pdm-drawing-list-layout">
            <PartList parts={visibleParts} selectedPartNumber={selectedPartNumber} listRef={partListRef} onSelect={openPartDetail} />
          </div>
          <PartDetailDrawer
            detail={detail}
            busy={busy}
            open={isDetailOpen && selectedPartIsVisible}
            width={drawerWidth}
            focusSection={detailFocus}
            productionSliceEnforced={productionSliceEnforced}
            productionSliceUnopenedMessage={productionSliceUnopenedMessage}
            setBusy={setBusy}
            onUpdated={refreshSelected}
            onStartResize={startDetailDrawerResize}
            onClose={() => {
              setIsDetailOpen(false);
              setDetailFocus(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function PartList({
  parts,
  selectedPartNumber,
  listRef,
  onSelect
}: {
  parts: PartListRecord[];
  selectedPartNumber: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  onSelect: (partNumber: string) => void;
}) {
  if (parts.length === 0) {
    return (
      <section className="panel pdm-master-table-panel">
        <NextStepState
          eyebrow="查無結果"
          title="目前沒有符合條件的料號"
          body="現在請先清除或放寬篩選條件。若料號尚未建立，請改到保留號建立來源資料。"
          actions={[
            { href: "/parts", label: "重新查詢", variant: "primary" },
            { href: "/parts?tab=drafts", label: "建立保留號" }
          ]}
        />
      </section>
    );
  }
  return (
    <section className="panel pdm-master-table-panel">
      <div
        ref={listRef}
        className="table-wrap pdm-identity-scroll"
        role="region"
        aria-label="料號模組清單（可用上下鍵快速查閱）"
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
              <th>料號</th>
              <th>名稱</th>
              <th>關聯摘要</th>
              <th>
                <StatusColumnHeader label="資料狀態 / 提醒" context="masterRecord" />
              </th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr
                data-part-row="true"
                className={selectedPartNumber === part.partNumber ? "selected-row" : undefined}
                key={part.id}
                onClick={() => onSelect(part.partNumber)}
                style={{ cursor: "pointer" }}
              >
                <td data-label="料號">
                  <div className="pdm-identity-code">{part.partNumber}</div>
                </td>
                <td data-label="名稱">
                  <div className="pdm-identity-name" title={part.partName}>
                    {part.partName}
                  </div>
                </td>
                <td data-label="關聯摘要">
                  <div className="pdm-identity-code">{part.primaryDrawingNumber ?? "未關聯圖號"}</div>
                  {part.drawingCount > 1 ? <small className="pdm-identity-subline">共 {part.drawingCount} 張圖號</small> : null}
                  {part.variant ? <small className="pdm-identity-subline">{variantLabel(part.variant)}</small> : null}
                </td>
                <td data-label="資料狀態 / 提醒">
                  <div className="pdm-meta-strip">
                    <HumanStatusBadge status={part.humanStatus} viewerStatus={part.viewerStatus} availabilityScope={part.availabilityScope} />
                    {part.standardCost ? <span className="pdm-meta-text">{standardCostChipLabel(part.standardCost)}</span> : null}
                    {part.pendingCostRequestCount > 0 ? <span className="pdm-meta-text">成本審核中 {part.pendingCostRequestCount}</span> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PartDetailDrawer({
  detail,
  busy,
  open,
  width,
  focusSection,
  productionSliceEnforced,
  productionSliceUnopenedMessage,
  setBusy,
  onUpdated,
  onStartResize,
  onClose
}: {
  detail: PartDetail | null;
  busy: boolean;
  open: boolean;
  width: number;
  focusSection: PartDetailFocusSection;
  productionSliceEnforced: boolean;
  productionSliceUnopenedMessage: string;
  setBusy: (value: boolean) => void;
  onUpdated: () => Promise<void>;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <PdmDetailDrawer
      open
      width={width}
      ariaLabel="料號明細"
      resizeLabel="調整料號明細寬度"
      onClose={onClose}
      onStartResize={onStartResize}
    >
      <div className="drawing-workbench-drawer-header">
        <div className="drawing-workbench-drawer-identity">
          <HumanStatusBadge status={detail?.humanStatus} viewerStatus={detail?.viewerStatus} availabilityScope={detail?.availabilityScope} />
          <div><h2>{detail?.partNumber ?? "料號明細"}</h2><p>{detail?.partName ?? ""}</p></div>
        </div>
        <div className="drawing-workbench-drawer-header-actions">
          <button className="icon-button" type="button" aria-label="關閉料號明細" onClick={onClose}><X size={20} /></button>
        </div>
      </div>
      <div className="drawing-workbench-drawer-body" data-detail-target="part_number" data-detail-code={detail?.partNumber ?? ""} data-entity-type="part_number" data-entity-code={detail?.partNumber ?? ""} data-source-context="parts">
        {detail ? (
          <PartDetailPanel
            detail={detail}
            busy={busy}
            focusSection={focusSection}
            productionSliceEnforced={productionSliceEnforced}
            productionSliceUnopenedMessage={productionSliceUnopenedMessage}
            setBusy={setBusy}
            onUpdated={onUpdated}
          />
        ) : (
          <section className="panel pdm-master-detail-panel">
            <div className="empty">正在載入料號明細...</div>
          </section>
        )}
      </div>
    </PdmDetailDrawer>
  );
}

export function PartDetailPanel({
  detail,
  busy,
  focusSection,
  productionSliceEnforced,
  productionSliceUnopenedMessage,
  showIdentityHeader = true,
  setBusy,
  onUpdated
}: {
  detail: PartDetail;
  busy: boolean;
  focusSection: PartDetailFocusSection;
  productionSliceEnforced: boolean;
  productionSliceUnopenedMessage: string;
  showIdentityHeader?: boolean;
  setBusy: (value: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const costSectionRef = useRef<HTMLElement | null>(null);
  const shared3dSectionRef = useRef<HTMLDivElement | null>(null);
  const [variantForm, setVariantForm] = useState(() => ({
    materialLabel: detail.variant?.materialLabel ?? "",
    colorLabel: detail.variant?.colorLabel ?? "",
    surfaceTreatment: detail.variant?.surfaceTreatment ?? "",
    variantNote: detail.variant?.variantNote ?? ""
  }));
  const [costForm, setCostForm] = useState(() => ({
    profileName: "",
    costType: "outsourced",
    supplierName: "",
    processName: "",
    unitCost: "",
    minQty: "1",
    setupCost: "0"
  }));

  useEffect(() => {
    setVariantForm({
      materialLabel: detail.variant?.materialLabel ?? "",
      colorLabel: detail.variant?.colorLabel ?? "",
      surfaceTreatment: detail.variant?.surfaceTreatment ?? "",
      variantNote: detail.variant?.variantNote ?? ""
    });
  }, [detail.id, detail.variant]);

  useEffect(() => {
    if (focusSection !== "cost") return;
    requestAnimationFrame(() => {
      costSectionRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
      costSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }, [detail.partNumber, focusSection]);

  async function saveVariant() {
    if (productionSliceEnforced) return;
    setBusy(true);
    await fetch(`/api/parts/${encodeURIComponent(detail.partNumber)}/variant`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(variantForm)
    });
    setBusy(false);
    await onUpdated();
  }

  async function createCostProfile() {
    if (productionSliceEnforced) return;
    setBusy(true);
    await fetch(`/api/parts/${encodeURIComponent(detail.partNumber)}/cost-profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...costForm,
        tiers: [{ minQty: Number(costForm.minQty), unitCost: Number(costForm.unitCost), setupCost: Number(costForm.setupCost) }]
      })
    });
    setBusy(false);
    setCostForm({ profileName: "", costType: "outsourced", supplierName: "", processName: "", unitCost: "", minQty: "1", setupCost: "0" });
    await onUpdated();
  }

  async function decideCostRequest(requestId: string, decision: "approve" | "reject") {
    if (productionSliceEnforced) return;
    setBusy(true);
    await fetch(`/api/parts/${encodeURIComponent(detail.partNumber)}/cost-change-requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        basisQty: 1,
        reviewComment: decision === "approve" ? "主管核准成本設定並設為標準成本。" : "主管退回成本設定。"
      })
    });
    setBusy(false);
    await onUpdated();
  }

  return (
    <div className="pdm-master-detail-panel pdm-master-detail-stack">
      <PartDetailHero
        detail={detail}
        productionSliceEnforced={productionSliceEnforced}
        productionSliceUnopenedMessage={productionSliceUnopenedMessage}
        showIdentityHeader={showIdentityHeader}
        onOpenCost={() => costSectionRef.current?.scrollIntoView({ block: "start", inline: "nearest" })}
        onOpenShared3d={() => shared3dSectionRef.current?.scrollIntoView({ block: "start", inline: "nearest" })}
      />

      <MasterAttachmentPanel entityType="part_number" entityCode={detail.partNumber} productionSliceEnforced={productionSliceEnforced} productionSliceUnopenedMessage={productionSliceUnopenedMessage} />

      <PartReadinessPanel detail={detail} />

      <PartLinkedDrawingsPanel detail={detail} />

      <section className="panel">
        <div className="panel-header">
          <h2>料號變體</h2>
          <button
            className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
            type="button"
            disabled={busy || productionSliceEnforced}
            onClick={saveVariant}
            title={productionSliceEnforced ? productionSliceUnavailableTitle("儲存", productionSliceUnopenedMessage) : "儲存料號變體"}
            aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("儲存", productionSliceUnopenedMessage) : "儲存料號變體"}
            data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
          >
            <Save size={16} />
            儲存
            {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
          </button>
        </div>
        <div style={formGridStyle}>
          <TextField label="材質" value={variantForm.materialLabel} onChange={(value) => setVariantForm((form) => ({ ...form, materialLabel: value }))} disabled={productionSliceEnforced} />
          <TextField label="顏色" value={variantForm.colorLabel} onChange={(value) => setVariantForm((form) => ({ ...form, colorLabel: value }))} disabled={productionSliceEnforced} />
          <TextField label="表面處理" value={variantForm.surfaceTreatment} onChange={(value) => setVariantForm((form) => ({ ...form, surfaceTreatment: value }))} disabled={productionSliceEnforced} />
          <TextField label="差異說明" value={variantForm.variantNote} onChange={(value) => setVariantForm((form) => ({ ...form, variantNote: value }))} disabled={productionSliceEnforced} />
        </div>
      </section>

      <div ref={shared3dSectionRef}>
        <Shared3dBaselinePanel partNumber={detail.partNumber} rootCode={detail.rootCode} productionSliceEnforced={productionSliceEnforced} productionSliceUnopenedMessage={productionSliceUnopenedMessage} />
      </div>

      <section className="panel" ref={costSectionRef} style={focusSection === "cost" ? focusPanelStyle : undefined}>
        <div className="panel-header">
          <div>
            <h2>成本設定檔</h2>
            {focusSection === "cost" ? <p style={mutedStyle}>填成本名稱與單價後，按新增送審。</p> : null}
          </div>
          <button
            className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
            type="button"
            disabled={busy || productionSliceEnforced || !costForm.profileName || !costForm.unitCost}
            onClick={createCostProfile}
            title={productionSliceEnforced ? productionSliceUnavailableTitle("新增送審", productionSliceUnopenedMessage) : "新增成本送審"}
            aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("新增送審", productionSliceUnopenedMessage) : "新增成本送審"}
            data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
          >
            <DollarSign size={16} />
            新增送審
            {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
          </button>
        </div>
        <div style={formGridStyle}>
          <TextField label="成本名稱" value={costForm.profileName} onChange={(value) => setCostForm((form) => ({ ...form, profileName: value }))} disabled={productionSliceEnforced} />
          <label style={fieldStyle}>
            <span>成本類型</span>
            <select className="dropdown-select" value={costForm.costType} disabled={productionSliceEnforced} onChange={(event) => setCostForm((form) => ({ ...form, costType: event.target.value }))}>
              <option value="outsourced">委外加工</option>
              <option value="in_house">自行製作</option>
              <option value="purchase">採購</option>
              <option value="trial">試作</option>
              <option value="other">其他</option>
            </select>
          </label>
          <TextField label="供應商" value={costForm.supplierName} onChange={(value) => setCostForm((form) => ({ ...form, supplierName: value }))} disabled={productionSliceEnforced} />
          <TextField label="製程" value={costForm.processName} onChange={(value) => setCostForm((form) => ({ ...form, processName: value }))} disabled={productionSliceEnforced} />
          <TextField label="最小數量" value={costForm.minQty} onChange={(value) => setCostForm((form) => ({ ...form, minQty: value }))} disabled={productionSliceEnforced} />
          <TextField label="單價" value={costForm.unitCost} onChange={(value) => setCostForm((form) => ({ ...form, unitCost: value }))} disabled={productionSliceEnforced} />
          <TextField label="設定費" value={costForm.setupCost} onChange={(value) => setCostForm((form) => ({ ...form, setupCost: value }))} disabled={productionSliceEnforced} />
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>名稱</th>
                <th>類型</th>
                <th>
                  <StatusColumnHeader context="cost" />
                </th>
                <th>級距</th>
              </tr>
            </thead>
            <tbody>
              {detail.costProfiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.profileName}</td>
                  <td>{costTypeLabel(profile.costType)}</td>
                  <td>
                    <StatusBadge status={profile.status} context="cost" />
                  </td>
                  <td>{profile.tiers.map((tier) => `${tier.minQty}${tier.maxQty ? `-${tier.maxQty}` : "+"}: ${profile.currency} ${formatNumber(tier.unitCost)}`).join("、")}</td>
                </tr>
              ))}
              {detail.costProfiles.length === 0 ? (
                <tr>
                  <td colSpan={4} style={mutedStyle}>尚未建立成本設定檔。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>成本審核</h2>
            <p style={mutedStyle}>採購送審後，主管核准才會成為標準成本。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>類型</th>
                <th>
                  <StatusColumnHeader context="cost" />
                </th>
                <th>原因</th>
                <th>送審時間</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {detail.costChangeRequests.map((request) => (
                <tr key={request.id}>
                  <td>{costRequestTypeLabel(request.requestType)}</td>
                  <td>
                    <StatusBadge status={request.reviewStatus} context="cost" />
                  </td>
                  <td>{request.changeReason}</td>
                  <td>{formatDateTime(request.requestedAt)}</td>
                  <td>
                    {request.reviewStatus === "pending" ? (
                      <div style={inlineButtonRowStyle}>
                        <button
                          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                          type="button"
                          disabled={busy || productionSliceEnforced}
                          onClick={() => decideCostRequest(request.id, "approve")}
                          title={productionSliceEnforced ? productionSliceUnavailableTitle("核准", productionSliceUnopenedMessage) : "核准成本設定"}
                          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("核准", productionSliceUnopenedMessage) : "核准成本設定"}
                          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                        >
                          <CheckCircle2 size={16} />
                          核准
                          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
                        </button>
                        <button
                          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                          type="button"
                          disabled={busy || productionSliceEnforced}
                          onClick={() => decideCostRequest(request.id, "reject")}
                          title={productionSliceEnforced ? productionSliceUnavailableTitle("退回", productionSliceUnopenedMessage) : "退回成本設定"}
                          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("退回", productionSliceUnopenedMessage) : "退回成本設定"}
                          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                        >
                          <XCircle size={16} />
                          退回
                          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
                        </button>
                      </div>
                    ) : (
                      request.reviewComment ?? "-"
                    )}
                  </td>
                </tr>
              ))}
              {detail.costChangeRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} style={mutedStyle}>目前沒有成本審核紀錄。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <NumberingContextualEntrypoints
        mode="part"
        rootId={detail.partRootId}
        rootCode={detail.rootCode}
        coreName={detail.partName}
        rootRecordStatus={detail.recordStatus}
        part={{
          id: detail.id,
          partNumber: detail.partNumber,
          partName: detail.partName,
          recordStatus: detail.recordStatus,
          linkedDrawingNumbers: detail.linkedDrawings.map((link) => link.drawingNumber)
        }}
        onChanged={onUpdated}
      />
    </div>
  );
}

function productionSliceUnavailableTitle(label: string, message: string) {
  return `${label}：未開放。${message}`;
}

function ProductionSliceUnopenedBadge() {
  return <span className="nav-unopened-badge">未開放</span>;
}

function ProductionSliceUnopenedButton({
  children,
  className,
  label,
  message
}: {
  children: ReactNode;
  className: string;
  label: string;
  message: string;
}) {
  const title = productionSliceUnavailableTitle(label, message);
  return (
    <button
      className={`${className} production-slice-unopened`}
      type="button"
      disabled
      title={title}
      aria-label={title}
      data-production-slice-unopened="true"
    >
      {children}
      <ProductionSliceUnopenedBadge />
    </button>
  );
}

function PartDetailHero({
  detail,
  productionSliceEnforced,
  productionSliceUnopenedMessage,
  showIdentityHeader,
  onOpenCost,
  onOpenShared3d
}: {
  detail: PartDetail;
  productionSliceEnforced: boolean;
  productionSliceUnopenedMessage: string;
  showIdentityHeader: boolean;
  onOpenCost: () => void;
  onOpenShared3d: () => void;
}) {
  const primaryDrawingNumber = detail.primaryDrawingNumber ?? detail.linkedDrawings.find((link) => link.linkType === "primary_manufacturing")?.drawingNumber ?? "";
  return (
    <section className="panel drawing-detail-hero" data-part-detail-section="hero">
      {showIdentityHeader ? (
        <div className="drawing-detail-hero-header">
          <div>
            <h2>{detail.partNumber}</h2>
            <p style={mutedStyle}>{detail.rootCode} / {detail.partName}</p>
          </div>
        </div>
      ) : null}
      <div className="drawing-detail-hero-meta">
        <span className="pdm-meta-chip">{partKindLabel(detail.itemKind)}</span>
        {detail.seriesCode ? <span className="pdm-meta-chip">系列 {detail.seriesCode}</span> : null}
        <span className="pdm-meta-chip">關聯圖號 {detail.linkedDrawings.length}</span>
      </div>
      <div className="drawing-detail-action-row">
        {primaryDrawingNumber ? productionSliceEnforced ? (
          <ProductionSliceUnopenedButton className="primary-button" label="送審製造圖" message={productionSliceUnopenedMessage}>
            <FileText size={16} />
            送審製造圖
          </ProductionSliceUnopenedButton>
        ) : (
          <a className="primary-button" href={`/drawings/${encodeURIComponent(primaryDrawingNumber)}/submission-workbench`}>
            <FileText size={16} />
            送審製造圖
          </a>
        ) : (
          <a className="primary-button" href={`/numbering/search?query=${encodeURIComponent(detail.partNumber)}&entityType=part_number`}>
            <Link2 size={16} />
            補關聯
          </a>
        )}
        <a className="secondary-button" href={`/numbering/search?query=${encodeURIComponent(detail.partNumber)}&entityType=part_number`}>
          <Search size={16} />
          追溯
        </a>
        <button
          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced}
          onClick={onOpenShared3d}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("3D 基準", productionSliceUnopenedMessage) : "開啟 3D 基準"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("3D 基準", productionSliceUnopenedMessage) : "開啟 3D 基準"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          <Workflow size={16} />
          3D 基準
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
        <button
          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced}
          onClick={onOpenCost}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("成本", productionSliceUnopenedMessage) : "開啟成本設定檔"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("成本", productionSliceUnopenedMessage) : "開啟成本設定檔"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          <DollarSign size={16} />
          成本
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
      </div>
      <div style={detailGridStyle}>
        <InfoBlock icon={<Link2 size={16} />} title="圖號關聯" value={detail.linkedDrawings.length ? detail.linkedDrawings.map((link) => `${link.drawingNumber}（${linkTypeLabel(link.linkType)}）`).join("、") : "尚未關聯圖號"} />
        <InfoBlock icon={<Palette size={16} />} title="變體差異" value={variantLabel(detail.variant)} />
        <InfoBlock icon={<DollarSign size={16} />} title="標準成本" value={standardCostLabel(detail.standardCost)} />
        <InfoBlock icon={<FileText size={16} />} title="同圖差異欄位" value={detail.sameDrawingVariants.length ? detail.sameDrawingVariants.map((item) => `${item.fieldName}=${item.fieldValue}`).join("、") : "無"} />
      </div>
    </section>
  );
}

function PartReadinessPanel({ detail }: { detail: PartDetail }) {
  const hasManufacturingDrawing = detail.linkedDrawings.some((link) => link.linkType === "primary_manufacturing");
  const hasVariantBasics = Boolean((detail.variant?.materialLabel || detail.variant?.materialCode)?.trim()) && Boolean(detail.variant?.surfaceTreatment?.trim());
  const hasStandardCost = Boolean(detail.standardCost);
  const pendingCostCount = detail.pendingCostRequestCount || detail.costChangeRequests.filter((request) => request.reviewStatus === "pending").length;
  const nextStep = !hasManufacturingDrawing
    ? "先建立製造圖關聯，再進行送審或製造基準確認。"
    : !hasVariantBasics
      ? "先補齊材質與表面處理，避免同圖多料號差異不清。"
      : !hasStandardCost
        ? "先補標準成本，讓採購與主管能完成成本審核。"
        : pendingCostCount > 0
          ? "等待成本審核完成；其餘主資料可先確認附件與 3D 基準。"
          : "主資料狀態可用，接著確認附件、3D 基準與後續送審。";

  return (
    <section className="panel" data-part-detail-section="readiness">
      <div className="panel-header">
        <div>
          <h2>料號完整度檢查</h2>
          <p style={mutedStyle}>{nextStep}</p>
        </div>
      </div>
      <div style={detailGridStyle}>
        <InfoBlock icon={<Link2 size={16} />} title="製造圖關聯" value={hasManufacturingDrawing ? "已建立製造基準關聯" : "尚未建立製造基準關聯"} />
        <InfoBlock icon={<Palette size={16} />} title="料號屬性" value={hasVariantBasics ? variantLabel(detail.variant) : "材質或表面處理待補"} />
        <InfoBlock icon={<DollarSign size={16} />} title="標準成本" value={standardCostLabel(detail.standardCost)} />
        <InfoBlock icon={<FileText size={16} />} title="成本審核" value={pendingCostCount > 0 ? `${pendingCostCount} 筆待審` : "目前無待審成本"} />
      </div>
    </section>
  );
}

function PartLinkedDrawingsPanel({ detail }: { detail: PartDetail }) {
  return (
    <section className="panel" data-part-detail-section="linked-drawings">
      <div className="panel-header">
        <div>
          <h2>圖號關聯</h2>
          <p style={mutedStyle}>{detail.linkedDrawings.length > 0 ? `${detail.linkedDrawings.length} 張圖號連到此料號。` : "此料號尚未關聯圖號。"}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>圖號</th>
              <th>關係</th>
              <th>處理</th>
            </tr>
          </thead>
          <tbody>
            {detail.linkedDrawings.map((link) => (
              <tr key={link.id}>
                <td>{link.drawingNumber}</td>
                <td>{linkTypeLabel(link.linkType)}</td>
                <td>{link.linkType === "primary_manufacturing" ? "製造基準" : "參考"}</td>
              </tr>
            ))}
            {detail.linkedDrawings.length === 0 ? (
              <tr>
                <td colSpan={3} style={mutedStyle}>尚未建立圖號關聯。請先從圖料模組或新增相關資料建立關係。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Shared3dBaselinePanel({
  partNumber,
  rootCode,
  productionSliceEnforced,
  productionSliceUnopenedMessage
}: {
  partNumber: string;
  rootCode: string;
  productionSliceEnforced: boolean;
  productionSliceUnopenedMessage: string;
}) {
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [models, setModels] = useState<SharedModelVersion[]>([]);
  const [attachments, setAttachments] = useState<SharedModelAttachmentOption[]>([]);
  const [resolver, setResolver] = useState<RequiredMaResolverState | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelRevision, setModelRevision] = useState("");
  const [baselineRevision, setBaselineRevision] = useState("1");
  const [twoDOnlyReasonByDrawing, setTwoDOnlyReasonByDrawing] = useState<Record<string, string>>({});
  const [draftBaseline, setDraftBaseline] = useState<ManufacturingBaselineDraftState | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) ?? null, [models, selectedModelId]);
  const releasedModels = useMemo(() => models.filter((model) => model.status === "Released"), [models]);
  const requiredMaWithPackage = resolver?.required.filter((item) => item.latestReleasedPackage) ?? [];
  const requiredMissingCount = resolver?.missing.length ?? 0;

  const loadShared3dState = useCallback(async () => {
    if (productionSliceEnforced) {
      setModels([]);
      setAttachments([]);
      setResolver(null);
      setSelectedModelId("");
      setSelectedAttachmentId("");
      setMessage(null);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const modelsResponse = await fetch(`/api/parts/${encodeURIComponent(partNumber)}/shared-models`);
      const modelsBody = await modelsResponse.json().catch(() => ({}));
      if (!modelsResponse.ok) throw new Error(shared3dErrorMessage(modelsBody, "共用 3D 清單讀取失敗"));

      const attachmentsResponse = await fetch(`/api/parts/${encodeURIComponent(partNumber)}/attachments`);
      const attachmentsBody = await attachmentsResponse.json().catch(() => ({}));
      if (!attachmentsResponse.ok) throw new Error(shared3dErrorMessage(attachmentsBody, "料號附件讀取失敗"));

      const resolverResponse = await fetch("/api/manufacturing-baselines/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerScope: "part_number", ownerCode: partNumber })
      });
      const resolverBody = await resolverResponse.json().catch(() => ({}));
      if (!resolverResponse.ok) throw new Error(shared3dErrorMessage(resolverBody, "required MA 解析失敗"));

      const nextModels = (modelsBody.models ?? []) as SharedModelVersion[];
      const nextAttachments = ((attachmentsBody.attachments ?? []) as SharedModelAttachmentOption[]).filter((attachment) =>
        ["cad_3d", "intermediate"].includes(attachment.documentCategory)
      );
      const nextResolver = {
        required: (resolverBody.required ?? []) as RequiredMaItem[],
        missing: (resolverBody.missing ?? []) as RequiredMaResolverState["missing"]
      };
      setModels(nextModels);
      setAttachments(nextAttachments);
      setResolver(nextResolver);
      setSelectedModelId((current) => {
        if (current && nextModels.some((model) => model.id === current)) return current;
        return nextModels.find((model) => model.status === "Released")?.id ?? nextModels[0]?.id ?? "";
      });
      setSelectedAttachmentId((current) => {
        if (current && nextAttachments.some((attachment) => attachment.id === current)) return current;
        return nextAttachments[0]?.id ?? "";
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "共用 3D 與製造基準資料讀取失敗，請重新整理。" });
    } finally {
      setLoading(false);
    }
  }, [partNumber, productionSliceEnforced]);

  useEffect(() => {
    setDraftBaseline(null);
    setModelRevision("");
    setBaselineRevision("1");
    setTwoDOnlyReasonByDrawing({});
    void loadShared3dState();
  }, [loadShared3dState]);

  async function createSharedModel() {
    if (productionSliceEnforced) return;
    if (!selectedAttachmentId) {
      setMessage({ type: "error", text: "請先在料號附件上傳或選擇 3D CAD / 中繼模型檔。" });
      return;
    }
    setActionBusy("create-model");
    setMessage(null);
    try {
      const response = await fetch(`/api/parts/${encodeURIComponent(partNumber)}/shared-models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFileAssetId: selectedAttachmentId,
          modelRevision: modelRevision.trim(),
          status: "Released",
          releaseReason: "由料號明細共用 3D 面板建立"
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(shared3dErrorMessage(body, "共用 3D 建立失敗"));
      const model = body.model as SharedModelVersion;
      setMessage({ type: "success", text: body.reused ? "相同 hash/model revision 已存在，已沿用既有共用 3D。" : "共用 3D model version 已建立。" });
      setSelectedModelId(model.id);
      setModelRevision("");
      await loadShared3dState();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "共用 3D 建立失敗，請重新整理後再試。" });
    } finally {
      setActionBusy("");
    }
  }

  async function bindPackageModel(packageId: string) {
    if (productionSliceEnforced) return;
    if (!selectedModelId) {
      setMessage({ type: "error", text: "請先選擇已 Released 的共用 3D model version。" });
      return;
    }
    setActionBusy(`bind-${packageId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/numbering/drawing-revision-packages/${encodeURIComponent(packageId)}/model-basis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sharedModelVersionId: selectedModelId })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(shared3dErrorMessage(body, "MA package 共用 3D 綁定失敗"));
      setMessage({ type: "success", text: "MA package 已綁定共用 3D model basis。" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "MA package 綁定失敗，請確認權限與 model root。" });
    } finally {
      setActionBusy("");
    }
  }

  async function confirmTwoDOnly(packageId: string, drawingNumberId: string) {
    if (productionSliceEnforced) return;
    const reason = (twoDOnlyReasonByDrawing[drawingNumberId] ?? "").trim();
    if (!reason) {
      setMessage({ type: "error", text: "2D-only / no 3D impact 例外需要明確原因。" });
      return;
    }
    setActionBusy(`2d-${packageId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/numbering/drawing-revision-packages/${encodeURIComponent(packageId)}/model-basis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ twoDOnlyReason: reason, confirmTwoDOnly: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(shared3dErrorMessage(body, "2D-only 例外確認失敗"));
      setMessage({ type: "success", text: "已確認 2D-only / no 3D impact 例外。" });
      setTwoDOnlyReasonByDrawing((current) => ({ ...current, [drawingNumberId]: "" }));
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "2D-only 例外確認失敗，請確認權限與原因。" });
    } finally {
      setActionBusy("");
    }
  }

  async function createBaselineDraft() {
    if (productionSliceEnforced) return;
    if (!selectedModelId) {
      setMessage({ type: "error", text: "請先選擇要納入製造基準包的共用 3D。" });
      return;
    }
    setActionBusy("create-baseline");
    setMessage(null);
    try {
      const response = await fetch("/api/manufacturing-baselines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerScope: "part_number",
          ownerCode: partNumber,
          sharedModelVersionId: selectedModelId,
          baselineRevision: baselineRevision.trim() || "1",
          selectedPackageIds: requiredMaWithPackage.map((item) => item.latestReleasedPackage?.id).filter(Boolean)
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(shared3dErrorMessage(body, "製造基準包草稿建立失敗"));
      setDraftBaseline(body.baseline as ManufacturingBaselineDraftState);
      setMessage({
        type: "success",
        text: requiredMissingCount > 0 ? "製造基準包草稿已建立，但仍有必要製造圖缺少 Released package，發行前必須補齊或核准排除。" : "製造基準包草稿已建立。"
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "製造基準包草稿建立失敗，請重新整理後再試。" });
    } finally {
      setActionBusy("");
    }
  }

  async function releaseBaselineDraft() {
    if (productionSliceEnforced) return;
    if (!draftBaseline) return;
    setActionBusy("release-baseline");
    setMessage(null);
    try {
      const response = await fetch(`/api/manufacturing-baselines/${encodeURIComponent(draftBaseline.id)}/release`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(shared3dErrorMessage(body, "製造基準包發行失敗"));
      setDraftBaseline(body.baseline as ManufacturingBaselineDraftState);
      setMessage({ type: "success", text: "製造基準包已 Released，snapshot 已凍結。" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "製造基準包發行失敗，請確認必要製造圖與模型狀態。" });
    } finally {
      setActionBusy("");
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>共用 3D / MA 製造基準</h2>
          <p style={mutedStyle}>{rootCode} 的 shared 3D 屬於料號/root；製造基準包會凍結 3D hash 與製造圖正式版次。</p>
        </div>
        <button
          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced || loading || Boolean(actionBusy)}
          onClick={loadShared3dState}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("重新整理共用 3D / MA 製造基準", productionSliceUnopenedMessage) : "重新整理共用 3D / MA 製造基準"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("重新整理共用 3D / MA 製造基準", productionSliceUnopenedMessage) : "重新整理共用 3D / MA 製造基準"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          <RotateCcw size={16} />
          重新整理
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
      </div>

      <div style={sharedPanelSummaryStyle}>
        <InfoBlock icon={<Box size={16} />} title="已建模型" value={`${models.length} 個共用 3D model version`} />
        <InfoBlock icon={<FileText size={16} />} title="必要 MA" value={resolver ? `${resolver.required.length} 張，缺 ${requiredMissingCount} 張 Released package` : "尚未解析"} />
        <InfoBlock icon={<CheckCircle2 size={16} />} title="選定模型" value={selectedModel ? `${selectedModel.modelRevision} / ${formatShortHash(selectedModel.contentHash)}` : "尚未選定"} />
      </div>

      {message ? <div className={message.type === "error" ? "alert error" : "alert success"}>{message.text}</div> : null}
      {loading ? <div className="empty">正在讀取共用 3D 與 MA 製造基準資料...</div> : null}

      <div style={sharedPanelGridStyle}>
        <label className="pdm-master-field">
          <span>來源 3D 附件</span>
          <select className="dropdown-select" value={selectedAttachmentId} disabled={productionSliceEnforced} onChange={(event) => setSelectedAttachmentId(event.target.value)}>
            {attachments.map((attachment) => (
              <option key={attachment.id} value={attachment.id}>
                {attachment.displayName || attachment.fileName} / {attachment.documentCategory}
              </option>
            ))}
            {attachments.length === 0 ? <option value="">尚無 3D CAD / 中繼模型附件</option> : null}
          </select>
        </label>
        <TextField label="Model revision" value={modelRevision} onChange={setModelRevision} disabled={productionSliceEnforced} />
        <button
          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced || Boolean(actionBusy) || !selectedAttachmentId}
          onClick={createSharedModel}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("建立共用 3D", productionSliceUnopenedMessage) : "建立共用 3D"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("建立共用 3D", productionSliceUnopenedMessage) : "建立共用 3D"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          <Box size={16} />
          建立共用 3D
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
      </div>

      <div className="table-wrap">
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>共用 3D</th>
              <th>Hash</th>
              <th>
                <StatusColumnHeader context="masterRecord" />
              </th>
              <th>發行時間</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className={model.id === selectedModelId ? "selected-row" : undefined} onClick={() => setSelectedModelId(model.id)} style={{ cursor: "pointer" }}>
                <td>
                  <div className="pdm-identity-code">{model.modelRevision}</div>
                  <div className="pdm-identity-meta">{model.id}</div>
                </td>
                <td>{formatShortHash(model.contentHash)}</td>
                <td><StatusBadge status={model.status} context="masterRecord" /></td>
                <td>{model.releasedAt ? formatDateTime(model.releasedAt) : "-"}</td>
              </tr>
            ))}
            {models.length === 0 ? (
              <tr>
                <td colSpan={4} style={mutedStyle}>尚未建立共用 3D。先在料號附件上傳 3D CAD / 中繼模型，再建立 model version。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>必要製造圖</th>
              <th>最新 Released package</th>
              <th>綁定共用 3D</th>
              <th>2D-only 例外</th>
            </tr>
          </thead>
          <tbody>
            {(resolver?.required ?? []).map((item) => {
              const pkg = item.latestReleasedPackage;
              return (
                <tr key={item.drawingNumberId}>
                  <td>{item.drawingNumber}</td>
                  <td>{pkg ? `${pkg.revision} / ${pkg.id}` : "缺少 Released package"}</td>
                  <td>
                    {pkg ? (
                      <button
                        className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                        type="button"
                        disabled={productionSliceEnforced || !selectedModelId || Boolean(actionBusy)}
                        onClick={() => bindPackageModel(pkg.id)}
                        title={productionSliceEnforced ? productionSliceUnavailableTitle("綁定共用 3D", productionSliceUnopenedMessage) : "綁定共用 3D"}
                        aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("綁定共用 3D", productionSliceUnopenedMessage) : "綁定共用 3D"}
                        data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                      >
                        <Link2 size={16} />
                        綁定
                        {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
                      </button>
                    ) : (
                      <span style={mutedStyle}>先完成 MA package 發行</span>
                    )}
                  </td>
                  <td>
                    {pkg ? (
                      <div style={inlineButtonRowStyle}>
                        <input
                          value={twoDOnlyReasonByDrawing[item.drawingNumberId] ?? ""}
                          placeholder="例：只改標註，3D 不變"
                          disabled={productionSliceEnforced}
                          onChange={(event) => setTwoDOnlyReasonByDrawing((current) => ({ ...current, [item.drawingNumberId]: event.target.value }))}
                        />
                        <button
                          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                          type="button"
                          disabled={productionSliceEnforced || Boolean(actionBusy)}
                          onClick={() => confirmTwoDOnly(pkg.id, item.drawingNumberId)}
                          title={productionSliceEnforced ? productionSliceUnavailableTitle("確認 2D-only 例外", productionSliceUnopenedMessage) : "確認 2D-only 例外"}
                          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("確認 2D-only 例外", productionSliceUnopenedMessage) : "確認 2D-only 例外"}
                          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                        >
                          確認
                          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
                        </button>
                      </div>
                    ) : (
                      <span style={mutedStyle}>無 package 可設定</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {resolver && resolver.required.length === 0 ? (
              <tr>
                <td colSpan={4} style={mutedStyle}>目前 root 下沒有 Active / Released 製造圖。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={sharedPanelGridStyle}>
        <label className="pdm-master-field">
          <span>Baseline 使用模型</span>
          <select className="dropdown-select" value={selectedModelId} disabled={productionSliceEnforced} onChange={(event) => setSelectedModelId(event.target.value)}>
            {releasedModels.map((model) => (
              <option key={model.id} value={model.id}>{model.modelRevision} / {formatShortHash(model.contentHash)}</option>
            ))}
            {releasedModels.length === 0 ? <option value="">尚無 Released model</option> : null}
          </select>
        </label>
        <TextField label="Baseline revision" value={baselineRevision} onChange={setBaselineRevision} disabled={productionSliceEnforced} />
        <button
          className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced || !selectedModelId || Boolean(actionBusy)}
          onClick={createBaselineDraft}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("建立 baseline 草稿", productionSliceUnopenedMessage) : "建立 baseline 草稿"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("建立 baseline 草稿", productionSliceUnopenedMessage) : "建立 baseline 草稿"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          建立 baseline 草稿
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
        <button
          className={`primary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
          type="button"
          disabled={productionSliceEnforced || !draftBaseline || draftBaseline.status !== "Draft" || Boolean(actionBusy)}
          onClick={releaseBaselineDraft}
          title={productionSliceEnforced ? productionSliceUnavailableTitle("發行 baseline", productionSliceUnopenedMessage) : "發行 baseline"}
          aria-label={productionSliceEnforced ? productionSliceUnavailableTitle("發行 baseline", productionSliceUnopenedMessage) : "發行 baseline"}
          data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
        >
          發行 baseline
          {productionSliceEnforced ? <ProductionSliceUnopenedBadge /> : null}
        </button>
      </div>
      {draftBaseline ? (
        <p style={mutedStyle}>
          目前草稿：{draftBaseline.baselineCode} / {draftBaseline.status} / {draftBaseline.id}
        </p>
      ) : null}
    </section>
  );
}

function shared3dErrorMessage(body: Record<string, unknown>, fallback: string) {
  const text = String(body.message ?? body.error ?? fallback);
  return formatStatusErrorForUser(text, "masterRecord");
}

function formatShortHash(hash: string | null | undefined) {
  if (!hash) return "-";
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function FilterSelectField({
  label,
  value,
  onChange,
  options,
  formatOption,
  allLabel
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
          <option value={option} key={option || "all"}>
            {option ? formatOption?.(option) ?? partKindLabel(option) : allLabel ?? `全部${label}`}
          </option>
        ))}
      </select>
    </label>
  );
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

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="info-block" style={{ alignItems: "center", textAlign: "center" }}>
      <PackageSearch size={24} aria-hidden="true" />
      <p style={{ margin: 0, color: "var(--muted)" }}>{text}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input className="text-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function variantLabel(variant: PartVariant | null) {
  if (!variant) return "未設定";
  const tokens = [variant.materialLabel, variant.colorLabel, variant.surfaceTreatment].filter(Boolean);
  return tokens.length ? tokens.join(" / ") : "未設定";
}

function costTypeLabel(value: string) {
  return ({ outsourced: "委外加工", in_house: "自行製作", purchase: "採購", trial: "試作", other: "其他" } as Record<string, string>)[value] ?? value;
}

function costRequestTypeLabel(value: string) {
  return ({ set_standard: "指定標準成本", update_profile: "更新成本", retire_profile: "停用成本" } as Record<string, string>)[value] ?? value;
}

function partKindLabel(value: string) {
  return ({ purchased: "外購", manufactured: "自製", outsourced: "發包", shared: "共用", custom: "客製" } as Record<string, string>)[value] ?? value;
}

function linkTypeLabel(value: string) {
  return ({ primary_manufacturing: "製造基準關聯", reference: "參考圖" } as Record<string, string>)[value] ?? value;
}

function standardCostChipLabel(value: PartStandardCost) {
  if (value.unitCost === null) return "標準成本已設定";
  return `${value.currency} ${formatNumber(value.unitCost)}`;
}

function standardCostLabel(value: PartStandardCost | null) {
  if (!value) return "尚未設定標準成本";
  if (value.unitCost === null) return `${value.profileName}: 標準成本已設定`;
  return `${value.profileName}: ${value.currency} ${formatNumber(value.unitCost)} / ${value.uom}`;
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  padding: 12
};

const focusPanelStyle: CSSProperties = {
  borderColor: "rgba(13, 148, 136, 0.45)",
  boxShadow: "inset 3px 0 0 var(--accent-3)"
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  padding: 12
};

const sharedPanelSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  padding: 12
};

const sharedPanelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) minmax(120px, 180px) auto auto",
  alignItems: "end",
  gap: 10,
  padding: 12
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  color: "var(--muted)",
  fontSize: 13
};

const inlineButtonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8
};
