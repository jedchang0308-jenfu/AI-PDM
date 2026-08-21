"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, FileSearch, FileText, Grid2X2, Link2, ListTree, Palette, RotateCcw, Search, ShieldAlert, Workflow } from "lucide-react";
import { RiskHint } from "@/components/compact-hints";
import { ObjectLifecycleStatusPanel } from "@/components/lifecycle-ux";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import { NextStepState } from "@/components/next-step-state";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import { NumberStateModuleTabs, NumberStateOwnerCreateAction, NumberStateWorkspaceWorkbench } from "@/components/number-state-workspace";
import { NumberSortHeader } from "@/components/number-sort-header";
import { SearchHighlight } from "@/components/search-highlight";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { RelationWorkbench } from "@/components/relation-workbench";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { HumanStatusFilterSelect } from "@/components/human-status-filter";
import { DrawingDetailContent, type DrawingDetail, type DrawingWorkbenchCapabilities } from "@/components/drawing-workbench";
import { PartDetailPanel, type PartDetail } from "@/components/part-detail-content";
import { copyTextToClipboardBestEffort } from "@/lib/client-clipboard";
import type { DrawingWorkbenchRow } from "@/lib/drawing-workbench";
import { shouldActivateLinkFromKeyboard } from "@/lib/keyboard-link-activation";
import { DEFAULT_NUMBER_SORT_DIRECTION, parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";
import { StatusBadge } from "@/components/status-help-popover";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import { normalizeWorkStatusQuery, type WorkStatusFilter } from "@/lib/work-status-presentation";
import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { resolveNumberingSearchDetailTarget, shouldDeferNumberingSearchShortcut, type NumberingSearchDetailTarget } from "@/lib/numbering-search-target";
import { formatStatusErrorForUser, formatStatusForUser, masterRecordStatusFilterValues } from "@/lib/status-display";
import type { RelationActiveChange } from "@/lib/relation-workbench";
import type { ResponsibilityStatusProjection, ViewerActionabilityProjection } from "@/lib/responsibility-status-projection";

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
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
type DrawingPurposeCode = "MA" | "OT" | "M" | "R";
type SearchResult = {
  entityType: Exclude<EntityType, "all">;
  entityId: string;
  rootCode: string;
  coreName: string;
  displayCode: string;
  displayName: string;
  itemKind: "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
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
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
  humanStatus?: HumanStatusProjection;
  responsibilityStatus?: ResponsibilityStatusProjection;
  viewerActionability?: ViewerActionabilityProjection;
  viewerStatus?: ViewerHumanStatusProjection;
  availabilityScope?: AvailabilityScopeProjection;
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
  recordStatus: NumberingRecordStatus;
  universalReason: string | null;
  ruleVersionId: string;
  humanStatus?: HumanStatusProjection;
  responsibilityStatus?: ResponsibilityStatusProjection;
  viewerActionability?: ViewerActionabilityProjection;
  viewerStatus?: ViewerHumanStatusProjection;
  availabilityScope?: AvailabilityScopeProjection;
};

type DrawingNumber = {
  id: string;
  partRootId: string;
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription: string;
  sequenceNo: number;
  isPrimaryManufacturing: boolean;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
  humanStatus?: HumanStatusProjection;
  responsibilityStatus?: ResponsibilityStatusProjection;
  viewerActionability?: ViewerActionabilityProjection;
  viewerStatus?: ViewerHumanStatusProjection;
  availabilityScope?: AvailabilityScopeProjection;
};

type PartVariant = {
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
};

type PartEntityDetail = {
  id: string;
  rootCode: string;
  coreName: string;
  partNumber: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  recordStatus: NumberingRecordStatus;
  variant: PartVariant | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  linkedDrawings: Array<{ id: string; drawingNumber: string; linkType: NumberingLink["linkType"] | string }>;
  sameDrawingVariants: Array<{ id: string; drawingNumber: string; fieldName: string; fieldValue: string }>;
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
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
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

type RelationSeverity = "ok" | "info" | "warning" | "blocked";

type DrawingPartRelationRoot = {
  rootId: string;
  rootCode: string;
  coreName: string;
  recordStatus: NumberingRecordStatus;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  relationshipHealth: "complete" | "missing_manufacturing_drawing" | "missing_part" | "ambiguous" | "blocked" | "draft";
  relationshipLabel: string;
  nextStep: { label: string; target?: string; severity: RelationSeverity };
  drawings: DrawingPartRelationDrawing[];
  parts: DrawingPartRelationPart[];
  matrix: DrawingPartRelationCell[];
  blockers: Array<{ code: string; message: string; target: "root" | "drawing" | "part" | "relationship"; targetId?: string }>;
  changeReviews: DrawingPartRelationChangeReview[];
};

type DrawingPartRelationChangeReview = {
  id: string;
  title: string;
  statusLabel: string;
  summary: string;
  drawings: Array<{
    id: string;
    drawingNumber: string;
    purposeLabel: "製造圖" | "參考圖";
    isReferenceOnly: boolean;
    reviewAvailabilityLabel: string;
    linkedPartNumbers: string[];
    nextStep: string;
  }>;
  parts: Array<{
    id: string;
    partNumber: string;
    partName: string;
    role: string;
    roleByDrawing: Record<string, string>;
    hasManufacturingDrawing: boolean;
  }>;
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
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  linkedPartNumbers: string[];
  nextStep: string;
};

type DrawingPartRelationPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  recordStatus: NumberingRecordStatus;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
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
type DetailTarget = NumberingSearchDetailTarget;

type OwnerHeaderProjection = {
  targetKey: string;
  entityType: "drawing_number" | "part_number";
  entityCode: string;
  name: string;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
};

const statusOptions = masterRecordStatusFilterValues;
const SEARCH_DRAWER_WIDTH_STORAGE_KEY = "pdm-search-detail-drawer-width";
function shouldDeferShortcutToFocusedControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const control = target.closest("input, textarea, select, button, a, [role='button'], [role='link'], [contenteditable='true'], [contenteditable='']");
  if (!(control instanceof HTMLElement)) return false;
  return shouldDeferNumberingSearchShortcut({
    tagName: control.tagName,
    role: control.getAttribute("role"),
    isContentEditable: control.isContentEditable
  });
}

function openDetailTargetFromKeyboard(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  target: DetailTarget,
  onOpenDetailTarget: (target: DetailTarget) => void
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  onOpenDetailTarget(target);
}

function activateSearchLinkFromKeyboard(event: ReactKeyboardEvent<HTMLAnchorElement>) {
  if (!shouldActivateLinkFromKeyboard(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}

function hasSelectedText() {
  return Boolean(window.getSelection()?.toString());
}

export default function NumberingSearchPage() {
  const [workbenchEnabled, setWorkbenchEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/numbering/state-flow/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { partRelationWorkbench?: { enabled?: boolean } }) => {
        if (!cancelled) setWorkbenchEnabled(body.partRelationWorkbench?.enabled === true);
      })
      .catch(() => { if (!cancelled) setWorkbenchEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  if (workbenchEnabled === null) return <section className="panel"><div className="empty">正在確認圖料工作台狀態...</div></section>;
  if (!workbenchEnabled) return <LegacyNumberingSearchPage />;
  return <RelationWorkbench renderRootDetail={({ detail, detailTarget, activeChanges, onOpenChange, impact, busy, width, onAnalyzeImpact, onRelationChange, onChanged, onCanonicalOwnerProjection, onStartResize, onClose, returnTo }) => (
    <RootDetailDrawer
      detail={detail as RootDetail}
      detailTarget={detailTarget}
      activeChanges={activeChanges}
      onOpenChange={onOpenChange}
      impact={impact as ImpactAnalysis | null}
      busy={busy}
      open
      width={width}
      onAnalyzeImpact={onAnalyzeImpact}
      onRelationChange={onRelationChange}
      onChanged={onChanged}
      onCanonicalOwnerProjection={onCanonicalOwnerProjection as (projection: OwnerHeaderProjection) => void}
      onStartResize={onStartResize}
      onClose={onClose}
      returnTo={returnTo}
    />
  )} />;
}

function LegacyNumberingSearchPage() {
  const [activeTab, setActiveTab] = useState<"official" | "reserved" | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesCodeOptions, setSeriesCodeOptions] = useState<string[]>([]);
  const [entityType, setEntityType] = useState<EntityType>("all");
  const [recordStatus, setRecordStatus] = useState("");
  const [humanStatus, setHumanStatus] = useState<WorkStatusFilter>("all");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [sortDirection, setSortDirection] = useState<NumberSortDirection>(DEFAULT_NUMBER_SORT_DIRECTION);
  const [viewMode, setViewMode] = useState<RelationViewMode>("tree");
  const [relationRoots, setRelationRoots] = useState<DrawingPartRelationRoot[]>([]);
  const [expandedRootCodes, setExpandedRootCodes] = useState<Set<string>>(new Set());
  const [selectedRootCode, setSelectedRootCode] = useState<string | null>(null);
  const selectedRootCodeRef = useRef<string | null>(null);
  const initialDetailRootCodeRef = useRef<string | null>(null);
  const searchListRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<RootDetail | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const { drawerWidth, startDrawerResize: startDetailDrawerResize } = useRememberedDrawerWidth({
    storageKey: SEARCH_DRAWER_WIDTH_STORAGE_KEY
  });
  const [busy, setBusy] = useState<"search" | "detail" | "impact" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const applyLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const workStatusQuery = normalizeWorkStatusQuery(params.get("humanStatus"), params.get("history"), null);
      setActiveTab(params.get("tab") === "reserved" ? "reserved" : "official");
      const initialQuery = params.get("query")?.trim();
      const initialEntityType = params.get("entityType") as EntityType | null;
      const initialSortDirection = parseNumberSortDirection(params.get("sortDirection"));
      const initialReturnTo = params.get("returnTo")?.trim() ?? "";
      const detailRootCode = params.get("detail")?.trim();
      setQuery(initialQuery ?? "");
      if (initialEntityType && ["all", "part_root", "part_number", "drawing_number"].includes(initialEntityType)) setEntityType(initialEntityType);
      setHumanStatus(workStatusQuery.filter);
      setIncludeHistory(workStatusQuery.includeHistory);
      setSortDirection(initialSortDirection);
      setReturnTo(initialReturnTo.startsWith("/") && !initialReturnTo.startsWith("//") ? initialReturnTo : "");
      if (detailRootCode) initialDetailRootCodeRef.current = detailRootCode;
      workStatusQuery.filter === "all" ? params.delete("humanStatus") : params.set("humanStatus", workStatusQuery.filter);
      workStatusQuery.includeHistory ? params.set("history", "include") : params.delete("history");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    };
    applyLocation();
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, []);

  useEffect(() => {
    if (activeTab === null) return;
    const params = new URLSearchParams(window.location.search);
    humanStatus === "all" ? params.delete("humanStatus") : params.set("humanStatus", humanStatus);
    includeHistory ? params.set("history", "include") : params.delete("history");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, humanStatus, includeHistory]);

  const loadDetail = useCallback(async (rootCode: string, target?: DetailTarget) => {
    const nextTarget = target ?? resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode });
    const isDifferentRoot = selectedRootCodeRef.current !== rootCode;
    setBusy("detail");
    setError("");
    selectedRootCodeRef.current = rootCode;
    setSelectedRootCode(rootCode);
    setDetailTarget(nextTarget);
    setImpact(null);
    if (isDifferentRoot) setDetail(null);
    const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}`);
    if (selectedRootCodeRef.current !== rootCode) return;
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

  const syncCanonicalOwnerProjection = useCallback((projection: OwnerHeaderProjection) => {
    const canonicalFields = {
      humanStatus: projection.humanStatus,
      responsibilityStatus: projection.responsibilityStatus,
      viewerActionability: projection.viewerActionability,
      viewerStatus: projection.viewerStatus
    };
    setRelationRoots((currentRoots) => currentRoots.map((root) => ({
      ...root,
      drawings: root.drawings.map((drawing) => projection.entityType === "drawing_number" && drawing.drawingNumber === projection.entityCode ? { ...drawing, ...canonicalFields } : drawing),
      parts: root.parts.map((part) => projection.entityType === "part_number" && part.partNumber === projection.entityCode ? { ...part, partName: projection.name, ...canonicalFields } : part)
    })));
  }, []);

  const loadResults = useCallback(async () => {
    if (activeTab !== "official") return;
    setBusy("search");
    setError("");
    const params = new URLSearchParams({ limit: "60", sortDirection });
    if (query.trim()) params.set("query", query.trim());
    if (seriesCode) params.set("seriesCode", seriesCode);
    if (entityType !== "all") params.set("entityType", entityType);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (humanStatus !== "all") params.set("humanStatus", humanStatus);
    params.set("history", includeHistory ? "include" : "exclude");
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
    setSeriesCodeOptions((body.seriesCodeOptions ?? []) as string[]);
    const currentSelection = selectedRootCodeRef.current;
    const selectedStillVisible = currentSelection && nextRoots.some((root) => root.rootCode === currentSelection);
    const nextSelectedRootCode = selectedStillVisible ? currentSelection : nextRoots[0]?.rootCode ?? null;
    setRelationRoots(nextRoots);
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
  }, [activeTab, entityType, humanStatus, includeHistory, query, recordStatus, seriesCode, sortDirection]);

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
      const previousRootCode = selectedRootCodeRef.current;
      selectedRootCodeRef.current = root.rootCode;
      setSelectedRootCode(root.rootCode);
      setExpandedRootCodes((current) => new Set(current).add(root.rootCode));
      scrollSearchRowIntoView(nextIndex);
      focusSearchList();
      if (isDetailOpen) {
        if (previousRootCode !== root.rootCode) setDetail(null);
        void loadDetail(root.rootCode);
      }
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
    void loadDetail(root.rootCode, resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode: root.rootCode }));
    focusSearchList();
  }, [focusSearchList, loadDetail, relationRoots]);

  const copySelectedRootCode = useCallback(async () => {
    const rootCode = selectedRootCodeRef.current;
    if (!rootCode) return;
    await copyTextToClipboardBestEffort(rootCode);
  }, []);

  useEffect(() => {
    if (state !== "ready" || relationRoots.length === 0) return;

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (shouldDeferShortcutToFocusedControl(event.target)) return;

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

  if (activeTab === null) return <section className="panel"><div className="empty">正在開啟圖料工作台...</div></section>;
  if (activeTab === "reserved") return <NumberStateWorkspaceWorkbench module="search" />;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖料工作台</h1>
          <p>料件、料號與圖號集中查詢，明細標示風險與影響資訊。</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={loadResults}>
            <RotateCcw size={16} />
            重新整理
          </button>
          <NumberStateOwnerCreateAction surface="search" seriesCodeOptions={seriesCodeOptions} />
        </div>
      </div>
      <NumberStateModuleTabs module="search" active="official" />

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
            <div className="pdm-master-filter-grid">
              <label className="pdm-master-field">
                <span>關鍵字</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="圖料根號 / 料號 / 圖號 / 名稱" />
              </label>
              <label className="pdm-master-field">
                <span>系列代號</span>
                <select value={seriesCode} onChange={(event) => setSeriesCode(event.target.value)}>
                  <option value="">全部</option>
                  {seriesCodeOptions.map((option) => (
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
                  <option value="part_root">圖料根號</option>
                  <option value="part_number">料號</option>
                  <option value="drawing_number">圖號</option>
                </select>
              </label>
              <label className="pdm-master-field">
                <span>資料狀態</span>
                <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
                  <option value="">全部</option>
                  {statusOptions.map((status) => (
                    <option value={status} key={status}>
                      {formatStatusForUser(status, "masterRecord")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pdm-master-field">
                <span>工作狀態</span>
                <HumanStatusFilterSelect value={humanStatus} onChange={setHumanStatus} />
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
              query={query}
              viewMode={viewMode}
              selectedRootCode={selectedRootCode}
              expandedRootCodes={expandedRootCodes}
              listRef={searchListRef}
              sortDirection={sortDirection}
              onOpenDetailTarget={openDetailTarget}
              onToggleSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
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
            activeChanges={[]}
            onOpenChange={() => undefined}
            impact={impact}
            busy={busy}
            open={isDetailOpen}
            width={drawerWidth}
            onAnalyzeImpact={analyzeImpact}
            onRelationChange={maintainRelation}
            onChanged={refreshCurrentRootDetail}
            onCanonicalOwnerProjection={syncCanonicalOwnerProjection}
            onStartResize={startDetailDrawerResize}
            onClose={() => setIsDetailOpen(false)}
            returnTo={returnTo}
          />
        </div>
      ) : null}
    </>
  );
}

function RelationResultsPanel({
  roots,
  query,
  viewMode,
  selectedRootCode,
  expandedRootCodes,
  listRef,
  sortDirection,
  onOpenDetailTarget,
  onToggleRoot,
  onToggleSort
}: {
  roots: DrawingPartRelationRoot[];
  query: string;
  viewMode: RelationViewMode;
  selectedRootCode: string | null;
  expandedRootCodes: Set<string>;
  listRef: RefObject<HTMLDivElement | null>;
  sortDirection: NumberSortDirection;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
  onToggleSort: () => void;
}) {
  if (roots.length === 0) {
    return (
      <section className="panel pdm-master-table-panel">
        <NextStepState
          eyebrow="查無結果"
          title="目前沒有符合條件的圖料關係"
          body="查不到符合條件的圖料關係，請清除篩選或改用圖料根號、圖號、料號搜尋。若這是新圖號或新料號，請改到編號申請建立來源資料。"
          actions={[
            { href: "/numbering/search", label: "重新查詢", variant: "primary" },
            { href: "/numbering/search?tab=reserved", label: "建立編號" }
          ]}
        />
      </section>
    );
  }

  return (
    <section className="panel pdm-master-table-panel">
      <div className="pdm-relation-list-header" role="row">
        <div role="columnheader"><NumberSortHeader label="編號" direction={sortDirection} onToggle={onToggleSort} /></div>
        <span>品名</span>
        <span>工作狀態</span>
      </div>
      <div
        ref={listRef}
        className="pdm-relation-scroll"
        role="region"
        aria-label="圖料工作台關係清單（可用上下鍵快速查閱）"
        aria-keyshortcuts="ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C"
        tabIndex={0}
      >
        {viewMode === "tree" ? (
          <div className="pdm-relation-list">
            {roots.map((root, index) => (
              <RelationRootGroup
                root={root}
                query={query}
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
            query={query}
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
  query,
  selected,
  expanded,
  rowIndex,
  onOpenDetailTarget,
  onToggleRoot
}: {
  root: DrawingPartRelationRoot;
  query: string;
  selected: boolean;
  expanded: boolean;
  rowIndex: number;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  return (
    <article className={`pdm-relation-root${selected ? " selected" : ""}`} data-search-row="true" data-row-index={rowIndex}>
      <RelationRootHeader root={root} query={query} expanded={expanded} onOpenDetailTarget={onOpenDetailTarget} onToggleRoot={onToggleRoot} />
      {expanded ? (
        <div className="pdm-relation-root-body">
          <div className="pdm-relation-drawing-list">
            {root.drawings.map((drawing) => (
              <RelationDrawingNode drawing={drawing} root={root} query={query} onOpenDetailTarget={onOpenDetailTarget} key={drawing.id} />
            ))}
          </div>
          <RelationOrphanParts root={root} query={query} onOpenDetailTarget={onOpenDetailTarget} />
          <RelationChangeReviewDetails root={root} query={query} onOpenDetailTarget={onOpenDetailTarget} />
        </div>
      ) : null}
    </article>
  );
}

function RelationRootHeader({
  root,
  query,
  expanded,
  onOpenDetailTarget,
  onToggleRoot
}: {
  root: DrawingPartRelationRoot;
  query: string;
  expanded: boolean;
  onOpenDetailTarget: (target: DetailTarget) => void;
  onToggleRoot: (rootCode: string) => void;
}) {
  return (
    <div className="pdm-relation-root-header" onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode: root.rootCode }))} role="button" tabIndex={-1}>
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
          aria-keyshortcuts="Enter Space"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode: root.rootCode }));
          }}
          onKeyDown={(event) => openDetailTargetFromKeyboard(
            event,
            resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode: root.rootCode }),
            onOpenDetailTarget
          )}
        >
          <SearchHighlight value={root.rootCode} query={query} />
        </button>
        <strong title={root.coreName || undefined}><SearchHighlight value={root.coreName || "-"} query={query} /></strong>
      </div>
      <div className="pdm-relation-root-meta">
        <span className="pdm-relation-root-summary">{root.drawings.length} 圖號・{root.parts.length} 料號</span>
        <span className="pdm-relation-status-context">
          <span className="pdm-relation-status-label">圖料根號工作</span>
          <HumanStatusBadge status={root.humanStatus} responsibilityStatus={root.responsibilityStatus} viewerActionability={root.viewerActionability} viewerStatus={root.viewerStatus} availabilityScope={root.availabilityScope} />
        </span>
        <span className="pdm-relation-status-context">
          <span className="pdm-relation-status-label">圖料關聯</span>
          <span className={`pdm-relation-health ${relationHealthTone(root.relationshipHealth)}`}>{root.relationshipHealth === "complete" ? "完整" : root.relationshipLabel}</span>
        </span>
      </div>
    </div>
  );
}

function RelationDrawingNode({
  drawing,
  root,
  query,
  onOpenDetailTarget
}: {
  drawing: DrawingPartRelationDrawing;
  root: DrawingPartRelationRoot;
  query: string;
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
          aria-keyshortcuts="Enter Space"
          onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }))}
          onKeyDown={(event) => openDetailTargetFromKeyboard(
            event,
            resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }),
            onOpenDetailTarget
          )}
        >
          <SearchHighlight value={drawing.drawingNumber} query={query} />
        </button>
        <span className={drawing.isReferenceOnly ? "pdm-relation-purpose reference" : "pdm-relation-purpose manufacturing"}><SearchHighlight value={drawing.purposeLabel} query={query} /></span>
        <span className="pdm-relation-node-step">{drawing.nextStep}</span>
      </div>
      {linkedParts.length > 0 ? (
        <div className="pdm-relation-part-group">
          <div className="pdm-relation-part-list">
            {linkedParts.map((part) => {
              const relationType = root.matrix.find((cell) => cell.drawingNumber === drawing.drawingNumber && cell.partNumber === part.partNumber)?.relationType ?? "pending";
              const role = relationCellLabel(relationType);
              return (
                <button
                  className={`pdm-relation-part-chip ${part.hasManufacturingDrawing ? "" : "missing"} has-role`}
                  title={`${part.partNumber} / ${part.partName} / ${role}`}
                  type="button"
                  aria-keyshortcuts="Enter Space"
                  onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }))}
                  onKeyDown={(event) => openDetailTargetFromKeyboard(
                    event,
                    resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }),
                    onOpenDetailTarget
                  )}
                  key={part.id}
                >
                  <span><SearchHighlight value={part.partNumber} query={query} /></span>
                  <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
                  <strong>{role}</strong>
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

function RelationOrphanParts({ root, query, onOpenDetailTarget }: { root: DrawingPartRelationRoot; query: string; onOpenDetailTarget: (target: DetailTarget) => void }) {
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
            aria-keyshortcuts="Enter Space"
            onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }))}
            onKeyDown={(event) => openDetailTargetFromKeyboard(
              event,
              resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }),
              onOpenDetailTarget
            )}
            key={part.id}
          >
            <span><SearchHighlight value={part.partNumber} query={query} /></span>
            <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
            <strong>待建立製造依據</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function RelationChangeReviewDetails({ root, query, onOpenDetailTarget }: { root: DrawingPartRelationRoot; query: string; onOpenDetailTarget: (target: DetailTarget) => void }) {
  if (root.changeReviews.length === 0) return null;
  return (
    <details className="pdm-relation-change-details">
      <summary>變更審查中（{root.changeReviews.length}）</summary>
      <div className="pdm-relation-review-list">
        {root.changeReviews.map((review) => (
          <RelationReviewRoot key={review.id} root={root} review={review} query={query} onOpenDetailTarget={onOpenDetailTarget} />
        ))}
      </div>
    </details>
  );
}

function RelationReviewRoot({ root, review, query, onOpenDetailTarget }: {
  root: DrawingPartRelationRoot;
  review: DrawingPartRelationChangeReview;
  query: string;
  onOpenDetailTarget: (target: DetailTarget) => void;
}) {
  return (
    <article className="pdm-relation-root pdm-relation-review-root" data-review-id={review.id} title={review.title}>
      <div className="pdm-relation-root-header pdm-relation-review-root-header">
        <span className="icon-button" aria-hidden="true"><ChevronDown size={16} /></span>
        <div className="pdm-relation-root-main">
          <span className="pdm-identity-code"><SearchHighlight value={root.rootCode} query={query} /></span>
          <strong title={root.coreName || undefined}><SearchHighlight value={root.coreName || "-"} query={query} /></strong>
        </div>
        <div className="pdm-relation-root-meta">
          <span className="pdm-relation-root-summary">{review.drawings.length} 圖號・{review.parts.length} 料號</span>
          <span className="pdm-relation-health info">{review.statusLabel}</span>
        </div>
      </div>
      <div className="pdm-relation-root-body">
        <div className="pdm-relation-drawing-list">
          {review.drawings.map((drawing) => (
            <RelationReviewDrawingNode key={drawing.id} drawing={drawing} parts={review.parts} root={root} query={query} interactive={review.id.startsWith("drawing-review:")} onOpenDetailTarget={onOpenDetailTarget} />
          ))}
        </div>
        <RelationReviewOrphanParts review={review} root={root} query={query} interactive={review.id.startsWith("drawing-review:")} onOpenDetailTarget={onOpenDetailTarget} />
      </div>
    </article>
  );
}

function RelationReviewDrawingNode({ drawing, parts, root, query, interactive, onOpenDetailTarget }: {
  drawing: DrawingPartRelationChangeReview["drawings"][number];
  parts: DrawingPartRelationChangeReview["parts"];
  root: DrawingPartRelationRoot;
  query: string;
  interactive: boolean;
  onOpenDetailTarget: (target: DetailTarget) => void;
}) {
  const linkedParts = parts.filter((part) => drawing.linkedPartNumbers.includes(part.partNumber));
  return (
    <section className={`pdm-relation-node ${drawing.isReferenceOnly ? "reference" : "manufacturing"}`}>
      <div className="pdm-relation-node-header">
        {interactive ? (
          <button
            className="pdm-identity-code"
            style={linkButtonStyle}
            type="button"
            aria-keyshortcuts="Enter Space"
            onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }))}
            onKeyDown={(event) => openDetailTargetFromKeyboard(
              event,
              resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }),
              onOpenDetailTarget
            )}
          >
            <SearchHighlight value={drawing.drawingNumber} query={query} />
          </button>
        ) : (
          <span className="pdm-identity-code"><SearchHighlight value={drawing.drawingNumber} query={query} /></span>
        )}
        <span className={drawing.isReferenceOnly ? "pdm-relation-purpose reference" : "pdm-relation-purpose manufacturing"}><SearchHighlight value={drawing.purposeLabel} query={query} /></span>
        <span className="pdm-relation-review-availability">{drawing.reviewAvailabilityLabel}</span>
        <span className="pdm-relation-node-step">{drawing.nextStep}</span>
      </div>
      {linkedParts.length > 0 ? (
        <div className="pdm-relation-part-group">
          <div className="pdm-relation-part-list">
            {linkedParts.map((part) => {
              const role = part.roleByDrawing[drawing.drawingNumber] ?? part.role;
              return interactive ? (
                <button
                  className={`pdm-relation-part-chip ${part.hasManufacturingDrawing ? "" : "missing"} has-role`}
                  title={`${part.partNumber} / ${part.partName} / ${role}`}
                  type="button"
                  aria-keyshortcuts="Enter Space"
                  onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }))}
                  onKeyDown={(event) => openDetailTargetFromKeyboard(
                    event,
                    resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }),
                    onOpenDetailTarget
                  )}
                  key={part.id}
                >
                  <span><SearchHighlight value={part.partNumber} query={query} /></span>
                  <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
                  <strong>{role}</strong>
                </button>
              ) : (
                <div className={`pdm-relation-part-chip ${part.hasManufacturingDrawing ? "" : "missing"} has-role`} title={`${part.partNumber} / ${part.partName} / ${role}`} key={part.id}>
                  <span><SearchHighlight value={part.partNumber} query={query} /></span>
                  <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
                  <strong>{role}</strong>
                </div>
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

function RelationReviewOrphanParts({ review, root, query, interactive, onOpenDetailTarget }: {
  review: DrawingPartRelationChangeReview;
  root: DrawingPartRelationRoot;
  query: string;
  interactive: boolean;
  onOpenDetailTarget: (target: DetailTarget) => void;
}) {
  const linkedPartNumbers = new Set(review.drawings.flatMap((drawing) => drawing.linkedPartNumbers));
  const orphanParts = review.parts.filter((part) => !linkedPartNumbers.has(part.partNumber) || !part.hasManufacturingDrawing);
  if (orphanParts.length === 0) return null;
  return (
    <section className="pdm-relation-orphan">
      <strong>未連製造圖料號</strong>
      <div className="pdm-relation-part-list">
        {orphanParts.map((part) => {
          const content = (
            <>
              <span><SearchHighlight value={part.partNumber} query={query} /></span>
              <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
              <strong>{part.role}</strong>
            </>
          );
          return interactive ? (
            <button
              className="pdm-relation-part-chip missing"
              type="button"
              aria-keyshortcuts="Enter Space"
              onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }))}
              onKeyDown={(event) => openDetailTargetFromKeyboard(
                event,
                resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }),
                onOpenDetailTarget
              )}
              key={part.id}
            >
              {content}
            </button>
          ) : (
            <div className="pdm-relation-part-chip missing" key={part.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}

function relationHealthTone(health: DrawingPartRelationRoot["relationshipHealth"]) {
  if (health === "complete") return "ok";
  if (health === "draft") return "info";
  if (health === "missing_part" || health === "missing_manufacturing_drawing") return "warning";
  return "blocked";
}

function RelationMatrixView({
  roots,
  query,
  selectedRootCode,
  expandedRootCodes,
  onOpenDetailTarget,
  onToggleRoot
}: {
  roots: DrawingPartRelationRoot[];
  query: string;
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
            <RelationRootHeader root={root} query={query} expanded={expanded} onOpenDetailTarget={onOpenDetailTarget} onToggleRoot={onToggleRoot} />
            {expanded ? (
              <div className="pdm-relation-root-body pdm-relation-matrix-body">
                {root.drawings.length === 0 || root.parts.length === 0 ? (
                  <div className="pdm-relation-empty-line">{root.drawings.length === 0 ? "尚無圖號" : "尚無料號"}</div>
                ) : (
                  <RelationRootMatrix root={root} query={query} onOpenDetailTarget={onOpenDetailTarget} />
                )}
                <RelationChangeReviewDetails root={root} query={query} onOpenDetailTarget={onOpenDetailTarget} />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function RelationRootMatrix({ root, query, onOpenDetailTarget }: { root: DrawingPartRelationRoot; query: string; onOpenDetailTarget: (target: DetailTarget) => void }) {
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
                  aria-keyshortcuts="Enter Space"
                  onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }))}
                  onKeyDown={(event) => openDetailTargetFromKeyboard(
                    event,
                    resolveNumberingSearchDetailTarget({ entityType: "drawing_number", rootCode: root.rootCode, drawingNumber: drawing.drawingNumber }),
                    onOpenDetailTarget
                  )}
                >
                  <span><SearchHighlight value={drawing.drawingNumber} query={query} /></span>
                  <small><SearchHighlight value={drawing.purposeLabel} query={query} /></small>
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
                  aria-keyshortcuts="Enter Space"
                  onClick={() => onOpenDetailTarget(resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }))}
                  onKeyDown={(event) => openDetailTargetFromKeyboard(
                    event,
                    resolveNumberingSearchDetailTarget({ entityType: "part_number", rootCode: root.rootCode, partNumber: part.partNumber }),
                    onOpenDetailTarget
                  )}
                >
                  <span><SearchHighlight value={part.partNumber} query={query} /></span>
                  <small title={part.partName}><SearchHighlight value={part.partName} query={query} /></small>
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

function RootDetailDrawer({
  detail,
  detailTarget,
  activeChanges,
  onOpenChange,
  impact,
  busy,
  open,
  width,
  onAnalyzeImpact,
  onRelationChange,
  onChanged,
  onCanonicalOwnerProjection,
  onStartResize,
  onClose,
  returnTo
}: {
  detail: RootDetail | null;
  detailTarget: DetailTarget | null;
  activeChanges: RelationActiveChange[];
  onOpenChange: (change: RelationActiveChange) => void;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  open: boolean;
  width: number;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onRelationChange: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void>;
  onChanged: () => Promise<void>;
  onCanonicalOwnerProjection: (projection: OwnerHeaderProjection) => void;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
  returnTo: string;
}) {
  const target = detail ? resolveDetailTarget(detail, detailTarget) : detailTarget;
  const targetKey = target ? detailTargetKey(target) : "";
  const [ownerHeaderProjection, setOwnerHeaderProjection] = useState<OwnerHeaderProjection | null>(null);

  useEffect(() => {
    setOwnerHeaderProjection(null);
  }, [targetKey]);

  const handleOwnerHeaderProjection = useCallback((projection: OwnerHeaderProjection) => {
    setOwnerHeaderProjection(projection);
    onCanonicalOwnerProjection(projection);
  }, [onCanonicalOwnerProjection]);

  if (!open) return null;
  const header = detail && target ? detailTargetHeader(detail, target) : { code: "圖料明細", subtitle: "" };
  const headerStatus = detail && target ? detailTargetHumanStatus(detail, target) : null;
  const headerResponsibilityStatus = detail && target ? detailTargetResponsibilityStatus(detail, target) : null;
  const headerActionability = detail && target ? detailTargetActionability(detail, target) : null;
  const headerViewerStatus = detail && target ? detailTargetViewerStatus(detail, target) : null;
  const headerAvailabilityScope = detail && target ? detailTargetAvailabilityScope(detail, target) : null;
  const isRootTarget = target?.entityType === "part_root";
  const canonicalHeader = ownerHeaderProjection?.targetKey === targetKey ? ownerHeaderProjection : null;
  const visibleHeaderStatus = isRootTarget ? headerStatus : canonicalHeader?.humanStatus;
  const visibleHeaderResponsibilityStatus = isRootTarget ? headerResponsibilityStatus : canonicalHeader?.responsibilityStatus;
  const visibleHeaderActionability = isRootTarget ? headerActionability : canonicalHeader?.viewerActionability;
  const visibleHeaderViewerStatus = isRootTarget ? headerViewerStatus : canonicalHeader?.viewerStatus;
  const visibleHeaderAvailabilityScope = isRootTarget ? headerAvailabilityScope : canonicalHeader?.availabilityScope;
  return (
    <PdmEntityDetailDrawer
      open
      width={width}
      ariaLabel="圖料明細"
      title={header.code}
      subtitle={isRootTarget ? header.subtitle : canonicalHeader?.name}
      status={detail && visibleHeaderStatus ? <HumanStatusBadge status={visibleHeaderStatus} responsibilityStatus={visibleHeaderResponsibilityStatus} viewerActionability={visibleHeaderActionability} viewerStatus={visibleHeaderViewerStatus} availabilityScope={visibleHeaderAvailabilityScope} /> : undefined}
      entityType={target?.entityType}
      entityCode={header.code}
      sourceContext="numbering_search"
      resizeLabel="調整圖料明細寬度"
      resizeTitle="拖拉調整寬度"
      closeLabel="關閉圖料明細"
      onClose={onClose}
      onStartResize={onStartResize}
      keepOpenSelector="[data-search-row='true']"
    >
      <div className="pdm-entity-drawer-body">
        <RelationReadonlySummary detail={detail} detailTarget={detailTarget} />
      </div>
    </PdmEntityDetailDrawer>
  );
}

function RelationReadonlySummary({ detail, detailTarget }: { detail: RootDetail | null; detailTarget: DetailTarget | null }) {
  if (!detail) return <section className="panel pdm-master-detail-panel"><div className="empty">正在載入圖料明細...</div></section>;
  const target = resolveDetailTarget(detail, detailTarget);
  const header = detailTargetHeader(detail, target);
  return <div className="pdm-master-detail-panel pdm-master-detail-stack" data-detail-target={target.entityType} data-detail-code={header.code} data-source-context="numbering_search">
    <section className="panel"><div className="panel-header"><span className="pdm-meta-chip">唯讀摘要</span></div><p>{header.subtitle}</p></section>
    <section className="panel"><div className="panel-header"><h2>關聯摘要</h2></div><div className="pdm-fact-grid"><div><span>圖料根號</span><strong>{detail.root.rootCode}</strong></div><div><span>圖號</span><strong>{detail.drawingNumbers.length}</strong></div><div><span>料號</span><strong>{detail.partNumbers.length}</strong></div><div><span>關聯</span><strong>{detail.links.length}</strong></div></div></section>
    <section className="panel"><div className="panel-header"><h2>圖號與料號</h2></div><ul>{detail.drawingNumbers.map((drawing) => <li key={drawing.id}>{drawing.drawingNumber} · {purposeLabel(drawing.purposeCode)} · {drawing.recordStatus}</li>)}{detail.partNumbers.map((part) => <li key={part.id}>{part.partNumber} · {part.partName} · {part.recordStatus}</li>)}</ul></section>
    <WarningsPanel warnings={detail.warnings} />
  </div>;
}

function RootDetailPanel({
  detail,
  detailTarget,
  activeChanges,
  onOpenChange,
  impact,
  busy,
  onAnalyzeImpact,
  onRelationChange,
  onChanged,
  onOwnerHeaderProjection,
  returnTo
}: {
  detail: RootDetail | null;
  detailTarget: DetailTarget | null;
  activeChanges: RelationActiveChange[];
  onOpenChange: (change: RelationActiveChange) => void;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
  onRelationChange: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void>;
  onChanged: () => Promise<void>;
  onOwnerHeaderProjection: (projection: OwnerHeaderProjection) => void;
  returnTo: string;
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
  const selectedPartNumber = target.entityType === "part_number" ? target.partNumber : "";
  const selectedDrawingNumber = target.entityType === "drawing_number" ? target.drawingNumber : "";

  return (
    <div
      className="pdm-master-detail-panel pdm-master-detail-stack"
      data-detail-target={target.entityType}
      data-detail-code={header.code}
      data-entity-type={target.entityType}
      data-entity-code={header.code}
      data-source-context="numbering_search"
    >
      {isRootTarget ? (
        <>
          {activeChanges.length > 0 ? <section className="panel pdm-relation-change-review-list" aria-label="進行中的變更"><div className="panel-header"><h2>進行中的變更</h2></div><div className="drawing-detail-action-row">{activeChanges.map((change) => <button className="secondary-button" type="button" onClick={() => onOpenChange(change)} key={change.workspaceId}>{change.displayCode} · {change.stageLabel}</button>)}</div></section> : null}
          <RootDetailHero detail={detail} formalChildCount={formalChildCount} onChanged={onChanged} />

          <section style={sectionStyle} data-root-aggregate-section="part-list">
            <h3 style={sectionHeadingStyle}>料號</h3>
            <div style={cardListStyle}>
              {detail.partNumbers.map((partNumber) => (
                <PartNumberCard
                  partNumber={partNumber}
                  detail={detail}
                  selected={partNumber.partNumber === selectedPartNumber}
                  showEntrypoints={false}
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
                  showEntrypoints={false}
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
          <DetailTargetCoreSections detail={detail} target={target} onChanged={onChanged} onOwnerHeaderProjection={onOwnerHeaderProjection} returnTo={returnTo} />
        </>
      )}
    </div>
  );
}

function resolveDetailTarget(detail: RootDetail, target: DetailTarget | null): DetailTarget {
  if (!target || target.rootCode !== detail.root.rootCode) return { entityType: "part_root", rootCode: detail.root.rootCode };
  if (target.entityType === "drawing_number" && detail.drawingNumbers.some((drawing) => drawing.drawingNumber === target.drawingNumber)) return target;
  if (target.entityType === "part_number" && detail.partNumbers.some((part) => part.partNumber === target.partNumber)) return target;
  return { entityType: "part_root", rootCode: detail.root.rootCode };
}

function detailTargetKey(target: DetailTarget) {
  if (target.entityType === "drawing_number") return `drawing_number:${target.drawingNumber}`;
  if (target.entityType === "part_number") return `part_number:${target.partNumber}`;
  return `part_root:${target.rootCode}`;
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
    title: `圖料根號明細 ${detail.root.rootCode}`,
    subtitle: detail.root.coreName,
    code: detail.root.rootCode
  };
}

function detailTargetHumanStatus(detail: RootDetail, target: DetailTarget): HumanStatusProjection | null {
  if (target.entityType === "drawing_number") {
    return detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber)?.humanStatus ?? null;
  }
  if (target.entityType === "part_number") {
    return detail.partNumbers.find((part) => part.partNumber === target.partNumber)?.humanStatus ?? null;
  }
  return detail.humanStatus;
}

function detailTargetResponsibilityStatus(detail: RootDetail, target: DetailTarget): ResponsibilityStatusProjection | null {
  if (target.entityType === "drawing_number") return detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber)?.responsibilityStatus ?? null;
  if (target.entityType === "part_number") return detail.partNumbers.find((part) => part.partNumber === target.partNumber)?.responsibilityStatus ?? null;
  return detail.responsibilityStatus;
}

function detailTargetActionability(detail: RootDetail, target: DetailTarget): ViewerActionabilityProjection | null {
  if (target.entityType === "drawing_number") return detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber)?.viewerActionability ?? null;
  if (target.entityType === "part_number") return detail.partNumbers.find((part) => part.partNumber === target.partNumber)?.viewerActionability ?? null;
  return detail.viewerActionability;
}

function detailTargetViewerStatus(detail: RootDetail, target: DetailTarget): ViewerHumanStatusProjection | null {
  if (target.entityType === "drawing_number") {
    return detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber)?.viewerStatus ?? null;
  }
  if (target.entityType === "part_number") {
    return detail.partNumbers.find((part) => part.partNumber === target.partNumber)?.viewerStatus ?? null;
  }
  return detail.viewerStatus;
}

function detailTargetAvailabilityScope(detail: RootDetail, target: DetailTarget): AvailabilityScopeProjection | null {
  if (target.entityType === "drawing_number") {
    return detail.drawingNumbers.find((drawing) => drawing.drawingNumber === target.drawingNumber)?.availabilityScope ?? null;
  }
  if (target.entityType === "part_number") {
    return detail.partNumbers.find((part) => part.partNumber === target.partNumber)?.availabilityScope ?? null;
  }
  return detail.availabilityScope;
}

function RootDetailHero({ detail, formalChildCount, onChanged }: { detail: RootDetail; formalChildCount: number; onChanged: () => Promise<void> }) {
  const primaryDrawing = detail.drawingNumbers.find((drawing) => drawing.isPrimaryManufacturing) ?? detail.drawingNumbers[0] ?? null;
  const primaryActionLabel = detail.root.recordStatus === "Released" ? "檢查新版送審" : "檢查送審";
  const visibleWarningCount = displayNumberingWarnings(detail.warnings).length;
  return (
    <section className="panel drawing-detail-hero" data-entity-core-section="object-owner-hero">
      <div className="drawing-detail-hero-meta">
        <StatusBadge status={detail.root.recordStatus} context="masterRecord" />
        <span className="pdm-meta-chip">料號 {detail.summary.partCount}</span>
        <span className="pdm-meta-chip">圖號 {detail.summary.drawingCount}</span>
        {detail.summary.primaryManufacturingCount > 0 ? <span className="pdm-meta-chip">製造圖 {detail.summary.primaryManufacturingCount}</span> : null}
        {visibleWarningCount > 0 ? <span className="pdm-meta-chip drawing-workbench-alert-chip">提醒 {visibleWarningCount}</span> : null}
      </div>
      <div className="drawing-detail-action-row">
        {primaryDrawing ? (
          <a className="primary-button" href={`/drawings/${encodeURIComponent(primaryDrawing.drawingNumber)}/submission-workbench`} onKeyDown={activateSearchLinkFromKeyboard}>
            <FileText size={16} />
            {primaryActionLabel}
          </a>
        ) : null}
        <a className="secondary-button" href="/numbering/tasks" onKeyDown={activateSearchLinkFromKeyboard}>
          <ClipboardCheck size={16} />
          待辦
        </a>
      </div>
      <NumberingContextualEntrypoints
        mode="root"
        rootId={detail.root.id}
        rootCode={detail.root.rootCode}
        coreName={detail.root.coreName}
        rootRecordStatus={detail.root.recordStatus}
        rootFormalChildCount={formalChildCount}
        rootPartCount={detail.summary.partCount}
        rootDrawingCount={detail.summary.drawingCount}
        actionEmphasis="secondary"
        onChanged={onChanged}
      />
    </section>
  );
}

function DetailTargetLifecyclePanel({ detail, target }: { detail: RootDetail; target: DetailTarget }) {
  if (target.entityType === "part_number") {
    const partNumber = detail.partNumbers.find((part) => part.partNumber === target.partNumber);
    if (!partNumber) return <DetailTargetLifecyclePanel detail={detail} target={{ entityType: "part_root", rootCode: detail.root.rootCode }} />;
    const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
    const manufacturingLinks = links.filter((link) => link.linkType === "primary_manufacturing");
    const warnings = displayNumberingWarnings(detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id));
    const needsManufacturingDrawing = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && manufacturingLinks.length === 0;
    const primaryDrawingNumber = manufacturingLinks[0]?.drawingNumber ?? links[0]?.drawingNumber ?? "";
    return (
      <ObjectLifecycleStatusPanel
        title="這個料號目前狀態"
        objectName={`${partNumber.partNumber} / ${partNumber.partName}`}
        status={partNumber.recordStatus}
        owner="RD / Manager"
        identities={[
          { label: "料號", value: partNumber.partNumber },
          { label: "圖料根號", value: detail.root.rootCode },
          { label: "關聯圖號", value: links.length },
          { label: "製造圖", value: manufacturingLinks.map((link) => link.drawingNumber).join("、") || "-" }
        ]}
        blockers={[
          needsManufacturingDrawing ? "此料號尚未指定製造圖，技術移轉與發布會阻擋。" : "製造圖關聯可在下方關係維護區確認。",
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
    const warnings = displayNumberingWarnings(detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id));
    return (
      <ObjectLifecycleStatusPanel
        title="這個圖號目前狀態"
        objectName={`${drawingNumber.drawingNumber} / ${drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}`}
        status={drawingNumber.recordStatus}
        owner="RD / Manager"
        identities={[
          { label: "圖號", value: drawingNumber.drawingNumber },
          { label: "圖料根號", value: detail.root.rootCode },
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
      title="這個圖料根號目前狀態"
      objectName={`${detail.root.rootCode} / ${detail.root.coreName}`}
      status={detail.root.recordStatus}
      owner="RD / Manager"
      identities={[
        { label: "圖料根號", value: detail.root.rootCode },
        { label: "主要料號", value: primaryPart?.partNumber ?? "-" },
        { label: "主要圖號", value: primaryDrawing?.drawingNumber ?? "-" },
        { label: "提醒", value: displayNumberingWarnings(detail.warnings).length }
      ]}
      blockers={[
        detail.root.recordStatus === "Draft" ? "已領號但尚未建立送審單" : "需確認送審、BOM 與審核關卡狀態",
        detail.summary.primaryManufacturingCount === 0 ? "尚未找到製造基準關聯" : "製造基準關聯可在下方圖號區檢查",
        displayNumberingWarnings(detail.warnings).length > 0 ? `仍有 ${displayNumberingWarnings(detail.warnings).length} 則提醒未收斂` : "目前沒有未確認提醒"
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
          rootId={detail.root.id}
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          part={{
            id: partNumber.id,
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
          rootId={detail.root.id}
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          drawing={{
            id: drawingNumber.id,
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
        rootId={detail.root.id}
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

function DetailTargetCoreSections({ detail, target, onChanged, onOwnerHeaderProjection, returnTo }: { detail: RootDetail; target: DetailTarget; onChanged: () => Promise<void>; onOwnerHeaderProjection: (projection: OwnerHeaderProjection) => void; returnTo: string }) {
  const targetDrawingNumber = target.entityType === "drawing_number" ? target.drawingNumber : "";
  const targetPartNumber = target.entityType === "part_number" ? target.partNumber : "";
  const [partDetail, setPartDetail] = useState<PartDetail | null>(null);
  const [drawingWorkbench, setDrawingWorkbench] = useState<{
    drawing: DrawingDetail;
    row: DrawingWorkbenchRow;
    capabilities: DrawingWorkbenchCapabilities;
  } | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPartDetail(null);
    setDrawingWorkbench(null);
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
          if (!response.ok) throw new Error(`料號明細載入失敗 (${response.status})`);
          const body = (await response.json()) as { part?: PartDetail };
          if (!cancelled) {
            const ownerPart = body.part ?? null;
            setPartDetail(ownerPart);
            if (ownerPart) {
              onOwnerHeaderProjection({
                targetKey: `part_number:${targetPartNumber}`,
                entityType: "part_number",
                entityCode: targetPartNumber,
                name: ownerPart.partName,
                humanStatus: ownerPart.humanStatus,
                responsibilityStatus: ownerPart.responsibilityStatus,
                viewerActionability: ownerPart.viewerActionability,
                viewerStatus: ownerPart.viewerStatus,
                availabilityScope: ownerPart.availabilityScope
              });
            }
          }
        } else if (target.entityType === "drawing_number" && targetDrawingNumber) {
          const drawing = detail.drawingNumbers.find((item) => item.drawingNumber === targetDrawingNumber);
          if (!drawing) throw new Error("找不到圖號明細");
          const rowKey = `drawing:${drawing.id}`;
          const response = await fetch(`/api/numbering/drawings/workbench/${encodeURIComponent(rowKey)}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`圖號明細載入失敗 (${response.status})`);
          const body = (await response.json()) as { drawing?: DrawingDetail; row?: DrawingWorkbenchRow; capabilities?: DrawingWorkbenchCapabilities };
          if (!cancelled) {
            if (body.drawing && body.row && body.capabilities) {
              setDrawingWorkbench({ drawing: body.drawing, row: body.row, capabilities: body.capabilities });
              onOwnerHeaderProjection({
                targetKey: `drawing_number:${targetDrawingNumber}`,
                entityType: "drawing_number",
                entityCode: targetDrawingNumber,
                name: body.drawing.coreName,
                humanStatus: body.row.humanStatus,
                responsibilityStatus: body.row.responsibilityStatus,
                viewerActionability: body.row.viewerActionability,
                viewerStatus: body.row.viewerStatus,
                availabilityScope: body.row.availabilityScope
              });
            }
          }
        }
        if (!cancelled) setLoadState("ready");
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (!cancelled) {
          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "明細載入失敗");
        }
      }
    }

    void loadOwnerDetail();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [detail.drawingNumbers, onOwnerHeaderProjection, target.entityType, targetDrawingNumber, targetPartNumber]);

  if (target.entityType === "drawing_number") {
    const drawing = detail.drawingNumbers.find((item) => item.drawingNumber === target.drawingNumber);
    if (!drawing) return null;
    return (
      <TargetDrawingCoreSections
        detail={detail}
        drawing={drawing}
        drawingWorkbench={drawingWorkbench}
        loadState={loadState}
        loadError={loadError}
        onChanged={onChanged}
        returnTo={returnTo}
      />
    );
  }

  if (target.entityType === "part_number") {
    const part = detail.partNumbers.find((item) => item.partNumber === target.partNumber);
    if (!part) return null;
    return <TargetPartCoreSections detail={detail} part={part} ownerPart={partDetail} loadState={loadState} loadError={loadError} onChanged={onChanged} />;
  }

  return <TargetRootCoreSection detail={detail} />;
}

function TargetRootCoreSection({ detail }: { detail: RootDetail }) {
  const primaryDrawing = detail.drawingNumbers.find((drawing) => drawing.isPrimaryManufacturing) ?? detail.drawingNumbers[0] ?? null;
  const primaryPart = detail.partNumbers[0] ?? null;
  return (
    <section style={sectionStyle} data-entity-core-section="root-identity">
      <h3 style={sectionHeadingStyle}>圖料根號資訊</h3>
      <div style={targetInfoGridStyle}>
        <TargetInfoBlock icon={<FileText size={16} />} title="圖料根號" value={detail.root.rootCode} />
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
  drawingWorkbench,
  loadState,
  loadError,
  onChanged,
  returnTo
}: {
  detail: RootDetail;
  drawing: DrawingNumber;
  drawingWorkbench: {
    drawing: DrawingDetail;
    row: DrawingWorkbenchRow;
    capabilities: DrawingWorkbenchCapabilities;
  } | null;
  loadState: "idle" | "loading" | "ready" | "error";
  loadError: string;
  onChanged: () => Promise<void>;
  returnTo: string;
}) {
  if (drawingWorkbench && loadState === "ready") {
    return (
      <DrawingDetailContent
        drawing={drawingWorkbench.drawing}
        row={drawingWorkbench.row}
        capabilities={drawingWorkbench.capabilities}
        productionSlice={null}
        onDataChanged={onChanged}
        embedded
        returnTo={returnTo || `/numbering/search?query=${encodeURIComponent(drawing.drawingNumber)}&entityType=drawing_number`}
      />
    );
  }

  const ownerDrawing = null as unknown as DrawingEntityDetail | null;
  const canReviewApprovals = false;
  const links = detail.links.filter((link) => link.drawingNumberId === drawing.id);
  const linkedParts = detail.partNumbers.filter((part) => links.some((link) => link.partNumberId === part.id));
  const ownerParts = ownerDrawing?.sameRootParts ?? [];
  const incompleteParts = ownerParts.filter((part) => !(part.materialLabel || part.materialCode) || !part.surfaceTreatment);
  const readinessMasterData = ownerDrawing
    ? incompleteParts.length > 0
      ? `${incompleteParts.length} 筆待補`
      : "完成"
    : links.length > 0
      ? `已關聯 ${links.length} 筆料號`
      : "尚未關聯料號";
  return (
    <>
      <MasterAttachmentPanel
        entityType="drawing_number"
        entityCode={drawing.drawingNumber}
        processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}
        pendingRevisionReviews={ownerDrawing?.pendingApproval ? { ...ownerDrawing.pendingApproval, canReview: canReviewApprovals } : null}
      />

      <section style={sectionStyle} data-entity-core-section="drawing-readiness">
        <h3 style={sectionHeadingStyle}>送審檢查</h3>
        <EntityDetailLoadNotice loadState={loadState} loadError={loadError} entityLabel="圖號" />
        <div style={targetInfoGridStyle}>
          <TargetInfoBlock icon={<FileText size={16} />} title="圖面附件" value="下方圖號附件庫使用圖號主檔 API" />
          <TargetInfoBlock icon={<Link2 size={16} />} title="主資料" value={readinessMasterData} tone={incompleteParts.length > 0 || links.length === 0 ? "danger" : "success"} />
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
      <h3 style={sectionHeadingStyle}>同根料號</h3>
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
  loadError,
  onChanged
}: {
  detail: RootDetail;
  part: PartNumber;
  ownerPart: PartDetail | null;
  loadState: "idle" | "loading" | "ready" | "error";
  loadError: string;
  onChanged: () => Promise<void>;
}) {
  const [panelBusy, setPanelBusy] = useState(false);
  if (ownerPart && loadState === "ready") {
    return (
      <PartDetailPanel
        detail={ownerPart}
        busy={panelBusy}
        productionSliceEnforced={false}
        productionSliceUnopenedMessage=""
        showIdentityHeader={false}
        setBusy={setPanelBusy}
        onUpdated={onChanged}
      />
    );
  }

  const links = detail.links.filter((link) => link.partNumberId === part.id);
  const linkedDrawings = ownerPart?.linkedDrawings ?? links.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, linkType: link.linkType }));
  const variants = ownerPart?.sameDrawingVariants ?? detail.variants.filter((variant) => variant.partNumberId === part.id);
  const variant = ownerPart?.variant ?? null;
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

    </>
  );
}

function EntityDetailLoadNotice({ loadState, loadError, entityLabel }: { loadState: "idle" | "loading" | "ready" | "error"; loadError: string; entityLabel: string }) {
  if (loadState === "loading") return <p style={mutedTextStyle}>正在載入{entityLabel}明細...</p>;
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
        <span>{relation ? relationLinkTypeLabel(relation.linkType) : "尚未關聯"}</span>
      </div>
    </article>
  );
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
    ["PendingReview", "Released", "Obsolete", "Merged"].includes(status ?? "")
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
          <strong>圖號 × 料號</strong>
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
  const warnings = displayNumberingWarnings(detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id));
  const missingPrimaryMa = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && !links.some((link) => link.linkType === "primary_manufacturing");
  return (
    <article style={selected ? selectedRecordCardStyle : recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{partNumber.partNumber}</strong>
        <StatusBadge status={partNumber.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{partNumber.partName}</div>
      <div style={metaRowStyle}>
        <span>{kindLabel(partNumber.itemKind)}</span>
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
        {missingPrimaryMa ? <WarningDot title="自製、發包、客製件缺製造基準關聯時會被技術移轉與發行關卡阻擋，需補圖或走例外審核。" /> : null}
        {partNumber.recordStatus === "MainDrawingInvalid" ? <WarningDot title="製造基準關聯已失效，料號需重新送審並指定有效製造圖後才能恢復使用。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此料號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
      </div>
      {showEntrypoints ? (
        <NumberingContextualEntrypoints
          mode="part"
          rootId={detail.root.id}
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          part={{
            id: partNumber.id,
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
  const warnings = displayNumberingWarnings(detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id));
  return (
    <article style={selected ? selectedRecordCardStyle : recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{drawingNumber.drawingNumber}</strong>
        <StatusBadge status={drawingNumber.recordStatus} context="masterRecord" />
      </div>
      <div style={mutedTextStyle}>{drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}</div>
      <div style={metaRowStyle}>
        <span>{drawingNumber.isPrimaryManufacturing ? "製造基準" : "參考"}</span>
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
          rootId={detail.root.id}
          rootCode={detail.root.rootCode}
          coreName={detail.root.coreName}
          rootRecordStatus={detail.root.recordStatus}
          drawing={{
            id: drawingNumber.id,
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
  const displayWarnings = displayNumberingWarnings(warnings);
  if (displayWarnings.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>提醒</h3>
      <div style={cardListStyle}>
        {displayWarnings.map((warning) => (
          <div style={recordCardStyle} key={warning.key}>
            <div style={recordTitleStyle}>
              <strong>{warning.title}</strong>
              <span className="badge">{warningSeverityLabel(warning.severity)}</span>
            </div>
            <div style={mutedTextStyle}>{warning.message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

type DisplayNumberingWarning = {
  key: string;
  severity: NumberingWarning["severity"];
  title: string;
  message: string;
  count: number;
};

function displayNumberingWarnings(warnings: NumberingWarning[]): DisplayNumberingWarning[] {
  const grouped = new Map<string, DisplayNumberingWarning>();
  for (const warning of warnings) {
    if (warning.acknowledgedAt) continue;
    const presentation = warningPresentation(warning);
    const current = grouped.get(presentation.key);
    if (current) {
      current.count += 1;
      if (presentation.key === "similar-numbering") {
        current.message = `系統找到 ${current.count} 筆可能相似的圖料號，建立前請確認是否為同一項目。`;
      }
      continue;
    }
    grouped.set(presentation.key, { ...presentation, count: 1 });
  }
  return [...grouped.values()];
}

function warningPresentation(warning: NumberingWarning): Omit<DisplayNumberingWarning, "count"> {
  if (warning.warningCode === "HIGH_SIMILARITY_NUMBERING") {
    return {
      key: "similar-numbering",
      severity: warning.severity,
      title: "找到相似編號",
      message: "系統找到可能相似的圖料號，建立前請確認是否為同一項目。"
    };
  }
  if (warning.warningCode === "DUPLICATE_NUMBERING_BLOCKER") {
    return {
      key: "duplicate-numbering",
      severity: "blocker",
      title: "編號已存在",
      message: "此編號與既有資料重複，請改用既有資料或調整編號。"
    };
  }

  const hasHumanTitle = /[\u3400-\u9fff]/u.test(warning.title);
  const hasHumanMessage = /[\u3400-\u9fff]/u.test(warning.message);
  return {
    key: warning.warningCode || warning.id,
    severity: warning.severity,
    title: hasHumanTitle ? warning.title : warning.severity === "blocker" ? "需先處理" : "請留意",
    message: hasHumanMessage ? warning.message : "此筆資料有待確認事項，請確認關聯資料後再繼續。"
  };
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
  const auditByLabel = new Map<string, NumberingAudit>();
  for (const audit of auditTrail) {
    const label = humanizeAuditAction(audit.action);
    if (!auditByLabel.has(label)) auditByLabel.set(label, audit);
  }
  const visibleAudits = [...auditByLabel.values()].slice(0, 6);
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>近期異動</h3>
      <div style={cardListStyle}>
        {visibleAudits.map((audit) => (
          <div style={auditRowStyle} key={audit.id}>
            <span>{humanizeAuditAction(audit.action)}</span>
            <small style={mutedTextStyle}>{new Date(audit.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function humanizeAuditAction(action: string) {
  const labels: Record<string, string> = {
    "numbering.v3.cutover": "資料結構更新",
    "numbering.v2.cutover": "資料結構更新",
    "part_root.created": "建立圖料根號",
    "part_number.created": "建立料號",
    "drawing_number.created": "建立圖號",
    "numbering.relation.created": "建立圖料關聯",
    "numbering.relation.updated": "更新圖料關聯",
    "numbering.relation.removed": "移除圖料關聯"
  };
  if (labels[action]) return labels[action];
  return /[\u3400-\u9fff]/u.test(action) ? action : "系統更新";
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
        <p>請先登入後再使用圖料工作台。</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
        <h2>圖料工作台暫時無法完成</h2>
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
