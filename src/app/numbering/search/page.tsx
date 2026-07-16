"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, DollarSign, FileSearch, FileText, GitBranch, Grid2X2, Link2, ListTree, Palette, RotateCcw, Search, ShieldAlert, Workflow, X } from "lucide-react";
import { CompactSummary, RiskHint } from "@/components/compact-hints";
import { ObjectLifecycleStatusPanel } from "@/components/lifecycle-ux";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import { NextStepState } from "@/components/next-step-state";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { NumberStateOwnerCreateAction } from "@/components/number-state-workspace";
import { StatusBadge } from "@/components/status-help-popover";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { formatDevelopmentPhaseForUser, formatStatusErrorForUser, formatStatusForUser, masterRecordStatusFilterValues } from "@/lib/status-display";

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type RelationViewMode = "tree" | "matrix";
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

type PartEntityDetail = {
  id: string;
  rootCode: string;
  coreName: string;
  partNumber: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  variant: PartVariant | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  standardCost: PartStandardCost | null;
  pendingCostRequestCount: number;
  linkedDrawings: Array<{ id: string; drawingNumber: string; linkType: NumberingLink["linkType"] | string }>;
  sameDrawingVariants: Array<{ id: string; drawingNumber: string; fieldName: string; fieldValue: string }>;
  costProfiles: Array<{ id: string; profileName: string; costType: string; status: string }>;
  costChangeRequests: Array<{ id: string; requestType: string; reviewStatus: string }>;
};

type DrawingEntityLinkedPart = {
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

type DrawingPendingApprovalSummary = {
  count: number;
  revisions: string[];
  latestRequestedAt: string | null;
  latestRequestId: string | null;
  workbenchHref: string;
};

type DrawingEntityDetail = DrawingNumber & {
  rootCode: string;
  coreName: string;
  itemKind: SearchResult["itemKind"];
  linkedPartCount: number;
  linkedPartNumbers: string[];
  sameRootParts: DrawingEntityLinkedPart[];
  titleBlockVariantWarning: boolean;
  warningCount: number;
  releaseStatusMismatch: { submissionId: string; revision: string; releasedAt: string | null } | null;
  pendingApproval?: DrawingPendingApprovalSummary | null;
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

type RelationSummary = {
  rootCount: number;
  manufacturingDrawingCount: number;
  referenceDrawingCount: number;
  partCount: number;
  blockerCount: number;
};

type RelationSeverity = "ok" | "info" | "warning" | "blocked";

type DrawingPartRelationRoot = {
  rootId: string;
  rootCode: string;
  coreName: string;
  recordStatus: NumberingRecordStatus;
  developmentPhase: NumberingPhase;
  relationshipHealth: "complete" | "missing_manufacturing_drawing" | "missing_part" | "ambiguous" | "blocked" | "draft";
  nextStep: { label: string; target?: string; severity: RelationSeverity };
  drawings: DrawingPartRelationDrawing[];
  parts: DrawingPartRelationPart[];
  matrix: DrawingPartRelationCell[];
  blockers: Array<{ code: string; message: string; target: "root" | "drawing" | "part" | "relationship"; targetId?: string }>;
};

type DrawingPartRelationDrawing = {
  id: string;
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeLabel: "製造圖" | "參考圖";
  purposeText: string;
  isManufacturing: boolean;
  isReferenceOnly: boolean;
  recordStatus: NumberingRecordStatus;
  developmentPhase: NumberingPhase;
  linkedPartNumbers: string[];
  nextStep: string;
};

type DrawingPartRelationPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  recordStatus: NumberingRecordStatus;
  developmentPhase: NumberingPhase;
  linkedDrawingNumbers: string[];
  hasManufacturingDrawing: boolean;
};

type DrawingPartRelationCell = {
  drawingNumber: string;
  partNumber: string;
  relationType: "manufacturing_basis" | "reference" | "pending" | "not_applicable" | "required_missing" | "blocked";
  isPrimary?: boolean;
};

type RelationMaintenanceOperation = "link" | "set_primary" | "set_reference" | "remove";
type DetailTarget =
  | { entityType: "part_root"; rootCode: string }
  | { entityType: "drawing_number"; rootCode: string; drawingNumber: string }
  | { entityType: "part_number"; rootCode: string; partNumber: string };

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
  const [productSeries, setProductSeries] = useState("");
  const [productSeriesOptions, setProductSeriesOptions] = useState<string[]>([]);
  const [entityType, setEntityType] = useState<EntityType>("all");
  const [recordStatus, setRecordStatus] = useState("");
  const [developmentPhase, setDevelopmentPhase] = useState("");
  const [viewMode, setViewMode] = useState<RelationViewMode>("tree");
  const [relationRoots, setRelationRoots] = useState<DrawingPartRelationRoot[]>([]);
  const [relationSummary, setRelationSummary] = useState<RelationSummary>({
    rootCount: 0,
    manufacturingDrawingCount: 0,
    referenceDrawingCount: 0,
    partCount: 0,
    blockerCount: 0
  });
  const [expandedRootCodes, setExpandedRootCodes] = useState<Set<string>>(new Set());
  const [selectedRootCode, setSelectedRootCode] = useState<string | null>(null);
  const selectedRootCodeRef = useRef<string | null>(null);
  const initialDetailRootCodeRef = useRef<string | null>(null);
  const searchListRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<RootDetail | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
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

  const summary = relationSummary;

  const loadDetail = useCallback(async (rootCode: string, target?: DetailTarget) => {
    const nextTarget = target ?? { entityType: "part_root", rootCode };
    setBusy("detail");
    setError("");
    selectedRootCodeRef.current = rootCode;
    setSelectedRootCode(rootCode);
    setDetailTarget(nextTarget);
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

  const openDetailTarget = useCallback(
    (target: DetailTarget) => {
      void loadDetail(target.rootCode, target);
    },
    [loadDetail]
  );

  const loadResults = useCallback(async () => {
    setBusy("search");
    setError("");
    const params = new URLSearchParams({ limit: "60" });
    if (query.trim()) params.set("query", query.trim());
    if (productSeries) params.set("productSeries", productSeries);
    if (entityType !== "all") params.set("entityType", entityType);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (developmentPhase) params.set("developmentPhase", developmentPhase);
    const response = await fetch(`/api/numbering/relations?${params.toString()}`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "圖料關係讀取失敗", "masterRecord"));
      setState("error");
      return;
    }
    const nextRoots = (body.roots ?? []) as DrawingPartRelationRoot[];
    setProductSeriesOptions((body.productSeriesOptions ?? []) as string[]);
    const currentSelection = selectedRootCodeRef.current;
    const selectedStillVisible = currentSelection && nextRoots.some((root) => root.rootCode === currentSelection);
    const nextSelectedRootCode = selectedStillVisible ? currentSelection : nextRoots[0]?.rootCode ?? null;
    setRelationRoots(nextRoots);
    setRelationSummary((body.summary ?? summarizeRelationRoots(nextRoots)) as RelationSummary);
    setExpandedRootCodes((currentExpanded) => {
      const nextExpanded = new Set(Array.from(currentExpanded).filter((rootCode) => nextRoots.some((root) => root.rootCode === rootCode)));
      if (nextSelectedRootCode) nextExpanded.add(nextSelectedRootCode);
      return nextExpanded;
    });
    setState("ready");
    if (nextSelectedRootCode) {
      selectedRootCodeRef.current = nextSelectedRootCode;
      setSelectedRootCode(nextSelectedRootCode);
      if (!selectedStillVisible) {
        setDetail(null);
        setDetailTarget(null);
        setImpact(null);
        setIsDetailOpen(false);
      }
    } else {
      selectedRootCodeRef.current = null;
      setSelectedRootCode(null);
      setDetail(null);
      setDetailTarget(null);
      setImpact(null);
      setIsDetailOpen(false);
    }
  }, [developmentPhase, entityType, productSeries, query, recordStatus]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (state !== "ready") return;
    const detailRootCode = initialDetailRootCodeRef.current;
    if (!detailRootCode) return;
    if (!relationRoots.some((root) => root.rootCode === detailRootCode)) return;
    initialDetailRootCodeRef.current = null;
    void loadDetail(detailRootCode);
  }, [loadDetail, relationRoots, state]);

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
      if (relationRoots.length === 0) return;
      const nextIndex = Math.min(Math.max(index, 0), relationRoots.length - 1);
      const root = relationRoots[nextIndex];
      selectedRootCodeRef.current = root.rootCode;
      setSelectedRootCode(root.rootCode);
      setExpandedRootCodes((current) => new Set(current).add(root.rootCode));
      scrollSearchRowIntoView(nextIndex);
      focusSearchList();
      if (isDetailOpen) void loadDetail(root.rootCode);
    },
    [focusSearchList, isDetailOpen, loadDetail, relationRoots, scrollSearchRowIntoView]
  );

  const moveSearchSelection = useCallback(
    (delta: number) => {
      if (relationRoots.length === 0) return;
      const currentIndex = relationRoots.findIndex((root) => root.rootCode === selectedRootCodeRef.current);
      const fallbackIndex = delta > 0 ? 0 : relationRoots.length - 1;
      selectSearchResultAt(currentIndex === -1 ? fallbackIndex : currentIndex + delta);
    },
    [relationRoots, selectSearchResultAt]
  );

  const getKeyboardPageStep = useCallback(() => {
    const listElement = searchListRef.current;
    const firstRow = listElement?.querySelector<HTMLTableRowElement>("[data-search-row='true']");
    if (!listElement || !firstRow) return 8;
    return Math.max(1, Math.floor(listElement.clientHeight / Math.max(firstRow.getBoundingClientRect().height, 1)) - 1);
  }, []);

  const openSelectedSearchDetail = useCallback(() => {
    if (relationRoots.length === 0) return;
    const currentIndex = relationRoots.findIndex((root) => root.rootCode === selectedRootCodeRef.current);
    const root = relationRoots[currentIndex === -1 ? 0 : currentIndex];
    selectedRootCodeRef.current = root.rootCode;
    setSelectedRootCode(root.rootCode);
    setExpandedRootCodes((current) => new Set(current).add(root.rootCode));
    void loadDetail(root.rootCode);
    focusSearchList();
  }, [focusSearchList, loadDetail, relationRoots]);

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
    if (state !== "ready" || relationRoots.length === 0) return;

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
          selectSearchResultAt(relationRoots.length - 1);
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
    relationRoots.length,
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

  async function maintainRelation(input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) {
    setError("");
    const response = await fetch("/api/numbering/relations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatStatusErrorForUser(body.error ?? "圖料關係維護失敗", "masterRecord"));
    }
    const rootCode = selectedRootCodeRef.current ?? detail?.root.rootCode ?? null;
    await loadResults();
    if (rootCode) await loadDetail(rootCode);
  }

  async function refreshCurrentRootDetail() {
    const rootCode = selectedRootCodeRef.current ?? detail?.root.rootCode ?? null;
    await loadResults();
    if (rootCode) await loadDetail(rootCode);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖料模組</h1>
          <p>料件、料號與圖號集中查詢，明細標示風險與影響資訊。</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={loadResults}>
            <RotateCcw size={16} />
            重新整理
          </button>
          <NumberStateOwnerCreateAction surface="search" />
        </div>
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
                    { label: "主根", value: summary.rootCount },
                    { label: "製造圖", value: summary.manufacturingDrawingCount },
                    { label: "參考圖", value: summary.referenceDrawingCount },
                    { label: "料號", value: summary.partCount },
                    { label: "阻擋", value: summary.blockerCount }
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
                <span>產品系列</span>
                <select value={productSeries} onChange={(event) => setProductSeries(event.target.value)}>
                  <option value="">全部系列</option>
                  {productSeriesOptions.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
            <div className="pdm-relation-view-switch" role="tablist" aria-label="圖料關係顯示模式">
              <button className={viewMode === "tree" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "tree"} onClick={() => setViewMode("tree")}>
                <ListTree size={16} />
                關係樹
              </button>
              <button className={viewMode === "matrix" ? "active" : undefined} type="button" role="tab" aria-selected={viewMode === "matrix"} onClick={() => setViewMode("matrix")}>
                <Grid2X2 size={16} />
                矩陣
              </button>
            </div>
          </section>

          <div className="pdm-drawing-list-layout">
            <RelationResultsPanel
              roots={relationRoots}
              viewMode={viewMode}
              selectedRootCode={selectedRootCode}
              expandedRootCodes={expandedRootCodes}
              listRef={searchListRef}
              onOpenDetailTarget={openDetailTarget}
              onToggleRoot={(rootCode) =>
                setExpandedRootCodes((current) => {
                  const next = new Set(current);
                  if (next.has(rootCode)) next.delete(rootCode);
                  else next.add(rootCode);
                  return next;
                })
              }
            />
          </div>
          <RootDetailDrawer
            detail={detail}
            detailTarget={detailTarget}
            impact={impact}
            busy={busy}
            open={isDetailOpen}
            width={drawerWidth}
            onAnalyzeImpact={analyzeImpact}
            onRelationChange={maintainRelation}
            onChanged={refreshCurrentRootDetail}
            onStartResize={startDetailDrawerResize}
            onClose={() => setIsDetailOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function RelationResultsPanel({
  roots,
  viewMode,
  selectedRootCode,
  expandedRootCodes,
  listRef,
  onOpenDetailTarget,
  onToggleRoot
}: {
  roots: DrawingPartRelationRoot[];
  viewMode: RelationViewMode;
  selectedRootCode: string | null;
  expandedRootCodes: Set<string>;
  listRef: RefObject<HTMLDivElement | null>;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  if (roots.length === 0) {
    return (
      <section className="panel pdm-master-table-panel">
        <NextStepState
          eyebrow="查無結果"
          title="目前沒有符合條件的圖料關係"
          body="查不到符合條件的圖料關係，請清除篩選或改用主根號、圖號、料號搜尋。若這是新圖號或新料號，請改到編號申請建立來源資料。"
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
      <div
        ref={listRef}
        className="pdm-relation-scroll"
        role="region"
        aria-label="圖料模組關係清單"
        aria-keyshortcuts="ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C"
        tabIndex={0}
      >
        {viewMode === "tree" ? (
          <div className="pdm-relation-list">
            {roots.map((root, index) => (
              <RelationRootGroup
                root={root}
                selected={selectedRootCode === root.rootCode}
                expanded={expandedRootCodes.has(root.rootCode)}
                onOpenDetailTarget={onOpenDetailTarget}
                onToggleRoot={onToggleRoot}
                key={root.rootId}
                rowIndex={index}
              />
            ))}
          </div>
        ) : (
          <RelationMatrixView
            roots={roots}
            selectedRootCode={selectedRootCode}
            expandedRootCodes={expandedRootCodes}
            onOpenDetailTarget={onOpenDetailTarget}
            onToggleRoot={onToggleRoot}
          />
        )}
      </div>
    </section>
  );
}

function RelationRootGroup({
  root,
  selected,
  expanded,
  rowIndex,
  onOpenDetailTarget,
  onToggleRoot
}: {
  root: DrawingPartRelationRoot;
  selected: boolean;
  expanded: boolean;
  rowIndex: number;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  return (
    <article className={`pdm-relation-root${selected ? " selected" : ""}`} data-search-row="true" data-row-index={rowIndex}>
      <RelationRootHeader root={root} expanded={expanded} onOpenDetailTarget={onOpenDetailTarget} onToggleRoot={onToggleRoot} />
      {expanded ? (
        <div className="pdm-relation-root-body">
          <div className="pdm-relation-drawing-list">
            {root.drawings.map((drawing) => (
              <RelationDrawingNode drawing={drawing} root={root} onOpenDetailTarget={onOpenDetailTarget} key={drawing.id} />
            ))}
          </div>
          <RelationOrphanParts root={root} onOpenDetailTarget={onOpenDetailTarget} />
        </div>
      ) : null}
    </article>
  );
}

function RelationRootHeader({
  root,
  expanded,
  onOpenDetailTarget,
  onToggleRoot
}: {
  root: DrawingPartRelationRoot;
  expanded: boolean;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  return (
    <div className="pdm-relation-root-header" onClick={() => onOpenDetailTarget({ entityType: "part_root", rootCode: root.rootCode })} role="button" tabIndex={-1}>
      <button
        className="icon-button"
        type="button"
        aria-label={expanded ? `收合 ${root.rootCode}` : `展開 ${root.rootCode}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleRoot(root.rootCode);
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className="pdm-relation-root-main">
        <button
          type="button"
          className="pdm-identity-code"
          style={linkButtonStyle}
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetailTarget({ entityType: "part_root", rootCode: root.rootCode });
          }}
        >
          {root.rootCode}
        </button>
        <strong title={root.coreName || undefined}>{root.coreName || "-"}</strong>
        <RelationHealthChip health={root.relationshipHealth} severity={root.nextStep.severity} />
      </div>
      <div className="pdm-relation-root-meta">
        <StatusBadge status={root.recordStatus} context="masterRecord" />
        <span className="pdm-meta-chip">{formatDevelopmentPhaseForUser(root.developmentPhase)}</span>
      </div>
    </div>
  );
}

function RelationDrawingNode({
  drawing,
  root,
  onOpenDetailTarget
}: {
  drawing: DrawingPartRelationDrawing;
  root: DrawingPartRelationRoot;
  onOpenDetailTarget: (target: DetailTarget) => void;
}) {
  const linkedParts = root.parts.filter((part) => drawing.linkedPartNumbers.includes(part.partNumber));
  return (
    <section className={`pdm-relation-node ${drawing.isReferenceOnly ? "reference" : "manufacturing"}`}>
      <div className="pdm-relation-node-header">
        <button
          className="pdm-identity-code"
          style={linkButtonStyle}
          type="button"
          onClick={() => onOpenDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber })}
        >
          {drawing.drawingNumber}
        </button>
        <span className={drawing.isReferenceOnly ? "pdm-relation-purpose reference" : "pdm-relation-purpose manufacturing"}>{drawing.purposeLabel}</span>
        <StatusBadge status={drawing.recordStatus} context="masterRecord" />
        <span className="pdm-meta-chip">{formatDevelopmentPhaseForUser(drawing.developmentPhase)}</span>
        <span className="pdm-relation-node-step">{drawing.nextStep}</span>
      </div>
      {linkedParts.length > 0 ? (
        <div className="pdm-relation-part-group">
          <div className="pdm-relation-part-list">
            {linkedParts.map((part) => {
              const relationType = root.matrix.find((cell) => cell.drawingNumber === drawing.drawingNumber && cell.partNumber === part.partNumber)?.relationType ?? "pending";
              const role = relationCellLabel(relationType);
              const showRole = role !== "製造依據";
              return (
                <button
                  className={`pdm-relation-part-chip ${part.hasManufacturingDrawing ? "" : "missing"}${showRole ? " has-role" : ""}`}
                  title={showRole ? `${part.partNumber} / ${part.partName} / ${role}` : `${part.partNumber} / ${part.partName}`}
                  type="button"
                  onClick={() => onOpenDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber })}
                  key={part.id}
                >
                  <span>{part.partNumber}</span>
                  <small title={part.partName}>{part.partName}</small>
                  {showRole ? <strong>{role}</strong> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="pdm-relation-empty-line">尚未關聯料號</div>
      )}
    </section>
  );
}

function RelationOrphanParts({ root, onOpenDetailTarget }: { root: DrawingPartRelationRoot; onOpenDetailTarget: (target: DetailTarget) => void }) {
  const orphanParts = root.parts.filter((part) => !part.hasManufacturingDrawing);
  if (orphanParts.length === 0) return null;
  return (
    <section className="pdm-relation-orphan">
      <strong>未連製造圖料號</strong>
      <div className="pdm-relation-part-list">
        {orphanParts.map((part) => (
          <button
            className="pdm-relation-part-chip missing"
            type="button"
            onClick={() => onOpenDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber })}
            key={part.id}
          >
            <span>{part.partNumber}</span>
            <small title={part.partName}>{part.partName}</small>
            <strong>缺製造圖</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function RelationMatrixView({
  roots,
  selectedRootCode,
  expandedRootCodes,
  onOpenDetailTarget,
  onToggleRoot
}: {
  roots: DrawingPartRelationRoot[];
  selectedRootCode: string | null;
  expandedRootCodes: Set<string>;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  return (
    <div className="pdm-relation-list pdm-relation-matrix-list">
      {roots.map((root, index) => {
        const expanded = expandedRootCodes.has(root.rootCode);
        return (
          <article
            className={`pdm-relation-root${selectedRootCode === root.rootCode ? " selected" : ""}`}
            data-search-row="true"
            data-row-index={index}
            key={root.rootId}
          >
            <RelationRootHeader root={root} expanded={expanded} onOpenDetailTarget={onOpenDetailTarget} onToggleRoot={onToggleRoot} />
            {expanded ? (
              <div className="pdm-relation-root-body pdm-relation-matrix-body">
                {root.drawings.length === 0 || root.parts.length === 0 ? (
                  <div className="pdm-relation-empty-line">{root.drawings.length === 0 ? "尚無圖號" : "尚無料號"}</div>
                ) : (
                  <RelationRootMatrix root={root} onOpenDetailTarget={onOpenDetailTarget} />
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function RelationRootMatrix({ root, onOpenDetailTarget }: { root: DrawingPartRelationRoot; onOpenDetailTarget: (target: DetailTarget) => void }) {
  return (
    <div className="pdm-relation-matrix-wrap">
      <table className="pdm-relation-matrix">
        <thead>
          <tr>
            <th className="sticky-col pdm-relation-axis-header" aria-label="縱軸料號，橫軸圖號">
              <span className="pdm-relation-axis-drawing" aria-hidden="true">圖號</span>
              <span className="pdm-relation-axis-part" aria-hidden="true">料號</span>
            </th>
            {root.drawings.map((drawing) => (
              <th key={drawing.id}>
                <button
                  className="pdm-relation-matrix-identity"
                  type="button"
                  onClick={() => onOpenDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber })}
                >
                  <span>{drawing.drawingNumber}</span>
                  <small>{drawing.purposeLabel}</small>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {root.parts.map((part) => (
            <tr key={part.id}>
              <th className="sticky-col">
                <button
                  className="pdm-relation-matrix-identity"
                  type="button"
                  onClick={() => onOpenDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber })}
                >
                  <span>{part.partNumber}</span>
                  <small title={part.partName}>{part.partName}</small>
                </button>
              </th>
              {root.drawings.map((drawing) => {
                const cell = root.matrix.find((item) => item.partNumber === part.partNumber && item.drawingNumber === drawing.drawingNumber);
                const relationType = cell?.relationType ?? "pending";
                return (
                  <td className={`relation-${relationType}`} key={`${part.id}:${drawing.id}`}>
                    {relationCellLabel(relationType)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelationHealthChip({ health, severity }: { health: DrawingPartRelationRoot["relationshipHealth"]; severity: RelationSeverity }) {
  return <span className={`pdm-relation-health ${severity}`}>{relationHealthLabel(health)}</span>;
}

function relationHealthLabel(health: DrawingPartRelationRoot["relationshipHealth"]) {
  const labels: Record<DrawingPartRelationRoot["relationshipHealth"], string> = {
    complete: "關聯完整",
    missing_manufacturing_drawing: "缺製造圖",
    missing_part: "缺料號",
    ambiguous: "有歧義",
    blocked: "不可製造",
    draft: "草稿確認"
  };
  return labels[health];
}

function relationCellLabel(relationType: DrawingPartRelationCell["relationType"]) {
  if (relationType === "manufacturing_basis") return "製造依據";
  if (relationType === "reference") return "參考";
  if (relationType === "pending") return "待判定";
  if (relationType === "not_applicable") return "不適用";
  if (relationType === "required_missing") return "缺必要";
  if (relationType === "blocked") return "阻擋";
  return "待判定";
}

function relationLinkTypeLabel(linkType: NumberingLink["linkType"]) {
  if (linkType === "primary_manufacturing") return "製造依據";
  return "參考";
}

function summarizeRelationRoots(roots: DrawingPartRelationRoot[]): RelationSummary {
  return {
    rootCount: roots.length,
    manufacturingDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isManufacturing).length, 0),
    referenceDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isReferenceOnly).length, 0),
    partCount: roots.reduce((sum, root) => sum + root.parts.length, 0),
    blockerCount: roots.reduce((sum, root) => sum + root.blockers.length, 0)
  };
}

function RootDetailDrawer({
  detail,
  detailTarget,
  impact,
  busy,
  open,
  width,
  onAnalyzeImpact,
  onRelationChange,
  onChanged,
  onStartResize,
  onClose
}: {
  detail: RootDetail | null;
  detailTarget: DetailTarget | null;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  open: boolean;
  width: number;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onRelationChange: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void>;
  onChanged: () => Promise<void>;
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
        <RootDetailPanel detail={detail} detailTarget={detailTarget} impact={impact} busy={busy} onAnalyzeImpact={onAnalyzeImpact} onRelationChange={onRelationChange} onChanged={onChanged} />
      </aside>
    </div>
  );
}

function RootDetailPanel({
  detail,
  detailTarget,
  impact,
  busy,
  onAnalyzeImpact,
  onRelationChange,
  onChanged
}: {
  detail: RootDetail | null;
  detailTarget: DetailTarget | null;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onRelationChange: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  if (!detail) {
    return (
      <section className="panel pdm-master-detail-panel">
        <EmptyBlock text={busy === "detail" ? "正在載入明細..." : "尚未選取圖料號"} />
      </section>
    );
  }

  const target = resolveDetailTarget(detail, detailTarget);
  const header = detailTargetHeader(detail, target);
  const formalChildCount = [...detail.partNumbers, ...detail.drawingNumbers].filter((record) =>
    record.recordStatus === "Active" || record.recordStatus === "Released" || record.recordStatus === "MainDrawingInvalid"
  ).length;
  const isRootTarget = target.entityType === "part_root";
  const headerWarnings = detailTargetHeaderWarnings(detail, target);
  const selectedPartNumber = target.entityType === "part_number" ? target.partNumber : "";
  const selectedDrawingNumber = target.entityType === "drawing_number" ? target.drawingNumber : "";

  return (
    <section
      className="panel pdm-master-detail-panel"
      data-detail-target={target.entityType}
      data-detail-code={header.code}
      data-entity-type={target.entityType}
      data-entity-code={header.code}
      data-source-context="numbering_search"
    >
      <div className="panel-header">
        <div>
          <h2>{header.title}</h2>
          <p style={mutedTextStyle}>{header.subtitle}</p>
        </div>
        <div style={actionGroupStyle}>
          {headerWarnings.map((warning) => (
            <WarningDot title={warning} key={warning} />
          ))}
        </div>
      </div>
      <div style={detailBodyStyle}>
        {isRootTarget ? (
          <>
            <div className="metrics" style={{ marginBottom: 0 }} data-root-aggregate-section="summary-metrics">
              <Metric label="料號" value={detail.summary.partCount} />
              <Metric label="圖號" value={detail.summary.drawingCount} />
              <Metric label="製造圖" value={detail.summary.primaryManufacturingCount} />
              <Metric label="提醒" value={detail.summary.warningCount} />
            </div>

            <DetailTargetLifecyclePanel detail={detail} target={target} />
            <DetailTargetActionSection detail={detail} target={target} formalChildCount={formalChildCount} onChanged={onChanged} />
            <DetailTargetCoreSections detail={detail} target={target} />

            <section style={sectionStyle} data-root-aggregate-section="part-list">
              <h3 style={sectionHeadingStyle}>料號</h3>
              <div style={cardListStyle}>
                {detail.partNumbers.map((partNumber) => (
                  <PartNumberCard
                    partNumber={partNumber}
                    detail={detail}
                    selected={partNumber.partNumber === selectedPartNumber}
                    showEntrypoints={partNumber.partNumber !== selectedPartNumber}
                    onChanged={onChanged}
                    key={partNumber.id}
                  />
                ))}
              </div>
            </section>

            <section style={sectionStyle} data-root-aggregate-section="drawing-list">
              <h3 style={sectionHeadingStyle}>圖號</h3>
              <div style={cardListStyle}>
                {detail.drawingNumbers.map((drawingNumber) => (
                  <DrawingNumberCard
                    drawingNumber={drawingNumber}
                    detail={detail}
                    busy={busy}
                    selected={drawingNumber.drawingNumber === selectedDrawingNumber}
                    showEntrypoints={drawingNumber.drawingNumber !== selectedDrawingNumber}
                    onAnalyzeImpact={onAnalyzeImpact}
                    onChanged={onChanged}
                    key={drawingNumber.id}
                  />
                ))}
              </div>
            </section>

            <RelationMaintenancePanel detail={detail} target={target} onRelationChange={onRelationChange} />
            <WarningsPanel warnings={detail.warnings} />
            <ImpactPanel impact={impact} />
            <AuditPanel auditTrail={detail.auditTrail} />
          </>
        ) : (
          <>
            <DetailTargetObjectHero detail={detail} target={target} onChanged={onChanged} />
            <DetailTargetCoreSections detail={detail} target={target} />
          </>
        )}
      </div>
    </section>
  );
}

function resolveDetailTarget(detail: RootDetail, target: DetailTarget | null): DetailTarget {
  if (!target || target.rootCode !== detail.root.rootCode) return { entityType: "part_root", rootCode: detail.root.rootCode };
  if (target.entityType === "drawing_number" && detail.drawingNumbers.some((drawing) => drawing.drawingNumber === target.drawingNumber)) return target;
  if (target.entityType === "part_number" && detail.partNumbers.some((part) => part.partNumber === target.partNumber)) return target;
  return { entityType: "part_root", rootCode: detail.root.rootCode };
}

function detailTargetHeader(detail: RootDetail, target: DetailTarget) {
  if (target.entityType === "drawing_number") {
    const drawing = detail.drawingNumbers.find((item) => item.drawingNumber === target.drawingNumber);
    return {
      title: `圖號明細 ${target.drawingNumber}`,
      subtitle: `${detail.root.rootCode} / ${drawing?.purposeDescription || (drawing ? purposeLabel(drawing.purposeCode) : detail.root.coreName)}`,
      code: target.drawingNumber
    };
  }
  if (target.entityType === "part_number") {
    const part = detail.partNumbers.find((item) => item.partNumber === target.partNumber);
    return {
      title: `料號明細 ${target.partNumber}`,
      subtitle: `${detail.root.rootCode} / ${part?.partName || detail.root.coreName}`,
      code: target.partNumber
    };
  }
  return {
    title: `主根明細 ${detail.root.rootCode}`,
    subtitle: detail.root.coreName,
    code: detail.root.rootCode
  };
}

function detailTargetHeaderWarnings(detail: RootDetail, target: DetailTarget) {
  if (target.entityType === "part_number") {
    const partNumber = detail.partNumbers.find((part) => part.partNumber === target.partNumber);
    if (!partNumber) return [];
    const warnings = detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id && !warning.acknowledgedAt);
    return [
      partNumber.recordStatus === "MainDrawingInvalid" ? "此料號的製造基準關聯已失效，恢復可用前需重新送審。" : "",
      warnings.length > 0 ? `此料號尚有 ${warnings.length} 則未確認提醒。` : ""
    ].filter(Boolean);
  }

  if (target.entityType === "drawing_number") {
    const drawingNumber = detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber);
    if (!drawingNumber) return [];
    const warnings = detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id && !warning.acknowledgedAt);
    return [
      isReferenceDrawingPurpose(drawingNumber.purposeCode) ? "參考圖不可作為製造基準。" : "",
      warnings.length > 0 ? `此圖號尚有 ${warnings.length} 則未確認提醒。` : ""
    ].filter(Boolean);
  }

  return [
    detail.summary.hasMainDrawingInvalid ? "此主根或料號含製造基準失效狀態，恢復可用前需完成重新送審。" : "",
    detail.summary.warningCount > 0 ? `此主根尚有 ${detail.summary.warningCount} 則未確認提醒。` : ""
  ].filter(Boolean);
}

function DetailTargetObjectHero({ detail, target, onChanged }: { detail: RootDetail; target: DetailTarget; onChanged: () => Promise<void> }) {
  if (target.entityType === "drawing_number") {
    const drawingNumber = detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber);
    if (!drawingNumber) return null;
    const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
    return (
      <section className="panel drawing-detail-hero" data-entity-core-section="object-owner-hero">
        <div className="drawing-detail-hero-meta">
          <StatusBadge status={drawingNumber.recordStatus} context="masterRecord" />
          <span className="pdm-meta-chip">{formatDevelopmentPhaseForUser(drawingNumber.developmentPhase)}</span>
          <span className="pdm-meta-chip">{purposeLabel(drawingNumber.purposeCode)}</span>
          <span className="pdm-meta-chip">關聯料號 {links.length}</span>
        </div>
        <div className="drawing-detail-action-row">
          <a className="primary-button" href={`/numbering/revisions?drawingNumber=${encodeURIComponent(drawingNumber.drawingNumber)}`}>
            <GitBranch size={16} />
            進版
          </a>
          <a className="secondary-button" href={`/drawings/${encodeURIComponent(drawingNumber.drawingNumber)}/submission-workbench`}>
            <FileText size={16} />
            送審
          </a>
          <a className="secondary-button" href={`/numbering/search?query=${encodeURIComponent(drawingNumber.drawingNumber)}&entityType=drawing_number`}>
            <Search size={16} />
            追溯
          </a>
          {isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? (
            <a className="secondary-button" href={`/numbering/impact?drawingNumber=${encodeURIComponent(drawingNumber.drawingNumber)}`}>
              <Workflow size={16} />
              影響
            </a>
          ) : null}
        </div>
        <NumberingContextualEntrypoints
          mode="drawing"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          drawing={{
            drawingNumber: drawingNumber.drawingNumber,
            purposeCode: drawingNumber.purposeCode,
            recordStatus: drawingNumber.recordStatus,
            linkedPartNumbers: links.map((link) => link.partNumber)
          }}
          onChanged={onChanged}
        />
      </section>
    );
  }

  if (target.entityType === "part_number") {
    const partNumber = detail.partNumbers.find((part) => part.partNumber === target.partNumber);
    if (!partNumber) return null;
    const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
    const primaryDrawingNumber = links.find((link) => link.linkType === "primary_manufacturing")?.drawingNumber ?? links[0]?.drawingNumber ?? "";
    return (
      <section className="panel drawing-detail-hero" data-entity-core-section="object-owner-hero">
        <div className="drawing-detail-hero-meta">
          <StatusBadge status={partNumber.recordStatus} context="masterRecord" />
          <span className="pdm-meta-chip">{formatDevelopmentPhaseForUser(partNumber.developmentPhase)}</span>
          <span className="pdm-meta-chip">{kindLabel(partNumber.itemKind)}</span>
          <span className="pdm-meta-chip">關聯圖號 {links.length}</span>
        </div>
        <div className="drawing-detail-action-row">
          {primaryDrawingNumber ? (
            <a className="primary-button" href={`/drawings/${encodeURIComponent(primaryDrawingNumber)}/submission-workbench`}>
              <FileText size={16} />
              送審製造圖
            </a>
          ) : (
            <a className="primary-button" href={`/numbering/search?query=${encodeURIComponent(partNumber.partNumber)}&entityType=part_number`}>
              <Link2 size={16} />
              補關聯
            </a>
          )}
          <a className="secondary-button" href={`/numbering/search?query=${encodeURIComponent(partNumber.partNumber)}&entityType=part_number`}>
            <Search size={16} />
            追溯
          </a>
          <a className="secondary-button" href={`/parts?detail=${encodeURIComponent(partNumber.partNumber)}`}>
            <Workflow size={16} />
            3D 基準
          </a>
          <a className="secondary-button" href={`/parts?detail=${encodeURIComponent(partNumber.partNumber)}&focus=cost`}>
            <DollarSign size={16} />
            成本
          </a>
        </div>
        <NumberingContextualEntrypoints
          mode="part"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          part={{
            partNumber: partNumber.partNumber,
            partName: partNumber.partName,
            recordStatus: partNumber.recordStatus,
            linkedDrawingNumbers: links.map((link) => link.drawingNumber)
          }}
          onChanged={onChanged}
        />
      </section>
    );
  }

  return null;
}

function DetailTargetLifecyclePanel({ detail, target }: { detail: RootDetail; target: DetailTarget }) {
  if (target.entityType === "part_number") {
    const partNumber = detail.partNumbers.find((part) => part.partNumber === target.partNumber);
    if (!partNumber) return <DetailTargetLifecyclePanel detail={detail} target={{ entityType: "part_root", rootCode: detail.root.rootCode }} />;
    const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
    const manufacturingLinks = links.filter((link) => link.linkType === "primary_manufacturing");
    const warnings = detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id && !warning.acknowledgedAt);
    const needsManufacturingDrawing = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && manufacturingLinks.length === 0;
    const primaryDrawingNumber = manufacturingLinks[0]?.drawingNumber ?? links[0]?.drawingNumber ?? "";
    return (
      <ObjectLifecycleStatusPanel
        title="這個料號目前狀態"
        objectName={`${partNumber.partNumber} / ${partNumber.partName}`}
        status={partNumber.recordStatus}
        phase={partNumber.developmentPhase}
        owner="RD / Manager"
        identities={[
          { label: "料號", value: partNumber.partNumber },
          { label: "主根號", value: detail.root.rootCode },
          { label: "關聯圖號", value: links.length },
          { label: "製造圖", value: manufacturingLinks.map((link) => link.drawingNumber).join("、") || "-" }
        ]}
        blockers={[
          needsManufacturingDrawing ? "此料號尚未指定製造圖，DVT / Release gate 可能會阻擋。" : "製造圖關聯可在下方關係維護區確認。",
          warnings.length > 0 ? `此料號有 ${warnings.length} 則提醒未收斂。` : "目前沒有未確認提醒。",
          partNumber.recordStatus === "MainDrawingInvalid" ? "主圖失效，需重新送審並指定有效製造圖。" : "狀態可用時可接續送審或補關聯。"
        ]}
        nextStep={
          needsManufacturingDrawing
            ? "先在關係維護區選定此料號與製造圖，建立製造依據。"
            : "確認關聯圖號、提醒與狀態後，再接續送審或新增相關圖號。"
        }
        primaryAction={
          primaryDrawingNumber
            ? {
                href: `/drawings/${encodeURIComponent(primaryDrawingNumber)}/submission-workbench`,
                label: "檢查送審條件"
              }
            : undefined
        }
        secondaryActions={[
          { href: "/numbering/tasks", label: "看待辦 / 草稿" },
          { href: "/numbering/impact", label: "製造圖影響分析" }
        ]}
      />
    );
  }

  if (target.entityType === "drawing_number") {
    const drawingNumber = detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber);
    if (!drawingNumber) return <DetailTargetLifecyclePanel detail={detail} target={{ entityType: "part_root", rootCode: detail.root.rootCode }} />;
    const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
    const warnings = detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id && !warning.acknowledgedAt);
    return (
      <ObjectLifecycleStatusPanel
        title="這個圖號目前狀態"
        objectName={`${drawingNumber.drawingNumber} / ${drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}`}
        status={drawingNumber.recordStatus}
        phase={drawingNumber.developmentPhase}
        owner="RD / Manager"
        identities={[
          { label: "圖號", value: drawingNumber.drawingNumber },
          { label: "主根號", value: detail.root.rootCode },
          { label: "用途", value: purposeLabel(drawingNumber.purposeCode) },
          { label: "關聯料號", value: links.length }
        ]}
        blockers={[
          isReferenceDrawingPurpose(drawingNumber.purposeCode) ? "參考圖不可作為製造基準。" : links.length === 0 ? "此圖號尚未關聯料號。" : "關聯料號可在下方關係區檢查。",
          warnings.length > 0 ? `此圖號有 ${warnings.length} 則提醒未收斂。` : "目前沒有未確認提醒。",
          drawingNumber.recordStatus === "Draft" ? "送審前需確認圖料關係與附件。" : "狀態可用時可接續送審或影響分析。"
        ]}
        nextStep={
          links.length === 0
            ? "先在關係維護區選定此圖號與料號，建立關係。"
            : isManufacturingDrawingPurpose(drawingNumber.purposeCode)
              ? "確認受影響料號後，再送審或做製造圖影響分析。"
              : "確認參考圖用途與關聯料號，避免誤當製造依據。"
        }
        primaryAction={{
          href: `/drawings/${encodeURIComponent(drawingNumber.drawingNumber)}/submission-workbench`,
          label: drawingNumber.recordStatus === "Released" ? "檢查新版送審條件" : "檢查送審條件"
        }}
        secondaryActions={[
          { href: "/numbering/tasks", label: "看待辦 / 草稿" },
          { href: "/numbering/impact", label: "製造圖影響分析" }
        ]}
      />
    );
  }

  const primaryPart = detail.partNumbers[0] ?? null;
  const primaryDrawing = detail.drawingNumbers.find((drawingNumber) => drawingNumber.isPrimaryManufacturing) ?? detail.drawingNumbers[0] ?? null;
  return (
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
        detail.summary.primaryManufacturingCount === 0 ? "尚未找到製造基準關聯" : "製造基準關聯可在下方圖號區檢查",
        detail.summary.warningCount > 0 ? `仍有 ${detail.summary.warningCount} 則提醒未收斂` : "目前沒有未確認提醒"
      ]}
      nextStep={detail.root.recordStatus === "Released" ? "若要改版，先進行 ECR / 影響分析，再建立新版送審。" : "RD 需接續送審或補齊缺口；主管核准後才會進入已發布。"}
      primaryAction={
        primaryDrawing
          ? {
              href: `/drawings/${encodeURIComponent(primaryDrawing.drawingNumber)}/submission-workbench`,
              label: detail.root.recordStatus === "Released" ? "檢查新版送審條件" : "檢查送審條件"
            }
          : undefined
      }
      secondaryActions={[
        { href: "/numbering/tasks", label: "看待辦 / 草稿" },
        { href: "/numbering/impact", label: "製造圖影響分析" }
      ]}
    />
  );
}

function DetailTargetActionSection({
  detail,
  target,
  formalChildCount,
  onChanged
}: {
  detail: RootDetail;
  target: DetailTarget;
  formalChildCount: number;
  onChanged: () => Promise<void>;
}) {
  if (target.entityType === "part_number") {
    const partNumber = detail.partNumbers.find((part) => part.partNumber === target.partNumber);
    if (!partNumber) return null;
    const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
    return (
      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>此料號可執行</h3>
        <NumberingContextualEntrypoints
          mode="part"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          part={{
            partNumber: partNumber.partNumber,
            partName: partNumber.partName,
            recordStatus: partNumber.recordStatus,
            linkedDrawingNumbers: links.map((link) => link.drawingNumber)
          }}
          onChanged={onChanged}
        />
      </section>
    );
  }

  if (target.entityType === "drawing_number") {
    const drawingNumber = detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber);
    if (!drawingNumber) return null;
    const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
    return (
      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>此圖號可執行</h3>
        <NumberingContextualEntrypoints
          mode="drawing"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          drawing={{
            drawingNumber: drawingNumber.drawingNumber,
            purposeCode: drawingNumber.purposeCode,
            recordStatus: drawingNumber.recordStatus,
            linkedPartNumbers: links.map((link) => link.partNumber)
          }}
          onChanged={onChanged}
        />
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>新增相關資料</h3>
      <NumberingContextualEntrypoints
        mode="root"
        rootCode={detail.root.rootCode}
        coreName={detail.root.coreName}
        rootRecordStatus={detail.root.recordStatus}
        rootFormalChildCount={formalChildCount}
        rootPartCount={detail.summary.partCount}
        rootDrawingCount={detail.summary.drawingCount}
        onChanged={onChanged}
      />
    </section>
  );
}

function DetailTargetCoreSections({ detail, target }: { detail: RootDetail; target: DetailTarget }) {
  const targetDrawingNumber = target.entityType === "drawing_number" ? target.drawingNumber : "";
  const targetPartNumber = target.entityType === "part_number" ? target.partNumber : "";
  const [partDetail, setPartDetail] = useState<PartEntityDetail | null>(null);
  const [drawingDetail, setDrawingDetail] = useState<DrawingEntityDetail | null>(null);
  const [canReviewApprovals, setCanReviewApprovals] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPartDetail(null);
    setDrawingDetail(null);
    setCanReviewApprovals(false);
    setLoadError("");

    if (target.entityType === "part_root") {
      setLoadState("idle");
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setLoadState("loading");

    async function loadOwnerDetail() {
      try {
        if (target.entityType === "part_number" && targetPartNumber) {
          const response = await fetch(`/api/parts/${encodeURIComponent(targetPartNumber)}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`料號 owner detail 載入失敗 (${response.status})`);
          const body = (await response.json()) as { part?: PartEntityDetail };
          if (!cancelled) setPartDetail(body.part ?? null);
        } else if (target.entityType === "drawing_number" && targetDrawingNumber) {
          const params = new URLSearchParams({ query: targetDrawingNumber, limit: "10" });
          const response = await fetch(`/api/numbering/drawings?${params.toString()}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`圖號 owner detail 載入失敗 (${response.status})`);
          const body = (await response.json()) as { drawings?: DrawingEntityDetail[]; approvalProjection?: { canReview?: boolean } };
          const exactDrawing = (body.drawings ?? []).find((drawing) => drawing.drawingNumber === targetDrawingNumber) ?? null;
          if (!cancelled) {
            setDrawingDetail(exactDrawing);
            setCanReviewApprovals(Boolean(body.approvalProjection?.canReview));
          }
        }
        if (!cancelled) setLoadState("ready");
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (!cancelled) {
          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "owner detail 載入失敗");
        }
      }
    }

    void loadOwnerDetail();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [target.entityType, targetDrawingNumber, targetPartNumber]);

  if (target.entityType === "drawing_number") {
    const drawing = detail.drawingNumbers.find((item) => item.drawingNumber === target.drawingNumber);
    if (!drawing) return null;
    return (
      <TargetDrawingCoreSections
        detail={detail}
        drawing={drawing}
        ownerDrawing={drawingDetail}
        canReviewApprovals={canReviewApprovals}
        loadState={loadState}
        loadError={loadError}
      />
    );
  }

  if (target.entityType === "part_number") {
    const part = detail.partNumbers.find((item) => item.partNumber === target.partNumber);
    if (!part) return null;
    return <TargetPartCoreSections detail={detail} part={part} ownerPart={partDetail} loadState={loadState} loadError={loadError} />;
  }

  return <TargetRootCoreSection detail={detail} />;
}

function TargetRootCoreSection({ detail }: { detail: RootDetail }) {
  const primaryDrawing = detail.drawingNumbers.find((drawing) => drawing.isPrimaryManufacturing) ?? detail.drawingNumbers[0] ?? null;
  const primaryPart = detail.partNumbers[0] ?? null;
  return (
    <section style={sectionStyle} data-entity-core-section="root-identity">
      <h3 style={sectionHeadingStyle}>主根資訊</h3>
      <div style={targetInfoGridStyle}>
        <TargetInfoBlock icon={<FileText size={16} />} title="主根號" value={detail.root.rootCode} />
        <TargetInfoBlock icon={<Palette size={16} />} title="品名" value={detail.root.coreName} />
        <TargetInfoBlock icon={<Link2 size={16} />} title="主要料號" value={primaryPart?.partNumber ?? "尚未建立料號"} />
        <TargetInfoBlock icon={<Workflow size={16} />} title="主要圖號" value={primaryDrawing?.drawingNumber ?? "尚未建立圖號"} />
      </div>
    </section>
  );
}

function TargetDrawingCoreSections({
  detail,
  drawing,
  ownerDrawing,
  canReviewApprovals,
  loadState,
  loadError
}: {
  detail: RootDetail;
  drawing: DrawingNumber;
  ownerDrawing: DrawingEntityDetail | null;
  canReviewApprovals: boolean;
  loadState: "idle" | "loading" | "ready" | "error";
  loadError: string;
}) {
  const links = detail.links.filter((link) => link.drawingNumberId === drawing.id);
  const linkedParts = detail.partNumbers.filter((part) => links.some((link) => link.partNumberId === part.id));
  const ownerParts = ownerDrawing?.sameRootParts ?? [];
  const incompleteParts = ownerParts.filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
  const missingCostParts = ownerParts.filter((part) => part.standardCostStatus === "missing");
  const readinessMasterData = ownerDrawing
    ? incompleteParts.length > 0
      ? `${incompleteParts.length} 筆待補`
      : "完成"
    : links.length > 0
      ? `已關聯 ${links.length} 筆料號`
      : "尚未關聯料號";
  const readinessCost = ownerDrawing ? (missingCostParts.length > 0 ? `${missingCostParts.length} 筆待補` : "完成") : "由料號 owner detail 同步";

  return (
    <>
      <MasterAttachmentPanel
        entityType="drawing_number"
        entityCode={drawing.drawingNumber}
        developmentPhase={drawing.developmentPhase}
        processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}
        pendingRevisionReviews={ownerDrawing?.pendingApproval ? { ...ownerDrawing.pendingApproval, canReview: canReviewApprovals } : null}
      />

      <section style={sectionStyle} data-entity-core-section="drawing-readiness">
        <h3 style={sectionHeadingStyle}>送審檢查</h3>
        <EntityDetailLoadNotice loadState={loadState} loadError={loadError} entityLabel="圖號" />
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<FileText size={16} />} title="圖面附件" value="下方圖號附件庫使用圖號主檔 API" />
          <TargetInfoBlock icon={<Link2 size={16} />} title="主資料" value={readinessMasterData} tone={incompleteParts.length > 0 || links.length === 0 ? "danger" : "success"} />
          <TargetInfoBlock icon={<DollarSign size={16} />} title="標準成本" value={readinessCost} tone={missingCostParts.length > 0 ? "danger" : "success"} />
          {ownerDrawing?.pendingApproval ? (
            <TargetInfoBlock
              icon={<ClipboardCheck size={16} />}
              title="進版審核"
              value={canReviewApprovals ? `${ownerDrawing.pendingApproval.count} 筆待審` : "等待主管審核"}
              tone="warning"
            />
          ) : null}
          <TargetInfoBlock
            icon={<ShieldAlert size={16} />}
            title="影響分析"
            value={isManufacturingDrawingPurpose(drawing.purposeCode) ? `${links.length} 筆受影響料號` : "參考圖不作為製造基準"}
          />
        </div>
        {ownerDrawing?.titleBlockVariantWarning ? <p style={dangerTextStyle}>同一張製造圖對應多個料號，且圖面描述疑似寫死變體，送審前需確認 title block。</p> : null}
      </section>

      <section style={sectionStyle} data-entity-core-section="drawing-linked-parts">
        <h3 style={sectionHeadingStyle}>同主根號料號</h3>
        <div style={cardListStyle}>
          {ownerParts.length > 0
            ? ownerParts.map((part) => <DrawingOwnerPartSummaryCard part={part} key={part.id} />)
            : linkedParts.map((part) => <DrawingFallbackPartSummaryCard part={part} links={links} key={part.id} />)}
          {ownerParts.length === 0 && linkedParts.length === 0 ? <EmptyBlock text="此圖號尚未關聯料號。" /> : null}
        </div>
      </section>
    </>
  );
}

function TargetPartCoreSections({
  detail,
  part,
  ownerPart,
  loadState,
  loadError
}: {
  detail: RootDetail;
  part: PartNumber;
  ownerPart: PartEntityDetail | null;
  loadState: "idle" | "loading" | "ready" | "error";
  loadError: string;
}) {
  const links = detail.links.filter((link) => link.partNumberId === part.id);
  const linkedDrawings = ownerPart?.linkedDrawings ?? links.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, linkType: link.linkType }));
  const variants = ownerPart?.sameDrawingVariants ?? detail.variants.filter((variant) => variant.partNumberId === part.id);
  const variant = ownerPart?.variant ?? null;
  const standardCost = ownerPart?.standardCost ?? null;
  const pendingCostRequests = ownerPart?.pendingCostRequestCount ?? ownerPart?.costChangeRequests.filter((request) => request.reviewStatus === "pending").length ?? 0;
  const hasManufacturingDrawing = linkedDrawings.some((link) => link.linkType === "primary_manufacturing");
  const hasVariantBasics = Boolean((variant?.materialLabel || variant?.materialCode)?.trim()) && Boolean(variant?.surfaceTreatment?.trim());

  return (
    <>
      <MasterAttachmentPanel entityType="part_number" entityCode={part.partNumber} />

      <section style={sectionStyle} data-entity-core-section="part-readiness">
        <h3 style={sectionHeadingStyle}>料號完整度檢查</h3>
        <EntityDetailLoadNotice loadState={loadState} loadError={loadError} entityLabel="料號" />
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<Link2 size={16} />} title="製造圖關聯" value={hasManufacturingDrawing ? "已建立製造基準關聯" : "尚未建立製造基準關聯"} tone={hasManufacturingDrawing ? "success" : "danger"} />
          <TargetInfoBlock icon={<Palette size={16} />} title="料號屬性" value={hasVariantBasics ? "材質與表面處理已填" : "材質或表面處理待補"} tone={hasVariantBasics ? "success" : "danger"} />
          <TargetInfoBlock icon={<DollarSign size={16} />} title="標準成本" value={formatPartStandardCost(standardCost)} tone={standardCost ? "success" : "danger"} />
          <TargetInfoBlock icon={<FileText size={16} />} title="成本審核" value={pendingCostRequests > 0 ? `${pendingCostRequests} 筆待審` : "目前無待審成本"} tone={pendingCostRequests > 0 ? "danger" : "success"} />
        </div>
      </section>

      <section style={sectionStyle} data-entity-core-section="part-linked-drawings">
        <h3 style={sectionHeadingStyle}>圖號關聯</h3>
        <div style={cardListStyle}>
          {linkedDrawings.map((link) => (
            <article style={recordCardStyle} key={link.id}>
              <div style={recordTitleStyle}>
                <strong>{link.drawingNumber}</strong>
                <span className="pdm-meta-chip">{relationLinkTypeLabel(link.linkType as NumberingLink["linkType"])}</span>
              </div>
              <div style={mutedTextStyle}>{link.drawingNumber === ownerPart?.primaryDrawingNumber || link.linkType === "primary_manufacturing" ? "製造基準" : "參考 / 關聯圖號"}</div>
            </article>
          ))}
          {linkedDrawings.length === 0 ? <EmptyBlock text="此料號尚未關聯圖號。" /> : null}
        </div>
      </section>

      <section style={sectionStyle} data-entity-core-section="part-attributes">
        <h3 style={sectionHeadingStyle}>料號屬性</h3>
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<FileText size={16} />} title="材質" value={variant?.materialLabel || variant?.materialCode || "未設定"} />
          <TargetInfoBlock icon={<Palette size={16} />} title="顏色" value={variant?.colorLabel || variant?.colorCode || "未設定"} />
          <TargetInfoBlock icon={<Workflow size={16} />} title="表面處理" value={variant?.surfaceTreatment || "未設定"} />
          <TargetInfoBlock icon={<FileText size={16} />} title="同圖差異欄位" value={variants.length > 0 ? variants.map((item) => `${item.fieldName}=${item.fieldValue}`).join("、") : "無"} />
        </div>
      </section>

      <section style={sectionStyle} data-entity-core-section="part-3d-baseline">
        <h3 style={sectionHeadingStyle}>3D 基準</h3>
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<Workflow size={16} />} title="共用 3D / MA 製造基準" value="在料號模組維護，並放在成本作業前確認。" />
          <TargetInfoBlock icon={<Link2 size={16} />} title="料號模組" value="開啟後可建立共用 3D 與製造基準包" />
        </div>
        <div style={actionGroupStyle}>
          <a className="secondary-button" href={`/parts?detail=${encodeURIComponent(part.partNumber)}`}>
            <Workflow size={16} />
            開啟 3D 基準
          </a>
        </div>
      </section>

      <section style={sectionStyle} data-entity-core-section="part-cost">
        <h3 style={sectionHeadingStyle}>成本狀態</h3>
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<DollarSign size={16} />} title="標準成本" value={formatPartStandardCost(standardCost)} tone={standardCost ? "success" : "danger"} />
          <TargetInfoBlock icon={<FileText size={16} />} title="成本設定檔" value={ownerPart ? `${ownerPart.costProfiles.length} 筆` : "owner detail 載入後同步"} />
          <TargetInfoBlock icon={<ShieldAlert size={16} />} title="待審成本" value={pendingCostRequests > 0 ? `${pendingCostRequests} 筆待審` : "無"} tone={pendingCostRequests > 0 ? "danger" : "success"} />
          <TargetInfoBlock icon={<Link2 size={16} />} title="料號模組" value="同一 owner detail API" />
        </div>
        <div style={actionGroupStyle}>
          <a className="secondary-button" href={`/parts?detail=${encodeURIComponent(part.partNumber)}&focus=cost`}>
            <DollarSign size={16} />
            補標準成本
          </a>
          <a className="secondary-button" href={`/parts?detail=${encodeURIComponent(part.partNumber)}`}>
            <FileText size={16} />
            補主資料
          </a>
        </div>
      </section>
    </>
  );
}

function EntityDetailLoadNotice({ loadState, loadError, entityLabel }: { loadState: "idle" | "loading" | "ready" | "error"; loadError: string; entityLabel: string }) {
  if (loadState === "loading") return <p style={mutedTextStyle}>正在同步{entityLabel} owner detail...</p>;
  if (loadState === "error") return <p style={dangerTextStyle}>{loadError}；目前先顯示圖料關係中的可用資料。</p>;
  return null;
}

function TargetInfoBlock({ icon, title, value, tone = "default" }: { icon: ReactNode; title: string; value: ReactNode; tone?: "default" | "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : tone === "warning" ? "#92400e" : "var(--accent-3)";
  return (
    <div className="info-block">
      <span style={{ color }}>{icon}</span>
      <strong>{title}</strong>
      <p style={{ color: tone === "default" ? undefined : color }}>{value}</p>
    </div>
  );
}

function DrawingOwnerPartSummaryCard({ part }: { part: DrawingEntityLinkedPart }) {
  const missingMasterData = !(part.materialLabel || part.materialCode) || !part.surfaceTreatment;
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{part.partNumber}</strong>
        <StatusBadge status={part.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{part.partName}</div>
      <div style={targetInfoGridStyle}>
        <TargetInfoBlock icon={<FileText size={16} />} title="材質" value={part.materialLabel || part.materialCode || "未填"} tone={missingMasterData ? "danger" : "default"} />
        <TargetInfoBlock icon={<Palette size={16} />} title="顏色" value={part.colorLabel || part.colorCode || "未填"} />
        <TargetInfoBlock icon={<Workflow size={16} />} title="變體" value={[part.surfaceTreatment, part.variantNote].filter(Boolean).join(" / ") || "未填"} tone={missingMasterData ? "danger" : "default"} />
        <TargetInfoBlock icon={<DollarSign size={16} />} title="成本" value={part.standardCostProfileName ? `active / ${part.standardCostProfileName}` : part.standardCostStatus === "active" ? "active" : "未設定"} tone={part.standardCostStatus === "missing" ? "danger" : "success"} />
      </div>
    </article>
  );
}

function DrawingFallbackPartSummaryCard({ part, links }: { part: PartNumber; links: NumberingLink[] }) {
  const relation = links.find((link) => link.partNumberId === part.id);
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{part.partNumber}</strong>
        <StatusBadge status={part.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{part.partName}</div>
      <div style={metaRowStyle}>
        <span>{kindLabel(part.itemKind)}</span>
        <span>{formatDevelopmentPhaseForUser(part.developmentPhase)}</span>
        <span>{relation ? relationLinkTypeLabel(relation.linkType) : "尚未關聯"}</span>
      </div>
    </article>
  );
}

function formatPartStandardCost(value: PartStandardCost | null) {
  if (!value) return "尚未設定標準成本";
  if (value.unitCost === null) return `${value.profileName}: 標準成本已設定`;
  return `${value.profileName}: ${value.currency} ${formatNumber(value.unitCost)} / ${value.uom}`;
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(value);
}

function RelationMaintenancePanel({
  detail,
  target,
  onRelationChange
}: {
  detail: RootDetail;
  target: DetailTarget;
  onRelationChange: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void>;
}) {
  const targetDrawing = target.entityType === "drawing_number" && detail.drawingNumbers.some((drawing) => drawing.drawingNumber === target.drawingNumber) ? target.drawingNumber : "";
  const targetPart = target.entityType === "part_number" && detail.partNumbers.some((part) => part.partNumber === target.partNumber) ? target.partNumber : "";
  const firstDrawing = targetDrawing || detail.drawingNumbers[0]?.drawingNumber || "";
  const firstPart = targetPart || detail.partNumbers[0]?.partNumber || "";
  const [drawingNumber, setDrawingNumber] = useState(firstDrawing);
  const [partNumber, setPartNumber] = useState(firstPart);
  const [workingOperation, setWorkingOperation] = useState<RelationMaintenanceOperation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDrawingNumber(firstDrawing);
    setPartNumber(firstPart);
    setMessage("");
  }, [detail.root.id, firstDrawing, firstPart]);

  if (detail.drawingNumbers.length === 0 || detail.partNumbers.length === 0) return null;
  const selectedDrawing = detail.drawingNumbers.find((drawing) => drawing.drawingNumber === drawingNumber) ?? detail.drawingNumbers[0];
  const selectedPart = detail.partNumbers.find((part) => part.partNumber === partNumber) ?? detail.partNumbers[0];
  const existingLinks = detail.links.filter((link) => link.drawingNumber === selectedDrawing?.drawingNumber && link.partNumber === selectedPart?.partNumber);
  const locked = [detail.root.recordStatus, selectedDrawing?.recordStatus, selectedPart?.recordStatus].some((status) =>
    ["PendingReview", "Released", "Obsolete", "Merged", "EVTDisabled"].includes(status ?? "")
  );

  async function submit(operation: RelationMaintenanceOperation) {
    if (!selectedDrawing || !selectedPart) return;
    setWorkingOperation(operation);
    setMessage("");
    try {
      await onRelationChange({ operation, drawingNumber: selectedDrawing.drawingNumber, partNumber: selectedPart.partNumber });
      setMessage("已完成關係維護並寫入 audit。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "關係維護失敗，請重新整理後再試。");
    } finally {
      setWorkingOperation(null);
    }
  }

  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>關係維護</h3>
      <div style={recordCardStyle}>
        <div style={recordTitleStyle}>
          <strong>受控圖料關係</strong>
          <span className="pdm-meta-chip">{locked ? "狀態鎖定" : existingLinks.length > 0 ? "已有關聯" : "未建立關聯"}</span>
        </div>
        <div className="pdm-relation-maintenance-grid">
          <label>
            <span>圖號</span>
            <select value={drawingNumber} onChange={(event) => setDrawingNumber(event.target.value)}>
              {detail.drawingNumbers.map((drawing) => (
                <option value={drawing.drawingNumber} key={drawing.id}>
                  {drawing.drawingNumber} / {purposeLabel(drawing.purposeCode)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>料號</span>
            <select value={partNumber} onChange={(event) => setPartNumber(event.target.value)}>
              {detail.partNumbers.map((part) => (
                <option value={part.partNumber} key={part.id}>
                  {part.partNumber} / {part.partName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={metaRowStyle}>
          <span>目前關係：{existingLinks.length > 0 ? existingLinks.map((link) => relationLinkTypeLabel(link.linkType)).join("、") : "尚未關聯"}</span>
          <span>Owner API / audit gate</span>
        </div>
        <div style={actionGroupStyle}>
          <button className="secondary-button" type="button" disabled={locked || Boolean(workingOperation)} onClick={() => void submit("link")}>
            <Link2 size={16} />
            建立/更新
          </button>
          <button className="secondary-button" type="button" disabled={locked || Boolean(workingOperation) || !selectedDrawing || !isManufacturingDrawingPurpose(selectedDrawing.purposeCode)} onClick={() => void submit("set_primary")}>
            製造依據
          </button>
          <button className="secondary-button" type="button" disabled={locked || Boolean(workingOperation)} onClick={() => void submit("set_reference")}>
            參考
          </button>
          <button className="secondary-button danger-button" type="button" disabled={locked || Boolean(workingOperation) || existingLinks.length === 0} onClick={() => void submit("remove")}>
            移除關聯
          </button>
        </div>
        {message ? <div className={message.includes("失敗") || message.includes("LOCKED") ? "pdm-relation-maintenance-message error" : "pdm-relation-maintenance-message"}>{message}</div> : null}
      </div>
    </section>
  );
}

function PartNumberCard({
  partNumber,
  detail,
  selected,
  showEntrypoints,
  onChanged
}: {
  partNumber: PartNumber;
  detail: RootDetail;
  selected: boolean;
  showEntrypoints: boolean;
  onChanged: () => Promise<void>;
}) {
  const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
  const variants = detail.variants.filter((variant) => variant.partNumberId === partNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id && !warning.acknowledgedAt);
  const missingPrimaryMa = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && ["DVT", "Release"].includes(partNumber.developmentPhase) && !links.some((link) => link.linkType === "primary_manufacturing");
  return (
    <article style={selected ? selectedRecordCardStyle : recordCardStyle}>
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
        {missingPrimaryMa ? <WarningDot title="DVT 或正式階段的自製、發包、客製件缺製造基準關聯時會被關卡阻擋，需補圖或走 override。" /> : null}
        {partNumber.recordStatus === "MainDrawingInvalid" ? <WarningDot title="製造基準關聯已失效，料號需重新送審並指定有效製造圖後才能恢復使用。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此料號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
      </div>
      {showEntrypoints ? (
        <NumberingContextualEntrypoints
          mode="part"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          part={{
            partNumber: partNumber.partNumber,
            partName: partNumber.partName,
            recordStatus: partNumber.recordStatus,
            linkedDrawingNumbers: links.map((link) => link.drawingNumber)
          }}
          onChanged={onChanged}
        />
      ) : null}
    </article>
  );
}

function DrawingNumberCard({
  drawingNumber,
  detail,
  busy,
  selected,
  showEntrypoints,
  onAnalyzeImpact,
  onChanged
}: {
  drawingNumber: DrawingNumber;
  detail: RootDetail;
  busy: "search" | "detail" | "impact" | null;
  selected: boolean;
  showEntrypoints: boolean;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onChanged: () => Promise<void>;
}) {
  const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
  const variants = detail.variants.filter((variant) => variant.drawingNumberId === drawingNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id && !warning.acknowledgedAt);
  return (
    <article style={selected ? selectedRecordCardStyle : recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{drawingNumber.drawingNumber}</strong>
        <StatusBadge status={drawingNumber.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}</div>
      <div style={metaRowStyle}>
        <span>{purposeLabel(drawingNumber.purposeCode)}</span>
        <span>{formatDevelopmentPhaseForUser(drawingNumber.developmentPhase)}</span>
        <span>{drawingNumber.isPrimaryManufacturing ? "製造基準關聯" : "參考/其他"}</span>
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
        {isReferenceDrawingPurpose(drawingNumber.purposeCode) ? <WarningDot title="參考圖必填用途描述，且不可作為製造基準。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此圖號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.partNumber} ${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
        {isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? (
          <button className="secondary-button" type="button" disabled={busy === "impact"} onClick={() => onAnalyzeImpact(drawingNumber.drawingNumber)}>
            <ShieldAlert size={16} />
            影響範圍
          </button>
        ) : null}
      </div>
      {showEntrypoints ? (
        <NumberingContextualEntrypoints
          mode="drawing"
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          drawing={{
            drawingNumber: drawingNumber.drawingNumber,
            purposeCode: drawingNumber.purposeCode,
            recordStatus: drawingNumber.recordStatus,
            linkedPartNumbers: links.map((link) => link.partNumber)
          }}
          onChanged={onChanged}
        />
      ) : null}
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
const selectedRecordCardStyle = {
  ...recordCardStyle,
  borderColor: "rgba(14, 165, 164, 0.55)",
  boxShadow: "inset 3px 0 0 #0ea5a4"
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
const targetInfoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "0.65rem"
};
const dangerTextStyle = {
  margin: 0,
  color: "var(--danger)"
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
