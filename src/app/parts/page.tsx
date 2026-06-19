"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, DollarSign, FileText, Link2, PackageSearch, Palette, RotateCcw, Save, X, XCircle } from "lucide-react";
import { CompactSummary } from "@/components/compact-hints";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";

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
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
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
  rootCode: string;
  coreName: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  variant: PartVariant | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  standardCost: PartStandardCost | null;
  pendingCostRequestCount: number;
};
type PartDetail = PartListRecord & {
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

const statuses = ["", "Draft", "Active", "PendingReview", "Released", "Obsolete"] as const;
const phases = ["", "EVT", "DVT", "PVT", "Release", "ECR"] as const;
const itemKinds = ["", "purchased", "manufactured", "outsourced", "shared", "custom"] as const;
const PART_DRAWER_WIDTH_STORAGE_KEY = "pdm-part-detail-drawer-width";
const DETAIL_DRAWER_DEFAULT_WIDTH = 500;
const DETAIL_DRAWER_MIN_WIDTH = 380;
const DETAIL_DRAWER_MAX_WIDTH_RATIO = 0.72;

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
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [itemKind, setItemKind] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [developmentPhase, setDevelopmentPhase] = useState("");
  const [parts, setParts] = useState<PartListRecord[]>([]);
  const [selectedPartNumber, setSelectedPartNumber] = useState<string | null>(null);
  const selectedPartNumberRef = useRef<string | null>(null);
  const partListRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DETAIL_DRAWER_DEFAULT_WIDTH);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadParts = useCallback(async () => {
    setState("loading");
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (developmentPhase) params.set("developmentPhase", developmentPhase);
    const response = await fetch(`/api/parts?${params.toString()}`);
    if (response.status === 401 || response.status === 403) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "料號清單讀取失敗");
      setState("error");
      return;
    }
    const nextParts = (body.parts ?? []) as PartListRecord[];
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
  }, [developmentPhase, query, recordStatus]);

  const loadDetail = useCallback(async (partNumber: string | null) => {
    if (!partNumber) {
      setDetail(null);
      return;
    }
    const response = await fetch(`/api/parts/${encodeURIComponent(partNumber)}`);
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setDetail(body.part);
    } else {
      setError(body.error ?? "料號明細讀取失敗");
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

  const summary = useMemo(
    () => ({
      total: visibleParts.length,
      linked: visibleParts.filter((part) => part.drawingCount > 0).length,
      pendingCost: visibleParts.reduce((count, part) => count + part.pendingCostRequestCount, 0)
    }),
    [visibleParts]
  );

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
      selectedPartNumberRef.current = part.partNumber;
      setSelectedPartNumber(part.partNumber);
      scrollPartRowIntoView(nextIndex);
      focusPartList();
      if (isDetailOpen) void loadDetail(part.partNumber);
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
    (partNumber: string) => {
      selectedPartNumberRef.current = partNumber;
      setSelectedPartNumber(partNumber);
      setIsDetailOpen(true);
      void loadDetail(partNumber);
      focusPartList();
    },
    [focusPartList, loadDetail]
  );

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

  return (
    <>
      <div className="topbar">
        <div>
          <h1>料號模組</h1>
          <p>以主根號自動串聯圖號與料號，材質、顏色與成本都以料號為主體管理。</p>
        </div>
        <button className="secondary-button" type="button" onClick={refreshSelected}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      {state === "unauthorized" ? <section className="panel"><div className="empty">沒有料號模組檢視權限。</div></section> : null}
      {state === "error" ? <section className="panel"><div className="empty">{error}</div></section> : null}
      {state === "loading" ? <section className="panel"><div className="empty">正在讀取料號資料...</div></section> : null}
      {state === "ready" ? (
        <div className="pdm-master-workbench">
          <section className="panel pdm-master-toolbar pdm-drawing-toolbar">
            <div className="panel-header">
              <div>
                <h2>料號查找</h2>
                <CompactSummary
                  items={[
                    { label: "料號", value: summary.total },
                    { label: "已關聯圖號", value: summary.linked },
                    { label: "成本待審", value: summary.pendingCost, tone: summary.pendingCost > 0 ? "warning" : undefined }
                  ]}
                />
              </div>
            </div>
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} placeholder="料號、主根號、名稱、材質、顏色" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <FilterSelectField label="類型" value={itemKind} onChange={setItemKind} options={itemKinds} />
              <FilterSelectField label="狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} />
              <FilterSelectField label="階段" value={developmentPhase} onChange={setDevelopmentPhase} options={phases} />
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
            setBusy={setBusy}
            onUpdated={refreshSelected}
            onStartResize={startDetailDrawerResize}
            onClose={() => setIsDetailOpen(false)}
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
        <div className="empty">沒有符合條件的料號。</div>
      </section>
    );
  }
  return (
    <section className="panel pdm-master-table-panel">
      <div className="panel-header">
        <div>
          <h2>料號總表</h2>
          <p style={mutedStyle}>點選料號可檢視屬性、關聯圖號與成本資訊。</p>
        </div>
      </div>
      <div
        ref={listRef}
        className="table-wrap pdm-identity-scroll"
        role="region"
        aria-label="料號模組清單"
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
              <th>品名</th>
              <th>圖號</th>
              <th>其他</th>
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
                  <div className="pdm-identity-meta">{partKindLabel(part.itemKind)}</div>
                </td>
                <td data-label="品名">
                  <div className="pdm-identity-name">{part.partName}</div>
                </td>
                <td data-label="圖號">
                  <div className="pdm-identity-code">{part.primaryDrawingNumber ?? "未關聯圖號"}</div>
                  <div className="pdm-identity-meta">{part.drawingCount > 0 ? `${part.drawingCount} 個圖號` : "尚無圖號關聯"}</div>
                </td>
                <td data-label="其他">
                  <div className="pdm-meta-strip">
                    <span className={`badge ${part.recordStatus}`}>{part.recordStatus}</span>
                    <span className="pdm-meta-chip">{part.developmentPhase}</span>
                    <span className="pdm-meta-chip">{variantLabel(part.variant)}</span>
                    {part.standardCost ? <span className="pdm-meta-chip">{standardCostChipLabel(part.standardCost)}</span> : null}
                    {part.pendingCostRequestCount > 0 ? <span className="pdm-meta-chip">{part.pendingCostRequestCount} 成本待審</span> : null}
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
  setBusy,
  onUpdated,
  onStartResize,
  onClose
}: {
  detail: PartDetail | null;
  busy: boolean;
  open: boolean;
  width: number;
  setBusy: (value: boolean) => void;
  onUpdated: () => Promise<void>;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
}) {
  if (!open || !detail) return null;
  return (
    <div className="pdm-detail-drawer-backdrop" role="presentation">
      <aside className="pdm-detail-drawer" aria-label="料號明細" role="dialog" style={{ "--pdm-detail-drawer-width": `${width}px` } as CSSProperties}>
        <button
          className="pdm-detail-drawer-resize-handle"
          type="button"
          aria-label="調整料號明細寬度"
          title="拖拉調整寬度"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStartResize(event.clientX);
          }}
        />
        <button className="icon-button pdm-detail-drawer-floating-close" type="button" aria-label="關閉料號明細" onClick={onClose}>
          <X size={16} />
        </button>
        <PartDetailPanel detail={detail} busy={busy} setBusy={setBusy} onUpdated={onUpdated} />
      </aside>
    </div>
  );
}

function PartDetailPanel({ detail, busy, setBusy, onUpdated }: { detail: PartDetail; busy: boolean; setBusy: (value: boolean) => void; onUpdated: () => Promise<void> }) {
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

  async function saveVariant() {
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
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{detail.partNumber}</h2>
            <p style={mutedStyle}>{detail.rootCode} / {detail.partName}</p>
          </div>
          <span className={`badge ${detail.recordStatus}`}>{detail.recordStatus}</span>
        </div>
        <div style={detailGridStyle}>
          <InfoBlock icon={<Link2 size={16} />} title="圖號關聯" value={detail.linkedDrawings.length ? detail.linkedDrawings.map((link) => `${link.drawingNumber}（${linkTypeLabel(link.linkType)}）`).join("、") : "尚未關聯圖號"} />
          <InfoBlock icon={<Palette size={16} />} title="變體差異" value={variantLabel(detail.variant)} />
          <InfoBlock icon={<DollarSign size={16} />} title="標準成本" value={standardCostLabel(detail.standardCost)} />
          <InfoBlock icon={<FileText size={16} />} title="同圖差異欄位" value={detail.sameDrawingVariants.length ? detail.sameDrawingVariants.map((item) => `${item.fieldName}=${item.fieldValue}`).join("、") : "無"} />
        </div>
      </section>

      <MasterAttachmentPanel entityType="part_number" entityCode={detail.partNumber} />

      <section className="panel">
        <div className="panel-header">
          <h2>料號變體</h2>
          <button className="secondary-button" type="button" disabled={busy} onClick={saveVariant}>
            <Save size={16} />
            儲存
          </button>
        </div>
        <div style={formGridStyle}>
          <TextField label="材質" value={variantForm.materialLabel} onChange={(value) => setVariantForm((form) => ({ ...form, materialLabel: value }))} />
          <TextField label="顏色" value={variantForm.colorLabel} onChange={(value) => setVariantForm((form) => ({ ...form, colorLabel: value }))} />
          <TextField label="表面處理" value={variantForm.surfaceTreatment} onChange={(value) => setVariantForm((form) => ({ ...form, surfaceTreatment: value }))} />
          <TextField label="差異說明" value={variantForm.variantNote} onChange={(value) => setVariantForm((form) => ({ ...form, variantNote: value }))} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>成本設定檔</h2>
          <button className="secondary-button" type="button" disabled={busy || !costForm.profileName || !costForm.unitCost} onClick={createCostProfile}>
            <DollarSign size={16} />
            新增送審
          </button>
        </div>
        <div style={formGridStyle}>
          <TextField label="成本名稱" value={costForm.profileName} onChange={(value) => setCostForm((form) => ({ ...form, profileName: value }))} />
          <label style={fieldStyle}>
            <span>成本類型</span>
            <select className="dropdown-select" value={costForm.costType} onChange={(event) => setCostForm((form) => ({ ...form, costType: event.target.value }))}>
              <option value="outsourced">委外加工</option>
              <option value="in_house">自行製作</option>
              <option value="purchase">採購</option>
              <option value="trial">試作</option>
              <option value="other">其他</option>
            </select>
          </label>
          <TextField label="供應商" value={costForm.supplierName} onChange={(value) => setCostForm((form) => ({ ...form, supplierName: value }))} />
          <TextField label="製程" value={costForm.processName} onChange={(value) => setCostForm((form) => ({ ...form, processName: value }))} />
          <TextField label="最小數量" value={costForm.minQty} onChange={(value) => setCostForm((form) => ({ ...form, minQty: value }))} />
          <TextField label="單價" value={costForm.unitCost} onChange={(value) => setCostForm((form) => ({ ...form, unitCost: value }))} />
          <TextField label="設定費" value={costForm.setupCost} onChange={(value) => setCostForm((form) => ({ ...form, setupCost: value }))} />
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>名稱</th>
                <th>類型</th>
                <th>狀態</th>
                <th>級距</th>
              </tr>
            </thead>
            <tbody>
              {detail.costProfiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.profileName}</td>
                  <td>{costTypeLabel(profile.costType)}</td>
                  <td>{profile.status}</td>
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
                <th>狀態</th>
                <th>原因</th>
                <th>送審時間</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {detail.costChangeRequests.map((request) => (
                <tr key={request.id}>
                  <td>{costRequestTypeLabel(request.requestType)}</td>
                  <td>{costRequestStatusLabel(request.reviewStatus)}</td>
                  <td>{request.changeReason}</td>
                  <td>{formatDateTime(request.requestedAt)}</td>
                  <td>
                    {request.reviewStatus === "pending" ? (
                      <div style={inlineButtonRowStyle}>
                        <button className="secondary-button" type="button" disabled={busy} onClick={() => decideCostRequest(request.id, "approve")}>
                          <CheckCircle2 size={16} />
                          核准
                        </button>
                        <button className="secondary-button" type="button" disabled={busy} onClick={() => decideCostRequest(request.id, "reject")}>
                          <XCircle size={16} />
                          退回
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
    </div>
  );
}

function FilterSelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="pdm-master-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option} key={option || "all"}>
            {option ? partKindLabel(option) : `全部${label}`}
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

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input className="text-input" value={value} onChange={(event) => onChange(event.target.value)} />
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

function costRequestStatusLabel(value: string) {
  return ({ pending: "待審", approved: "已核准", rejected: "已退回", cancelled: "已取消" } as Record<string, string>)[value] ?? value;
}

function partKindLabel(value: string) {
  return ({ purchased: "外購", manufactured: "自製", outsourced: "發包", shared: "共用", custom: "客製" } as Record<string, string>)[value] ?? value;
}

function linkTypeLabel(value: string) {
  return ({ primary_manufacturing: "主要製造圖", reference: "參考圖" } as Record<string, string>)[value] ?? value;
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

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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
