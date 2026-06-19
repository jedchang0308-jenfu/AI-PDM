"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, GitBranch, Link2, RotateCcw, Search, ShieldAlert, Workflow, X } from "lucide-react";
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
type DrawingPurposeCode = "MA" | "OT";

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
  standardCostStatus: "active" | "missing";
  standardCostProfileName: string | null;
  standardCostType: string | null;
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
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
  linkedPartCount: number;
  linkedPartNumbers: string[];
  sameRootParts: DrawingLinkedPartRecord[];
  titleBlockVariantWarning: boolean;
  warningCount: number;
  updatedAt: string;
};

const statuses = ["", "Draft", "Active", "PendingReview", "Released", "Obsolete", "MainDrawingInvalid"] as const;
const phases = ["", "EVT", "DVT", "PVT", "Release", "ECR"] as const;
const purposeCodes = ["", "MA", "OT"] as const;
const DRAWING_DRAWER_WIDTH_STORAGE_KEY = "pdm-drawing-detail-drawer-width";
const DRAWING_DRAWER_DEFAULT_WIDTH = 500;
const DRAWING_DRAWER_MIN_WIDTH = 380;
const DRAWING_DRAWER_MAX_WIDTH_RATIO = 0.72;

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

function clampDrawerWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(DRAWING_DRAWER_MIN_WIDTH, Math.floor(viewportWidth * DRAWING_DRAWER_MAX_WIDTH_RATIO));
  return Math.min(Math.max(width, DRAWING_DRAWER_MIN_WIDTH), maxWidth);
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

export default function DrawingNumbersPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [developmentPhase, setDevelopmentPhase] = useState("");
  const [purposeCode, setPurposeCode] = useState("");
  const [drawings, setDrawings] = useState<DrawingListRecord[]>([]);
  const [selectedDrawingNumber, setSelectedDrawingNumber] = useState<string | null>(null);
  const selectedDrawingNumberRef = useRef<string | null>(null);
  const drawingListRef = useRef<HTMLDivElement | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DRAWING_DRAWER_DEFAULT_WIDTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedDrawing = drawings.find((drawing) => drawing.drawingNumber === selectedDrawingNumber) ?? null;
  const summary = useMemo(
    () => ({
      total: drawings.length,
      ma: drawings.filter((drawing) => drawing.purposeCode === "MA").length,
      ot: drawings.filter((drawing) => drawing.purposeCode === "OT").length,
      linked: drawings.filter((drawing) => drawing.linkedPartCount > 0).length,
      warnings: drawings.reduce((sum, drawing) => sum + drawing.warningCount, 0)
    }),
    [drawings]
  );

  const loadDrawings = useCallback(async () => {
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ limit: "80" });
    if (query.trim()) params.set("query", query.trim());
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (developmentPhase) params.set("developmentPhase", developmentPhase);
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
    const currentSelection = selectedDrawingNumberRef.current;
    const nextSelection = currentSelection && nextDrawings.some((drawing) => drawing.drawingNumber === currentSelection) ? currentSelection : null;
    selectedDrawingNumberRef.current = nextSelection;
    setDrawings(nextDrawings);
    setSelectedDrawingNumber(nextSelection);
    setIsDetailOpen((current) => current && Boolean(nextSelection));
    setState("ready");
  }, [developmentPhase, purposeCode, query, recordStatus]);

  useEffect(() => {
    void loadDrawings();
  }, [loadDrawings]);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(DRAWING_DRAWER_WIDTH_STORAGE_KEY);
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : Number.NaN;
    if (!Number.isFinite(parsedWidth)) return;
    const nextWidth = clampDrawerWidth(parsedWidth, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(DRAWING_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  const resizeDrawingDrawer = useCallback((clientX: number) => {
    const nextWidth = clampDrawerWidth(window.innerWidth - clientX, window.innerWidth);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(DRAWING_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setDrawerWidth((currentWidth) => {
        const nextWidth = clampDrawerWidth(currentWidth, window.innerWidth);
        window.localStorage.setItem(DRAWING_DRAWER_WIDTH_STORAGE_KEY, String(nextWidth));
        return nextWidth;
      });
    }
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const startDrawingDrawerResize = useCallback(
    (clientX: number) => {
      function handlePointerMove(event: PointerEvent) {
        resizeDrawingDrawer(event.clientX);
      }
      function stopResizing() {
        document.body.classList.remove("pdm-drawer-resizing");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
      }

      resizeDrawingDrawer(clientX);
      document.body.classList.add("pdm-drawer-resizing");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing, { once: true });
      window.addEventListener("pointercancel", stopResizing, { once: true });
    },
    [resizeDrawingDrawer]
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove("pdm-drawer-resizing");
    };
  }, []);

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
    await copyTextToClipboard(drawingNumber);
  }, []);


  useEffect(() => {
    if (!isDetailOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-drawing-row='true']")) return;
      setIsDetailOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDetailOpen]);

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

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖號模組</h1>
          <p>管理圖面技術文件、版次用途、發行狀態與關聯料號；圖料模組維持跨物件追溯入口。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadDrawings} disabled={busy}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

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
            <div className="panel-header">
              <div>
                <h2>圖號主資料</h2>
                <CompactSummary
                  items={[
                    { label: "總筆數", value: summary.total },
                    { label: "MA", value: summary.ma },
                    { label: "OT", value: summary.ot },
                    { label: "已關聯", value: summary.linked },
                    { label: "提醒", value: summary.warnings, tone: summary.warnings > 0 ? "warning" : undefined }
                  ]}
                />
              </div>
            </div>
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="圖號 / 料號 / 文件用途" />
              </label>
              <SelectField label="用途" value={purposeCode} onChange={setPurposeCode} options={purposeCodes} />
              <SelectField label="狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} />
              <SelectField label="階段" value={developmentPhase} onChange={setDevelopmentPhase} options={phases} />
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
                  <p>可先到領號申請建立圖號，或用圖料模組確認是否已存在相近主根號。</p>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.5rem" }}>
                    <Link className="primary-button" href="/numbering/request">
                      領號申請
                    </Link>
                    <Link className="secondary-button" href="/numbering/search">
                      圖料模組
                    </Link>
                  </div>
                </div>
              </section>
            ) : (
              <section className="panel pdm-master-table-panel pdm-drawing-table-panel">
                <div className="panel-header">
                  <div>
                    <h2>圖號清單</h2>
                    <p style={mutedStyle}>點選圖號可檢視治理資訊與下一步動作。</p>
                  </div>
                </div>
                <div
                  ref={drawingListRef}
                  className="table-wrap pdm-identity-scroll"
                  role="region"
                  aria-label="圖號清單"
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
                        <th>圖號</th>
                        <th>品名</th>
                        <th>料號</th>
                        <th>其他</th>
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
                              {drawing.drawingNumber}
                            </button>
                            <div className="pdm-identity-meta">{drawing.purposeCode === "MA" ? "MA 製造圖" : "OT 其他圖"}</div>
                          </td>
                          <td data-label="品名">
                            <div className="pdm-identity-name">{drawing.coreName}</div>
                          </td>
                          <td data-label="料號">
                            {drawing.linkedPartCount > 0 ? (
                              <div className="pdm-meta-strip">
                                {drawing.linkedPartNumbers.slice(0, 3).map((partNumber) => (
                                  <span className="pdm-meta-chip" key={partNumber}>
                                    {partNumber}
                                  </span>
                                ))}
                                {drawing.linkedPartCount > 3 ? <span className="pdm-meta-chip">+{drawing.linkedPartCount - 3}</span> : null}
                              </div>
                            ) : (
                              <span style={mutedStyle}>尚未關聯</span>
                            )}
                          </td>
                          <td data-label="其他">
                            <div className="pdm-meta-strip">
                              <PurposeBadge drawing={drawing} />
                              <span style={badgeStyle}>{drawing.recordStatus}</span>
                              <span className="pdm-meta-chip">{drawing.developmentPhase}</span>
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
          <option key={option || "all"} value={option}>
            {option || "全部"}
          </option>
        ))}
      </select>
    </label>
  );
}

function PurposeBadge({ drawing }: { drawing: DrawingListRecord }) {
  const label = drawingPurposeLabel(drawing);
  return (
    <span style={{ ...badgeStyle, borderColor: drawing.purposeCode === "MA" ? "rgba(220, 38, 38, 0.35)" : "var(--border)" }}>
      {label}
    </span>
  );
}

function drawingPurposeLabel(drawing: DrawingListRecord) {
  const base = drawing.purposeCode === "MA" ? "MA 製造圖" : "OT 其他圖";
  return drawing.isPrimaryManufacturing ? `${base} / 主圖` : base;
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
  onClose
}: {
  drawing: DrawingListRecord | null;
  open: boolean;
  width: number;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
}) {
  if (!open || !drawing) return null;
  return (
    <div className="pdm-detail-drawer-backdrop" role="presentation">
      <aside className="pdm-detail-drawer" aria-label="圖號治理明細" role="dialog" style={{ "--pdm-detail-drawer-width": `${width}px` } as CSSProperties}>
        <button
          className="pdm-detail-drawer-resize-handle"
          type="button"
          aria-label="調整圖號明細寬度"
          title="拖拉調整寬度"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStartResize(event.clientX);
          }}
        />
        <div className="pdm-master-detail-panel pdm-master-detail-stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{drawing.drawingNumber}</h2>
                <p style={mutedStyle}>{drawing.coreName}</p>
              </div>
              <div className="pdm-drawer-header-actions">
                <PurposeBadge drawing={drawing} />
                <button className="icon-button" type="button" aria-label="關閉圖號明細" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={detailGridStyle}>
              <InfoBlock icon={<GitBranch size={16} />} title="狀態階段" value={`${drawing.recordStatus} / ${drawing.developmentPhase}`} />
              <InfoBlock icon={<FileText size={16} />} title="文件用途" value={drawingPurposeLabel(drawing)} />
              <InfoBlock icon={<Link2 size={16} />} title="關聯料號" value={drawing.linkedPartCount ? drawing.linkedPartNumbers.join("、") : "未關聯料號"} />
              <InfoBlock icon={<Workflow size={16} />} title="規則版本" value={drawing.ruleVersionId} />
            </div>
          </section>

          {drawing.titleBlockVariantWarning ? <TitleBlockVariantWarning /> : null}

          <SameRootPartPanel drawing={drawing} />

          <MasterAttachmentPanel entityType="drawing_number" entityCode={drawing.drawingNumber} />

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>圖號治理</h2>
                <p style={mutedStyle}>追溯、影響分析與進版入口。</p>
              </div>
            </div>
            <div style={actionStackStyle}>
              <Link className="primary-button" href={`/numbering/search?query=${encodeURIComponent(drawing.drawingNumber)}&entityType=drawing_number`}>
                <Search size={16} />
                開啟圖料追溯
              </Link>
              {drawing.purposeCode === "MA" ? (
                <Link className="secondary-button" href={`/numbering/impact?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`}>
                  <ShieldAlert size={16} />
                  檢查 MA 影響文件
                </Link>
              ) : null}
              <Link className="secondary-button" href="/numbering/request">
                <Workflow size={16} />
                申請新圖號 / 進版
              </Link>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function TitleBlockVariantWarning() {
  return (
    <section className="panel" style={warningPanelStyle}>
      <div className="panel-header">
        <div>
          <h2>Title block 變體風險</h2>
          <p style={mutedStyle}>同一張 MA 圖已對應多個料號，且圖面描述含材質、顏色或表面處理字樣；請確認 title block 沒有寫死單一變體。</p>
        </div>
        <AlertTriangle size={18} color="var(--danger)" />
      </div>
    </section>
  );
}

function SameRootPartPanel({ drawing }: { drawing: DrawingListRecord }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>同主根號料號</h2>
          <p style={mutedStyle}>顯示材質、顏色、料號狀態、標準成本狀態與 primary MA link。</p>
        </div>
      </div>
      {drawing.sameRootParts.length === 0 ? (
        <p style={mutedStyle}>尚無同主根號料號。</p>
      ) : (
        <div style={sameRootPartListStyle}>
          {drawing.sameRootParts.map((part) => (
            <article key={part.id} style={sameRootPartCardStyle}>
              <div>
                <strong>{part.partNumber}</strong>
                <p style={mutedStyle}>{part.partName}</p>
              </div>
              <div className="pdm-meta-strip">
                <span style={badgeStyle}>{part.recordStatus}</span>
                <span style={{ ...badgeStyle, color: part.standardCostStatus === "active" ? "var(--success)" : "var(--danger)" }}>
                  {standardCostLabel(part)}
                </span>
              </div>
              <div style={sameRootPartMetaGridStyle}>
                <InfoBlock icon={<FileText size={16} />} title="材質" value={part.materialLabel || part.materialCode || "未填"} />
                <InfoBlock icon={<FileText size={16} />} title="顏色" value={part.colorLabel || part.colorCode || "未填"} />
                <InfoBlock icon={<Workflow size={16} />} title="變體" value={variantDescriptor(part)} />
                <InfoBlock icon={<Link2 size={16} />} title="Primary MA" value={part.primaryDrawingNumber ?? "未連結"} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function variantDescriptor(part: DrawingLinkedPartRecord) {
  const values = [part.surfaceTreatment, part.variantNote].filter(Boolean);
  return values.length ? values.join(" / ") : "未填";
}

function standardCostLabel(part: DrawingLinkedPartRecord) {
  if (part.standardCostStatus === "missing") return "標準成本未設定";
  return part.standardCostProfileName ? `標準成本 active / ${part.standardCostProfileName}` : "標準成本 active";
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

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem"
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: "0.5rem"
};

const warningPanelStyle: CSSProperties = {
  borderColor: "rgba(220, 38, 38, 0.35)",
  boxShadow: "inset 3px 0 0 var(--danger)"
};

const sameRootPartListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem"
};

const sameRootPartCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0.75rem",
  background: "var(--surface)"
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
