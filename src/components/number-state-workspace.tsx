"use client";

import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FilePlus2,
  FileText,
  LockKeyhole,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  X
} from "lucide-react";
import {
  DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
  DRAWING_DETAIL_DRAWER_MIN_WIDTH,
  DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
  DrawingWorkspaceDrawer
} from "@/components/drawing-workspace-drawer";
import { DrawingDetailPreview } from "@/components/drawing-detail-preview";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import {
  NumberingCandidateRevisionEditor,
  type CandidateRevisionWorkspace
} from "@/components/numbering-candidate-revision-editor";
import { NumberingSubmissionResult } from "@/components/numbering-submission-result";
import { SearchHighlight } from "@/components/search-highlight";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { shouldActivateLinkFromKeyboard } from "@/lib/keyboard-link-activation";
import {
  isNumberLifecycleAdoptionHiddenFromUser,
  projectNumberLifecycleUserView,
  type NumberLifecycleProjectionV2
} from "@/lib/number-lifecycle-user-view";
import type { StatusScopeId } from "@/lib/status-scope-display";

type DraftMode = "new_bundle" | "append_drawing" | "append_part" | "append_drawing_part";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type PurposeCode = "MA" | "OT" | "M" | "R";
type LifecycleStatus = "active" | "cancelled" | "published";
type NumberQualification = "unnumbered" | "candidate" | "official" | "legacy_official_reservation";
type FeatureStatus = {
  enabled: boolean;
  flag: string;
  phase: string;
  lifecycleV2?: { enabled: boolean; flag: string; phase: string };
  drawingWorkbench?: { enabled: boolean; requested: boolean; flag: string; dependency: string; phase: string };
  partRelationWorkbench?: { enabled: boolean; requested: boolean; flag: string; dependency: string; phase: string };
};
type ProductionSliceStatus = { configured: boolean; unopenedMessage?: string };
export type WorkspaceAction = "cancel" | "submit" | "withdraw" | "publish";

const DEFAULT_PRODUCTION_SLICE_UNOPENED_MESSAGE = "此功能未納入本次編號建立 production slice。";
type NumberStateProjection = {
  numberQualification: NumberQualification;
  lifecycle: "draft" | "cancelled" | "published" | "obsolete";
  review: "not_submitted" | "in_review" | "needs_info" | "rejected" | "approved";
  publication: "not_ready" | "ready" | "publishing" | "failed" | "published";
  readiness: "incomplete" | "ready" | "stale" | "not_applicable";
  usage: "not_for_formal_use" | "formal_use_allowed" | "historical_only";
  nowWhat: {
    label: string;
    href: string | null;
    ownerRole: string;
    blockedReason: string | null;
  };
};

type DraftRoot = {
  id: string;
  coreName: string;
  itemKind: ItemKind;
  ruleVersionId: string;
  candidateReservationId: string | null;
  candidateCode: string | null;
};

type DraftPart = {
  id: string;
  rootDraftId: string | null;
  sourceRootId: string | null;
  partName: string;
  itemKind: ItemKind;
  isUniversal: boolean;
  universalReason: string | null;
  customSpecification: string | null;
  seriesCode: string | null;
  candidateReservationId: string | null;
  candidateCode: string | null;
};

type DraftDrawing = {
  id: string;
  rootDraftId: string | null;
  sourceRootId: string | null;
  purposeCode: PurposeCode;
  purposeDescription: string;
  isPrimaryManufacturing: boolean;
  candidateReservationId: string | null;
  candidateCode: string | null;
};

export type NumberingDraftWorkspace = {
  id: string;
  companyId: string;
  draftMode: DraftMode;
  lifecycleStatus: LifecycleStatus;
  ownerId: string;
  sourceRootId: string | null;
  sourceDrawingNumberId: string | null;
  sourcePartNumberId: string | null;
  sourceLinkType: "primary_manufacturing" | "reference" | null;
  appendReason: string | null;
  rowVersion: number;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  root: DraftRoot | null;
  parts: DraftPart[];
  drawings: DraftDrawing[];
  relations: Array<{ id: string; drawingDraftId: string; partDraftId: string; linkType: string; isPrimary: boolean }>;
  reservations: Array<{
    id: string;
    itemType: "root" | "part" | "drawing";
    itemId: string;
    candidateCode: string;
    state: "active" | "review_locked" | "approved_locked" | "promoted" | "recycled";
    rowVersion: number;
  }>;
  latestApproval: null | {
    requestId: string;
    status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
    applyStatus: "not_ready" | "not_required" | "pending" | "applied" | "failed";
    applyError: string | null;
    snapshotHash: string | null;
    decision: "approved" | "rejected" | "needs_info" | null;
    comment: string | null;
    decidedAt: string | null;
  };
  latestReviewFeedback: null | {
    requestId: string;
    status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
    decision: "approved" | "rejected" | "needs_info" | null;
    comment: string | null;
    decidedAt: string | null;
  };
  projection: NumberStateProjection;
  lifecycleV2: NumberLifecycleProjectionV2 | null;
  candidateRevisions: Array<{
    id: string;
    drawingDraftId: string;
    revision: string;
    policySnapshot: Record<string, unknown>;
    overrideReason: string | null;
    lifecycleStatus: "draft" | "review_locked" | "promoted" | "cancelled";
    rowVersion: number;
    approvalRequestId: string | null;
    formalDrawingNumberId: string | null;
    formalRevisionPackageId: string | null;
    files: Array<{
      id: string;
      sourceFileAssetId: string;
      publicationEvidenceId: string | null;
      role: "cad_3d" | "drawing_2d" | "intermediate" | "pdf" | "dwg_dxf" | "other";
      displayName: string;
      description: string;
      isPrimary: boolean;
      removedAt: string | null;
    }>;
    effectiveStatus: "ReviewApproved" | "Pending" | null;
  }>;
  capabilities: {
    canUpdate: boolean;
    canAcquireCandidates: boolean;
    canCancel: boolean;
    canSubmitReview: boolean;
    canWithdrawReview: boolean;
    canPublish: boolean;
    publishBlockedReason: string | null;
  };
  references: Array<{ type?: string; id?: string; label?: string; href?: string | null }>;
};

type ApiErrorEnvelope = {
  error?: string | {
    code?: string;
    message?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };
  message?: string;
};

type DuplicateCheckState = "idle" | "checking" | "ready" | "error";

type DuplicateMatch = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  displayCode: string;
  displayName: string;
  recordStatus: string;
  score: number;
  reason: "exact_code" | "exact_name" | "high_similarity";
  severity: "warning" | "blocker";
};

type DuplicateResult = {
  blocked: boolean;
  warningsOnly: boolean;
  matches: DuplicateMatch[];
  warningEventId: string | null;
};

type AppendPolicy = {
  root: {
    id: string;
    rootCode: string;
    coreName: string;
    itemKind: ItemKind;
    recordStatus: string;
  };
  locked: boolean;
  reasonRequired: boolean;
  nextNumbers: {
    part: string;
    drawingM: string;
    drawingR: string;
  };
  drawings: Array<{
    id: string;
    drawingNumber: string;
    purposeCode: PurposeCode;
    recordStatus: string;
  }>;
};

type NumberPreview = {
  root: string | null;
  part: string | null;
  drawing: string | null;
  purposeCode: "M" | "R";
  missingRoot?: boolean;
};

type CreateFormState = {
  mode: DraftMode;
  sourceRootCode: string;
  coreName: string;
  nameCore: string;
  nameBrand: string;
  nameSpecification: string;
  nameFeature: string;
  nameSerial: string;
  sharedName: boolean;
  rootItemKind: ItemKind;
  appendReason: string;
  sourceDrawingNumberId: string;
  partName: string;
  partItemKind: ItemKind;
  isUniversal: boolean;
  universalReason: string;
  customSpecification: string;
  seriesCode: string;
  processControlled: boolean;
  includeDrawing: boolean;
  purposeCode: PurposeCode;
  purposeDescription: string;
};

const PAGE_SIZE = 20;
const itemKindOptions: Array<{ value: ItemKind; label: string }> = [
  { value: "manufactured", label: "自製件" },
  { value: "purchased", label: "採購件" },
  { value: "outsourced", label: "發包" },
  { value: "shared", label: "共用" },
  { value: "custom", label: "客製" }
];
const createItemKindOptions = itemKindOptions.filter((option) => option.value === "manufactured" || option.value === "purchased");
const appendPartKindOptions: Array<{ value: ItemKind | "standard"; label: string }> = [
  { value: "manufactured", label: "自製件" },
  { value: "purchased", label: "外購件" },
  { value: "standard", label: "標準件" }
];
const purposeOptions: Array<{ value: PurposeCode; label: string }> = [
  { value: "M", label: "製造圖 M" },
  { value: "R", label: "參考圖 R" }
];
const modeOptions: Array<{ value: DraftMode; label: string; description: string }> = [
  { value: "new_bundle", label: "建立新圖料", description: "建立新的品名主題，可同時準備料號與圖號。" },
  { value: "append_drawing", label: "既有圖料根號加圖號", description: "在既有圖料根號下新增圖號。" },
  { value: "append_part", label: "既有圖料根號加料號", description: "在既有圖料根號下新增料號。" },
  { value: "append_drawing_part", label: "既有圖料根號加圖號與料號", description: "同一申請內建立相互關聯的圖號與料號。" }
];

export type NumberStateCreateSurface = "parts" | "drawings" | "search" | "drafts" | "root-detail" | "global";
export type NumberStateModule = "search" | "drawings" | "parts";

type NumberStateModuleConfig = {
  title: string;
  officialLabel: string;
  officialHref: string;
  officialHelpScope: StatusScopeId;
  reservedHref: string;
  reservedCodeLabel: string;
  emptyCodeLabel: string;
  ariaLabel: string;
  createSurface: NumberStateCreateSurface;
};

const numberStateModuleConfigs: Record<NumberStateModule, NumberStateModuleConfig> = {
  search: {
    title: "圖料工作台",
    officialLabel: "圖料總表",
    officialHref: "/numbering/search",
    officialHelpScope: "numberingSearch",
    reservedHref: "/numbering/search?tab=reserved",
    reservedCodeLabel: "圖號 / 料號",
    emptyCodeLabel: "尚未產生圖料號",
    ariaLabel: "圖料工作台分頁",
    createSurface: "search"
  },
  drawings: {
    title: "圖號工作台",
    officialLabel: "圖號總表",
    officialHref: "/numbering/drawings",
    officialHelpScope: "drawingList",
    reservedHref: "/numbering/drawings?tab=reserved",
    reservedCodeLabel: "圖號",
    emptyCodeLabel: "尚未產生圖號",
    ariaLabel: "圖號工作台分頁",
    createSurface: "drawings"
  },
  parts: {
    title: "料號工作台",
    officialLabel: "料號總表",
    officialHref: "/parts",
    officialHelpScope: "partsList",
    reservedHref: "/parts?tab=drafts",
    reservedCodeLabel: "料號",
    emptyCodeLabel: "尚未產生料號",
    ariaLabel: "料號工作台分頁",
    createSurface: "parts"
  }
};

type NumberStateCreateCta = {
  label: string;
  title: string;
  ariaLabel: string;
  defaultMode: DraftMode;
};

export function getNumberStateCreateCta({
  surface = "global",
  hasRootContext = false,
  preferredMode = "new_bundle"
}: {
  surface?: NumberStateCreateSurface;
  hasRootContext?: boolean;
  preferredMode?: DraftMode;
} = {}): NumberStateCreateCta {
  if (hasRootContext && preferredMode === "append_drawing") {
    return {
      label: "建立新圖號",
      title: "在目前圖料根號建立新圖號",
      ariaLabel: "在目前圖料根號建立新圖號",
      defaultMode: "append_drawing"
    };
  }
  if (hasRootContext && preferredMode === "append_part") {
    return {
      label: "建立新料號",
      title: "在目前圖料根號建立新料號",
      ariaLabel: "在目前圖料根號建立新料號",
      defaultMode: "append_part"
    };
  }
  if (hasRootContext && preferredMode === "append_drawing_part") {
    return {
      label: "建立新圖號與料號",
      title: "在目前圖料根號建立相互關聯的圖號與料號",
      ariaLabel: "在目前圖料根號建立新圖號與料號",
      defaultMode: "append_drawing_part"
    };
  }

  const defaultMode = surface === "root-detail" ? preferredMode : "new_bundle";
  return {
    label: "建立編號",
    title: "建立編號申請",
    ariaLabel: "建立編號",
    defaultMode
  };
}

function initialCreateForm(mode: DraftMode = "new_bundle", sourceRootCode = ""): CreateFormState {
  return {
    mode,
    sourceRootCode,
    coreName: "",
    nameCore: "",
    nameBrand: "",
    nameSpecification: "",
    nameFeature: "",
    nameSerial: "",
    sharedName: false,
    rootItemKind: "manufactured",
    appendReason: "",
    sourceDrawingNumberId: "",
    partName: "",
    partItemKind: "manufactured",
    isUniversal: false,
    universalReason: "",
    customSpecification: "",
    seriesCode: "",
    processControlled: true,
    includeDrawing: true,
    purposeCode: "M",
    purposeDescription: ""
  };
}

function defaultProcessControlled(kind: ItemKind) {
  return kind === "manufactured" || kind === "outsourced" || kind === "custom";
}

function defaultIncludeDrawing(kind: ItemKind) {
  if (kind === "purchased") return false;
  if (kind === "manufactured" || kind === "outsourced" || kind === "custom") return true;
  return false;
}

function normalizeNameSegment(value: string) {
  return value.trim().replace(/[\s_]+/gu, "_").replace(/^_+|_+$/gu, "");
}

function suggestedCoreName(form: CreateFormState) {
  const core = normalizeNameSegment(form.nameCore);
  if (!core) return "";
  const brand = normalizeNameSegment(form.nameBrand);
  const specification = normalizeNameSegment(form.nameSpecification);
  const series = form.sharedName ? "" : normalizeNameSegment(form.seriesCode);
  const feature = normalizeNameSegment(form.nameFeature);
  const serial = normalizeNameSegment(form.nameSerial);
  const segments = form.rootItemKind === "purchased"
    ? [core, brand, specification]
    : [core, series, feature || specification, serial];
  return segments.filter(Boolean).join("_");
}

function nameGuideFormula(kind: ItemKind) {
  if (kind === "purchased") return "採購件建議：[核心名詞]_[品牌]_[規格/型號]";
  return "自製件建議：[核心名詞]_[系列代號]_[特性]_[流水識別]";
}

function drawingToggleHint(includeDrawing: boolean) {
  return includeDrawing ? "會出現圖號欄位，請確認圖面用途。" : "本次只建料號，之後仍可追加圖號。";
}

function previewText(state: "idle" | "loading" | "ready" | "error", value: string | null | undefined) {
  if (state === "loading" || state === "idle") return "讀取中";
  if (state === "error") return "暫時無法預覽";
  return value ?? "-";
}

function newIdempotencyKey(action: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `dev048:phase1c:${action}:${id}`;
}

async function readApiBody<T>(response: Response): Promise<T & ApiErrorEnvelope> {
  return await response.json().catch(() => ({})) as T & ApiErrorEnvelope;
}

function apiErrorMessage(response: Response, body: ApiErrorEnvelope, fallback: string) {
  const code = typeof body.error === "string" ? body.error : body.error?.code ?? "";
  const message = typeof body.error === "string" ? body.message : body.error?.message;
  if (code === "feature_not_open_in_production_slice") return "此功能尚未開放，請通知管理員檢查 API allowlist。";
  if (response.status === 401) return "登入已失效，請重新登入後回到這筆編號。";
  if (response.status === 403) return "目前帳號或公司沒有執行此動作的權限。";
  if (response.status === 404) return "找不到這筆編號，或它不屬於目前公司。";
  if (code === "source_root_not_found") return "找不到這個圖料根號，請確認後重試。";
  if (code === "append_reason_required") return "此圖料根號已有已發布資料，請填寫新增原因。";
  if (code === "numbering_invalid_relation") return "圖料關聯不符合規則；參考圖不能設為製造基準。";
  if (code === "candidate_collision") return "候選號同時被另一筆申請取得，請重新整理後再試。";
  if (code === "numbering_conflict") return "編號與既有歷史衝突；系統未建立資料。請重新整理取得下一個可用編號。";
  if (response.status === 409 && code === "workspace_version_conflict") return "編號內容已被更新，系統已重新載入最新內容，請確認後再操作。";
  if (code === "candidate_required_before_review") return "這筆申請尚未完成編號建立，請重新建立申請或請 PDM Admin 協助。";
  if (code === "candidate_review_already_pending") return "這筆編號已在審核中，請前往審核中心查看。";
  if (code === "candidate_review_not_pending") return "這筆編號目前沒有可撤回的待審申請。";
  if (code === "review_withdraw_owner_required") return "只有申請負責人可以撤回待審申請。";
  if (code === "candidate_approval_required") return "編號尚未完成核准，不能發布。";
  if (code === "candidate_approval_lock_mismatch") return "核准鎖定資料已不一致，請由 PDM Admin 檢查。";
  if (code === "approval_snapshot_stale") return "已核准內容與目前編號申請不一致，請重新送審。";
  if (code === "publication_evidence_not_ready") return "圖面受控檔案證據尚未完成，不能發布。";
  if (code === "official_number_collision") return "編號已存在；系統沒有自動改號，請由 PDM Admin 處理衝突。";
  if (code === "workspace_already_published") return "這筆編號已發布，系統不會重複建立資料。";
  if (response.status === 503 || code === "numbering_authority_unavailable") return "編號服務目前不可用。表單內容已保留，請稍後重試；不可改用離線或自行編號。";
  return message || fallback;
}

function useOverlayLifecycle(containerRef: RefObject<HTMLElement | null>, onClose: () => void, busy: boolean) {
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const container = containerRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const initialFocus = container?.querySelector<HTMLElement>("[data-autofocus]")
      ?? container?.querySelector<HTMLElement>(focusableSelector);
    initialFocus?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [containerRef]);
}

function useFeatureStatus() {
  const [status, setStatus] = useState<FeatureStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/numbering/state-flow/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: FeatureStatus | null) => {
        if (!cancelled) setStatus(body ?? { enabled: false, flag: "PDM_NUMBER_STATE_FLOW_V1", phase: "1B" });
      })
      .catch(() => {
        if (!cancelled) setStatus({ enabled: false, flag: "PDM_NUMBER_STATE_FLOW_V1", phase: "1B" });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function useProductionSliceStatus() {
  const [status, setStatus] = useState<ProductionSliceStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/production-slice/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: ProductionSliceStatus | null) => {
        if (!cancelled) setStatus(body);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function useNumberStateActionPermissions() {
  const [actions, setActions] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/numbering/permissions", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { actions?: Record<string, boolean> } | null) => {
        if (!cancelled) setActions(body?.actions ?? {});
      })
      .catch(() => {
        if (!cancelled) setActions({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return actions;
}

function appendQueryParam(href: string, key: string, value: string) {
  return `${href}${href.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function moduleFromCreateSurface(surface: NumberStateCreateSurface): NumberStateModule {
  if (surface === "search") return "search";
  if (surface === "drawings") return "drawings";
  return "parts";
}

function activateNumberStateTabLinkFromKeyboard(event: ReactKeyboardEvent<HTMLAnchorElement>) {
  if (!shouldActivateLinkFromKeyboard(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}

export function NumberStateModuleTabs({ module, active }: { module: NumberStateModule; active: "official" | "reserved" }) {
  const feature = useFeatureStatus();
  const config = numberStateModuleConfigs[module];
  const helpScope: StatusScopeId = active === "reserved" ? "numberStateWorkspace" : config.officialHelpScope;
  const activeLabel = active === "reserved" ? "編號申請" : config.officialLabel;
  if (!feature?.enabled) return null;
  return (
    <nav className="number-state-tabs" aria-label={config.ariaLabel}>
      <a className={active === "official" ? "is-active" : undefined} href={config.officialHref} aria-current={active === "official" ? "page" : undefined} onKeyDown={activateNumberStateTabLinkFromKeyboard}>
        {config.officialLabel}
      </a>
      <a className={active === "reserved" ? "is-active" : undefined} href={config.reservedHref} aria-current={active === "reserved" ? "page" : undefined} onKeyDown={activateNumberStateTabLinkFromKeyboard}>
        編號申請
      </a>
      <StatusScopeHelp
        scope={helpScope}
        buttonLabel={`查看${activeLabel}分頁說明`}
        className="number-state-tab-help"
      />
    </nav>
  );
}

export function NumberStatePartsTabs({ active }: { active: "official" | "drafts" | "reserved" }) {
  return <NumberStateModuleTabs module="parts" active={active === "official" ? "official" : "reserved"} />;
}

export function NumberStateOwnerCreateAction({
  label,
  defaultMode = "new_bundle",
  sourceRootId = "",
  surface = "global",
  hasRootContext = false,
  seriesCodeOptions = []
}: {
  label?: string;
  defaultMode?: DraftMode;
  sourceRootId?: string;
  surface?: NumberStateCreateSurface;
  hasRootContext?: boolean;
  seriesCodeOptions?: string[];
}) {
  const feature = useFeatureStatus();
  const actionPermissions = useNumberStateActionPermissions();
  const [open, setOpen] = useState(false);
  const createCta = getNumberStateCreateCta({
    surface,
    hasRootContext: hasRootContext || sourceRootId.trim().length > 0,
    preferredMode: defaultMode
  });
  const buttonLabel = label ?? createCta.label;
  const canCreate = actionPermissions?.["numbering.workspace.create"] === true;
  const createTitle = actionPermissions === null ? "正在確認建立權限" : canCreate ? createCta.title : "未開放：目前帳號沒有建立編號的權限";

  useEffect(() => {
    if (!feature?.enabled || !canCreate) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "numbering") setOpen(true);
  }, [canCreate, feature?.enabled]);

  if (!feature?.enabled) return null;
  return (
    <>
      <button className="primary-button" type="button" onClick={() => setOpen(true)} disabled={!canCreate} title={createTitle} aria-label={createCta.ariaLabel}>
        <Plus size={16} aria-hidden="true" />
        {buttonLabel}
      </button>
      {open ? (
        <DraftCreateDialog
          initialMode={createCta.defaultMode}
          initialSourceRootId={sourceRootId}
          seriesCodeOptions={seriesCodeOptions}
          onClose={() => setOpen(false)}
          onCreated={(workspace) => {
            if (feature?.partRelationWorkbench?.enabled && surface === "parts") {
              window.location.assign(`/parts?view=work&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`);
              return;
            }
            if (feature?.partRelationWorkbench?.enabled && surface === "search") {
              window.location.assign(`/numbering/search?view=work&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`);
              return;
            }
            if (feature?.drawingWorkbench?.enabled && surface === "drawings") {
              window.location.assign(`/numbering/drawings?view=work&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`);
              return;
            }
            const targetModule = moduleFromCreateSurface(surface);
            window.location.assign(appendQueryParam(numberStateModuleConfigs[targetModule].reservedHref, "detail", workspace.id));
          }}
        />
      ) : null}
    </>
  );
}

export function NumberStateWorkspaceWorkbench({ module = "parts" }: { module?: NumberStateModule } = {}) {
  const moduleConfig = numberStateModuleConfigs[module];
  const feature = useFeatureStatus();
  const productionSlice = useProductionSliceStatus();
  const actionPermissions = useNumberStateActionPermissions();
  const [workspaces, setWorkspaces] = useState<NumberingDraftWorkspace[]>([]);
  const [selected, setSelected] = useState<NumberingDraftWorkspace | null>(null);
  const [ownerScope, setOwnerScope] = useState<"mine" | "all">("mine");
  const [lifecycle, setLifecycle] = useState<"all" | LifecycleStatus>("all");
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesCodeOptions, setSeriesCodeOptions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({
    storageKey: DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
    defaultWidth: DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
    minWidth: DRAWING_DETAIL_DRAWER_MIN_WIDTH
  });
  const idempotencyKeys = useRef(new Map<string, string>());
  const initialQueryHandled = useRef(false);
  const createCta = getNumberStateCreateCta({ surface: moduleConfig.createSurface });
  const canCreate = actionPermissions?.["numbering.workspace.create"] === true;
  const createTitle = actionPermissions === null ? "正在確認建立權限" : canCreate ? createCta.title : "未開放：目前帳號沒有建立編號的權限";
  const formalActionsUnopened = productionSlice?.configured === true;
  const formalActionsUnopenedMessage = productionSlice?.unopenedMessage ?? DEFAULT_PRODUCTION_SLICE_UNOPENED_MESSAGE;
  const lifecycleV2Enabled = feature?.lifecycleV2?.enabled === true;

  useEffect(() => {
    if (lifecycleV2Enabled && module === "drawings") setLifecycle("active");
  }, [lifecycleV2Enabled, module]);

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    if (!feature?.enabled) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ owner: ownerScope, limit: "100" });
    if (lifecycle !== "all") params.set("lifecycleStatus", lifecycle);
    if (seriesCode) params.set("seriesCode", seriesCode);
    const response = await fetch(`/api/numbering/draft-workspaces?${params.toString()}`, { cache: "no-store" });
    const body = await readApiBody<{ workspaces?: NumberingDraftWorkspace[]; seriesCodeOptions?: string[] }>(response);
    setLoading(false);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      setError(apiErrorMessage(response, body, "編號申請清單暫時無法讀取。"));
      return;
    }
    const next = body.workspaces ?? [];
    setSeriesCodeOptions(body.seriesCodeOptions ?? []);
    setWorkspaces(next);
    setSelected((current) => {
      const targetId = preferredId ?? current?.id;
      if (!targetId) return current;
      const nextSelected = next.find((workspace) => workspace.id === targetId) ?? null;
      if (!nextSelected) setEditOpen(false);
      return nextSelected;
    });
  }, [feature?.enabled, lifecycle, ownerScope, seriesCode]);

  const loadDetail = useCallback(async (workspaceId: string) => {
    setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    if (!response.ok || !body.workspace) {
      setError(apiErrorMessage(response, body, "編號申請明細暫時無法讀取。"));
      return null;
    }
    setSelected(body.workspace);
    return body.workspace;
  }, []);

  useEffect(() => {
    if (!feature?.enabled || initialQueryHandled.current) return;
    initialQueryHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const createMode = params.get("create") as DraftMode | null;
    if (createMode && modeOptions.some((option) => option.value === createMode)) setCreateOpen(true);
    const detailId = params.get("detail");
    if (detailId) void loadDetail(detailId);
  }, [feature?.enabled, loadDetail]);

  useEffect(() => {
    if (!feature?.enabled || !initialQueryHandled.current) return;
    void loadWorkspaces();
  }, [feature?.enabled, loadWorkspaces]);

  const filtered = useMemo(() => workspaces.filter((workspace) => {
    if (!workspaceMatchesModule(workspace, module)) return false;
    if (seriesCode && !workspace.parts.some((part) => part.seriesCode === seriesCode)) return false;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    const values = [
      workspace.id,
      workspace.sourceRootId,
      workspace.root?.coreName,
      ...moduleSearchValues(workspace, module)
    ];
    return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
  }), [module, query, seriesCode, workspaces]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [lifecycle, ownerScope, query, seriesCode]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const refreshWorkspace = useCallback(async (workspaceId: string) => {
    const latest = await loadDetail(workspaceId);
    await loadWorkspaces(workspaceId);
    return latest;
  }, [loadDetail, loadWorkspaces]);

  function idempotencyKey(workspaceId: string, action: WorkspaceAction) {
    const mapKey = `${workspaceId}:${action}`;
    const existing = idempotencyKeys.current.get(mapKey);
    if (existing) return existing;
    const created = newIdempotencyKey(action);
    idempotencyKeys.current.set(mapKey, created);
    return created;
  }

  async function runWorkspaceAction(action: WorkspaceAction) {
    if (!selected) return;
    if (formalActionsUnopened && action !== "cancel") {
      setError(formalActionsUnopenedMessage);
      setConfirmAction(null);
      return;
    }
    setActionBusy(true);
    setError("");
    setNotice("");
    const endpoint = ({
      cancel: "cancel",
      submit: lifecycleV2Enabled ? "submit-bundle-review" : "submit-review",
      withdraw: lifecycleV2Enabled ? "withdraw-bundle-review" : "withdraw-review",
      publish: "publish"
    } as const)[action];
    let response: Response;
    try {
      response = await fetch(
        `/api/numbering/draft-workspaces/${encodeURIComponent(selected.id)}/${endpoint}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey(selected.id, action)
          },
          body: JSON.stringify({
            ...(lifecycleV2Enabled && (action === "submit" || action === "withdraw")
              ? { expectedWorkspaceRowVersion: selected.rowVersion }
              : { expectedRowVersion: selected.rowVersion }),
            ...(action === "cancel" ? { reason: "user_cancelled_draft" } : {}),
            ...(action === "submit" ? { reason: lifecycleV2Enabled ? "draft_owner_confirmed_candidate_bundle_review" : "draft_owner_confirmed_candidate_publication_review" } : {}),
            ...(action === "withdraw" && lifecycleV2Enabled ? { reason: "draft_owner_withdrew_candidate_bundle_review" } : {})
          })
        }
      );
    } catch {
      const unknownResultMessage = ({
        cancel: "取消結果尚未確認；請重新整理狀態後再決定下一步。",
        submit: "送審結果尚未確認；請重新整理狀態後再決定下一步。",
        withdraw: "撤回結果尚未確認；請重新整理狀態後再決定下一步。",
        publish: "發布結果尚未確認；請重新整理狀態後再決定下一步。"
      } as const)[action];
      setActionBusy(false);
      setConfirmAction(null);
      setError(unknownResultMessage);
      try {
        await refreshWorkspace(selected.id);
      } catch {
        // Keep the local recovery path usable even when the readback request is also unavailable.
      }
      return;
    }
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace; idempotentReplay?: boolean }>(response);
    setActionBusy(false);
    setConfirmAction(null);
    if (!response.ok || !body.workspace) {
      const fallback = ({ cancel: "編號申請取消失敗。", submit: "送審失敗。", withdraw: "撤回審核失敗。", publish: "發布失敗。" } as const)[action];
      setError(apiErrorMessage(response, body, fallback));
      if (response.status !== 503) idempotencyKeys.current.delete(`${selected.id}:${action}`);
      if (response.status === 409) await refreshWorkspace(selected.id);
      return;
    }
    idempotencyKeys.current.delete(`${selected.id}:${action}`);
    setSelected(body.workspace);
    setNotice(({
      cancel: "申請已取消；編號不再繼續處理。",
      submit: lifecycleV2Enabled ? "圖料號、關係、首版與檔案證據已整包送審；核准後由系統發布。" : "申請已送審；編號已鎖定，核准後仍需依發布流程完成。",
      withdraw: "待審申請已撤回，編號已解鎖，可繼續編輯。",
      publish: "圖料號已發布；主檔狀態為有效，後續圖面版本發行仍走既有流程。"
    } as const)[action]);
    await loadWorkspaces(body.workspace.id);
  }

  async function updateWorkspace(payload: Record<string, unknown>) {
    if (!selected) return;
    setActionBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, expectedRowVersion: selected.rowVersion })
    });
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setActionBusy(false);
    if (!response.ok || !body.workspace) {
      setError(apiErrorMessage(response, body, "編號申請更新失敗。"));
      if (response.status === 409) await refreshWorkspace(selected.id);
      return;
    }
    setSelected(body.workspace);
    setEditOpen(false);
    setNotice("申請內容已更新。編號與狀態仍以伺服器回傳為準。");
    await loadWorkspaces(body.workspace.id);
  }

  if (feature === null) {
    return <section className="panel"><div className="empty">正在確認編號功能狀態...</div></section>;
  }
  if (!feature.enabled) {
    return (
      <>
          <div className="topbar"><div><h1>{moduleConfig.title}</h1><p>編號申請功能尚未開放。</p></div></div>
        <section className="panel"><div className="empty"><LockKeyhole size={26} /><strong>編號申請分頁尚未開放</strong><p>請回{moduleConfig.officialLabel}；系統不會從此頁建立申請或占用編號。</p><Link className="primary-button" href={moduleConfig.officialHref}>回{moduleConfig.officialLabel}</Link></div></section>
      </>
    );
  }

  return (
    <>
      <div className="topbar number-state-topbar">
        <div>
          <h1>{lifecycleV2Enabled && module === "drawings" ? "圖號／首版準備" : moduleConfig.title}</h1>
          <p>{lifecycleV2Enabled && module === "drawings" ? "完成首版準備並送審，核准後由系統發布。" : "建立申請時會建立編號；發布前不能作為製造、採購或交接依據。"}</p>
        </div>
        <div className="number-state-owner-actions">
          <button className="secondary-button" type="button" onClick={() => void loadWorkspaces()} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
          <button className="primary-button" type="button" onClick={() => setCreateOpen(true)} disabled={!canCreate} title={createTitle} aria-label={createCta.ariaLabel}>
            <Plus size={16} aria-hidden="true" />
            {createCta.label}
          </button>
        </div>
      </div>
      <NumberStateModuleTabs module={module} active="reserved" />

      <div className="sr-only" aria-live="polite">{notice || error}</div>
      {notice ? <div className="number-state-message is-success" role="status">{notice}</div> : null}
      {error ? (
        <div className="number-state-message is-error" role="alert">
          <span>{error}</span>
          {selected && !lifecycleAdoptionHidden(selected) && recoveryHref(selected) ? <Link href={recoveryHref(selected)!}>前往處理阻擋</Link> : null}
          <button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤訊息"><X size={16} /></button>
        </div>
      ) : null}

      <section className="panel number-state-toolbar">
        <div className="number-state-filter-grid">
          <label>
            <span>搜尋</span>
            <div className="number-state-search-field"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="申請名稱、編號或 ID" /></div>
          </label>
          <label><span>系列代號</span><select value={seriesCode} onChange={(event) => setSeriesCode(event.target.value)}><option value="">全部系列代號</option>{seriesCodeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label><span>範圍</span><select value={ownerScope} onChange={(event) => setOwnerScope(event.target.value as "mine" | "all")}><option value="mine">我的編號申請</option><option value="all">全公司編號申請</option></select></label>
          <label><span>生命週期</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as "all" | LifecycleStatus)}><option value="all">全部</option><option value="active">進行中</option><option value="cancelled">已取消</option><option value="published">已發布</option></select></label>
        </div>
      </section>

      <section className="panel pdm-master-table-panel number-state-list-panel">
        {loading && workspaces.length === 0 ? <div className="empty">正在載入圖料號申請...</div> : null}
        {!loading && !error && filtered.length === 0 ? (
          <div className="empty"><CircleDashed size={26} /><strong>目前沒有符合條件的編號申請</strong><p>請建立新申請；關閉建立視窗不會寫入資料或占用編號。</p><button className="primary-button" type="button" onClick={() => setCreateOpen(true)} disabled={!canCreate} title={createTitle} aria-label={createCta.ariaLabel}><Plus size={16} />{createCta.label}</button></div>
        ) : null}
        {filtered.length > 0 ? (
          <div className="table-wrap pdm-identity-scroll number-state-table-wrap" role="region" aria-label="編號申請清單">
            <table className="pdm-identity-table number-state-table">
              <colgroup>
                <col className="pdm-identity-col-code" />
                <col className="pdm-identity-col-name" />
                <col className="pdm-identity-col-part" />
                <col className="pdm-identity-col-meta" />
              </colgroup>
              <thead><tr><th>{moduleConfig.reservedCodeLabel}</th><th>申請名稱</th><th>內容</th><th>{lifecycleV2Enabled && module === "drawings" ? "目前階段" : "申請狀態"}</th></tr></thead>
              <tbody>
                {visible.map((workspace) => {
                  const codes = candidateCodesForModule(workspace, module);
                  const selectedRow = selected?.id === workspace.id;
                  return (
                    <tr
                      key={workspace.id}
                      data-number-state-row="true"
                      aria-selected={selectedRow}
                      className={selectedRow ? "selected-row" : undefined}
                      onClick={() => void loadDetail(workspace.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td data-label={moduleConfig.reservedCodeLabel}>
                        <button
                          className="link-button pdm-identity-code number-state-row-link"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void loadDetail(workspace.id);
                          }}
                          aria-label={`查看 ${workspaceTitle(workspace)} 明細`}
                          title={codes.length > 0 ? codes.join("、") : moduleConfig.emptyCodeLabel}
                        >
                          <SearchHighlight value={codes.length > 0 ? codes.join("、") : moduleConfig.emptyCodeLabel} query={query} />
                        </button>
                      </td>
                      <td data-label="申請名稱">
                        <div className="pdm-identity-name"><SearchHighlight value={workspaceTitle(workspace)} query={query} /></div>
                      </td>
                      <td data-label="內容"><SearchHighlight value={moduleContentSummary(workspace, module)} query={query} /></td>
                      <td data-label={lifecycleV2Enabled && module === "drawings" ? "目前階段" : "申請狀態"}>
                        {lifecycleV2Enabled && workspace.lifecycleV2 ? <LifecycleV2Badge workspace={workspace} /> : <div className="pdm-meta-strip"><LifecycleBadge lifecycle={workspace.projection.lifecycle} /></div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {filtered.length > PAGE_SIZE ? (
          <div className="number-state-pagination">
            <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} />上一頁</button>
            <span className="number-state-pagination-summary">第 {page} / {pageCount} 頁 · 共 {filtered.length} 筆</span>
            <button className="secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁<ChevronRight size={16} /></button>
          </div>
        ) : null}
      </section>

      {selected ? (
        <WorkspaceDrawer
          workspace={selected}
          busy={actionBusy}
          editing={editOpen}
          onEdit={() => setEditOpen(true)}
          onCancelEdit={() => setEditOpen(false)}
          onUpdate={(payload) => void updateWorkspace(payload)}
          onSubmit={() => setConfirmAction("submit")}
          onWithdraw={() => setConfirmAction("withdraw")}
          onPublish={() => setConfirmAction("publish")}
          onCancel={() => setConfirmAction("cancel")}
          formalActionsUnopened={formalActionsUnopened}
          unopenedMessage={formalActionsUnopenedMessage}
          canCreateDrawingRevision={actionPermissions?.["numbering.draft.update"] === true}
          lifecycleV2Enabled={lifecycleV2Enabled}
          onV2WorkspaceChange={(workspace) => {
            const next = workspace as NumberingDraftWorkspace;
            setSelected(next);
            void loadWorkspaces(next.id);
          }}
          onV2Error={setError}
          onV2Notice={setNotice}
          seriesCodeOptions={seriesCodeOptions}
          width={drawerWidth}
          onStartResize={startDrawerResize}
          keepOpenSelector="[data-number-state-row='true']"
          onClose={() => { setSelected(null); setEditOpen(false); }}
        />
      ) : null}
      {createOpen ? (
        <DraftCreateDialog
          initialMode={createModeFromLocation()}
          initialSourceRootId={sourceRootFromLocation()}
          seriesCodeOptions={seriesCodeOptions}
          onClose={() => setCreateOpen(false)}
          onCreated={(workspace) => {
            setCreateOpen(false);
            setSelected(workspace);
            setNotice("申請已建立並取得編號；發布前不能作為製造、採購或交接依據。");
            void loadWorkspaces(workspace.id);
          }}
        />
      ) : null}
      {confirmAction && selected ? (
        <ConfirmDialog
          action={confirmAction}
          workspace={selected}
          busy={actionBusy}
          onClose={() => setConfirmAction(null)}
          lifecycleV2Enabled={lifecycleV2Enabled}
          onConfirm={() => void runWorkspaceAction(confirmAction)}
        />
      ) : null}
    </>
  );
}

function DraftCreateDialog({
  initialMode,
  initialSourceRootId,
  seriesCodeOptions,
  onClose,
  onCreated
}: {
  initialMode: DraftMode;
  initialSourceRootId: string;
  seriesCodeOptions: string[];
  onClose: () => void;
  onCreated: (workspace: NumberingDraftWorkspace) => void;
}) {
  const [form, setForm] = useState(() => initialCreateForm(initialMode, initialSourceRootId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appendPolicy, setAppendPolicy] = useState<AppendPolicy | null>(null);
  const [appendPolicyState, setAppendPolicyState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [numberPreview, setNumberPreview] = useState<NumberPreview | null>(null);
  const [numberPreviewState, setNumberPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [duplicateCheckState, setDuplicateCheckState] = useState<DuplicateCheckState>("idle");
  const [duplicateCheckError, setDuplicateCheckError] = useState("");
  const [duplicateCheckRetry, setDuplicateCheckRetry] = useState(0);
  const idempotencyKey = useRef(newIdempotencyKey("create"));
  const dialogRef = useRef<HTMLElement | null>(null);
  const includesPart = form.mode === "new_bundle" || form.mode === "append_part" || form.mode === "append_drawing_part";
  const manufacturedPartMustIncludeDrawing = form.mode === "new_bundle" && form.partItemKind === "manufactured";
  const effectiveIncludeDrawing = manufacturedPartMustIncludeDrawing || form.includeDrawing;
  const includesDrawing = form.mode === "append_drawing" || form.mode === "append_drawing_part" || (form.mode === "new_bundle" && effectiveIncludeDrawing);
  const showDrawingDraftSection = form.mode === "new_bundle" || includesDrawing;
  const canToggleDrawingDraft = form.mode === "new_bundle" && !manufacturedPartMustIncludeDrawing;
  const effectiveCoreName = form.mode === "new_bundle" ? form.coreName.trim() : appendPolicy?.root.coreName ?? "";
  const lockedPartName = effectiveCoreName.trim();
  const manufacturingDrawing = isManufacturingPurposeCode(form.purposeCode);
  const effectivePrimaryManufacturing = manufacturingDrawing && includesPart && includesDrawing;
  const relationLinkType = includesPart && includesDrawing && effectivePrimaryManufacturing ? "primary_manufacturing" : "reference";
  const visiblePreviewState = form.mode === "new_bundle" ? numberPreviewState : appendPolicyState;
  const visiblePartPreview = form.mode === "new_bundle" ? numberPreview?.part : appendPolicy?.nextNumbers.part;
  const visibleDrawingPreview = form.mode === "new_bundle"
    ? numberPreview?.drawing
    : form.purposeCode === "R" ? appendPolicy?.nextNumbers.drawingR : appendPolicy?.nextNumbers.drawingM;
  const suggestedName = suggestedCoreName(form);
  const duplicateCheckName = suggestedName || form.coreName.trim();
  const drawingHint = drawingToggleHint(effectiveIncludeDrawing);
  const showPartKindSelector = form.mode !== "new_bundle";
  const showPartCustomSpecification = form.partItemKind === "custom";
  useOverlayLifecycle(dialogRef, onClose, busy);

  function switchMode(mode: DraftMode) {
    setForm((current) => ({
      ...initialCreateForm(mode, current.sourceRootCode),
      coreName: current.coreName,
      nameCore: current.nameCore,
      nameBrand: current.nameBrand,
      nameSpecification: current.nameSpecification,
      nameFeature: current.nameFeature,
      nameSerial: current.nameSerial,
      sharedName: current.sharedName,
      processControlled: current.processControlled,
      partItemKind: current.partItemKind,
      isUniversal: mode === "new_bundle" ? false : current.isUniversal,
      universalReason: mode === "new_bundle" ? "" : current.universalReason,
      customSpecification: current.customSpecification,
      seriesCode: current.seriesCode,
      includeDrawing: mode === "new_bundle" ? defaultIncludeDrawing(current.partItemKind) : current.includeDrawing
    }));
    setError("");
    setAppendPolicy(null);
    setAppendPolicyState(mode === "new_bundle" ? "idle" : appendPolicyState);
  }

  useEffect(() => {
    const rootCode = form.sourceRootCode.trim().toUpperCase();
    if (form.mode === "new_bundle" || !rootCode) {
      setAppendPolicy(null);
      setAppendPolicyState("idle");
      return;
    }

    const controller = new AbortController();
    setAppendPolicy(null);
    setAppendPolicyState("loading");
    const timer = window.setTimeout(() => {
      fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/append-policy`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json() as AppendPolicy;
        })
        .then((policy) => {
          setAppendPolicy(policy);
          setAppendPolicyState("ready");
          setError("");
        })
        .catch((fetchError: unknown) => {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
          setAppendPolicy(null);
          setAppendPolicyState("error");
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.mode, form.sourceRootCode]);

  useEffect(() => {
    if (form.mode !== "append_part" || form.partItemKind !== "manufactured" || form.isUniversal || !appendPolicy) return;
    const availableManufacturingDrawings = appendPolicy.drawings.filter(
      (drawing) => drawing.purposeCode === "M" && !["Obsolete", "Merged"].includes(drawing.recordStatus)
    );
    if (form.sourceDrawingNumberId && availableManufacturingDrawings.some((drawing) => drawing.id === form.sourceDrawingNumberId)) return;
    setForm((current) => ({ ...current, sourceDrawingNumberId: availableManufacturingDrawings[0]?.id ?? "" }));
  }, [appendPolicy, form.isUniversal, form.mode, form.partItemKind, form.sourceDrawingNumberId]);

  useEffect(() => {
    if (form.mode !== "new_bundle") {
      setNumberPreview(null);
      setNumberPreviewState("idle");
      return;
    }

    const controller = new AbortController();
    setNumberPreviewState("loading");
    fetch(`/api/numbering/draft-workspaces/preview?purposeCode=${encodeURIComponent(form.purposeCode === "R" ? "R" : "M")}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const body = await readApiBody<{ preview?: NumberPreview }>(response);
        if (!response.ok || !body.preview) throw new Error(apiErrorMessage(response, body, "預覽號碼讀取失敗。"));
        return body.preview;
      })
      .then((preview) => {
        setNumberPreview(preview);
        setNumberPreviewState("ready");
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setNumberPreview(null);
        setNumberPreviewState("error");
      });

    return () => controller.abort();
  }, [form.mode, form.purposeCode]);

  useEffect(() => {
    const coreName = duplicateCheckName.trim();
    if (form.mode !== "new_bundle" || coreName.length < 2) {
      setDuplicateResult(null);
      setDuplicateCheckState("idle");
      setDuplicateCheckError("");
      return;
    }

    const controller = new AbortController();
    setDuplicateResult(null);
    setDuplicateCheckState("checking");
    setDuplicateCheckError("");
    const timer = window.setTimeout(() => {
      fetch("/api/numbering/duplicate-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coreName, partName: coreName }),
        signal: controller.signal
      })
        .then(async (response) => {
          const body = await readApiBody<DuplicateResult>(response);
          const code = typeof body.error === "string" ? body.error : body.error?.code ?? "";
          if (!response.ok) {
            throw new Error(code === "feature_not_open_in_production_slice"
              ? "查重功能尚未開放，請通知管理員檢查 API allowlist。"
              : apiErrorMessage(response, body, "查重暫時失敗。請稍後重試。"));
          }
          return body;
        })
        .then((result) => {
          setDuplicateResult(result);
          setDuplicateCheckState("ready");
          setDuplicateCheckError("");
        })
        .catch((fetchError: unknown) => {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
          setDuplicateResult(null);
          setDuplicateCheckState("error");
          setDuplicateCheckError(fetchError instanceof Error ? fetchError.message : "查重暫時失敗。請稍後重試。");
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [duplicateCheckName, duplicateCheckRetry, form.mode]);

  async function submit() {
    if (form.mode === "new_bundle" && !form.coreName.trim()) return setError("請輸入確定品名。");
    if (form.mode === "new_bundle" && duplicateCheckState === "checking") return setError("正在查重，請稍候。");
    if (form.mode !== "new_bundle" && !form.sourceRootCode.trim()) return setError("請輸入既有圖料根號。");
    if (form.mode !== "new_bundle" && appendPolicyState === "loading") return setError("正在讀取圖料根號資料，請稍候。");
    if (form.mode !== "new_bundle" && appendPolicyState !== "ready") return setError("找不到這個圖料根號，請確認後重試。");
    if (appendPolicy?.locked) return setError("此圖料根號已關閉，不能再新增圖號或料號。");
    if (appendPolicy?.reasonRequired && !form.appendReason.trim()) return setError("此圖料根號已有已發布資料，請填寫新增原因。");
    if (includesPart && !lockedPartName) return setError("請先完成確定品名。");
    if (includesPart && form.partItemKind === "custom" && !form.customSpecification.trim()) return setError("客製料件請填寫客製尺寸或規格。");
    if (form.mode === "append_part" && form.partItemKind === "manufactured" && !form.isUniversal && !form.sourceDrawingNumberId) return setError("自製件必須選擇同一圖料根號的正式製造圖。");
    if (includesDrawing && form.purposeCode === "R" && !form.purposeDescription.trim()) return setError("請填寫參考用途。");

    const partClientKey = "part-1";
    const drawingClientKey = "drawing-1";
    const body = {
      autoAcquireCandidates: true,
      draftMode: form.mode,
      sourceRootId: form.mode === "new_bundle" ? undefined : appendPolicy?.root.id,
      sourceDrawingNumberId: form.mode === "append_part" && form.sourceDrawingNumberId ? form.sourceDrawingNumberId : undefined,
      sourceLinkType: form.mode === "append_part" && form.sourceDrawingNumberId ? "primary_manufacturing" : undefined,
      appendReason: form.mode === "new_bundle" ? undefined : form.appendReason.trim() || null,
      root: form.mode === "new_bundle" ? { coreName: form.coreName.trim(), itemKind: form.rootItemKind } : undefined,
      parts: includesPart ? [{
        clientKey: partClientKey,
        partName: lockedPartName,
        itemKind: form.partItemKind,
        isUniversal: form.isUniversal,
        universalReason: form.universalReason.trim() || null,
        customSpecification: form.customSpecification.trim() || null,
        seriesCode: form.partItemKind === "manufactured" ? form.seriesCode.trim() || null : null
      }] : [],
      drawings: includesDrawing ? [{ clientKey: drawingClientKey, purposeCode: form.purposeCode, purposeDescription: form.purposeDescription.trim(), isPrimaryManufacturing: effectivePrimaryManufacturing }] : [],
      relations: includesPart && includesDrawing ? [{ drawingClientKey, partClientKey, linkType: relationLinkType, isPrimary: relationLinkType === "primary_manufacturing" }] : []
    };
    setBusy(true);
    setError("");
    const response = await fetch("/api/numbering/draft-workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey.current },
      body: JSON.stringify(body)
    });
    const responseBody = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    setBusy(false);
    if (!response.ok || !responseBody.workspace) {
      setError(apiErrorMessage(response, responseBody, "編號申請建立失敗。表單內容已保留。"));
      if (response.status !== 503) idempotencyKey.current = newIdempotencyKey("create");
      return;
    }
    onCreated(responseBody.workspace);
  }

  return (
    <div className="number-state-modal-backdrop" role="presentation">
      <section ref={dialogRef} className="number-state-modal number-state-create-modal" role="dialog" aria-modal="true" aria-labelledby="number-state-create-title">
        <div className="number-state-modal-header">
          <div><h2 id="number-state-create-title" tabIndex={-1} data-autofocus>建立編號</h2><p>先確認品名、查重與追加規則；建立後會產生編號申請，關閉視窗不會寫入資料。</p></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="關閉建立編號"><X size={20} /></button>
        </div>
        <div className="number-state-mode-selector" role="radiogroup" aria-label="建立模式">
          {modeOptions.map((option) => (
            <button className={form.mode === option.value ? "is-active" : undefined} type="button" role="radio" aria-checked={form.mode === option.value} key={option.value} onClick={() => switchMode(option.value)}>
              <strong>{option.label}</strong><span>{option.description}</span>
            </button>
          ))}
        </div>
        <div className="number-state-form-grid">
          {form.mode === "new_bundle" ? (
            <>
              <SelectField
                label="品名類型"
                value={form.rootItemKind}
                onChange={(value) => {
                  const nextKind = value as ItemKind;
                  const processControlled = defaultProcessControlled(nextKind);
                  setForm({
                    ...form,
                    rootItemKind: nextKind,
                    partItemKind: nextKind,
                    isUniversal: false,
                    universalReason: "",
                    processControlled,
                    includeDrawing: defaultIncludeDrawing(nextKind),
                    seriesCode: nextKind === "manufactured" ? form.seriesCode : ""
                  });
                }}
                options={createItemKindOptions}
              />
              <div className="number-state-form-section" data-qc="numbering-name-guide">
                <h3>品名建議</h3>
                <div className="number-state-form-grid">
                  <Field label="核心名詞" hint={`${nameGuideFormula(form.rootItemKind)}；每段會以半形底線 _ 串接。`}><input value={form.nameCore} onChange={(event) => setForm({ ...form, nameCore: event.target.value })} maxLength={80} placeholder="例如：馬達、外殼、腳架" /></Field>
                  {form.rootItemKind === "purchased" ? <Field label="品牌（選填）" hint="品牌會影響採購、替代或品質時再填。"><input value={form.nameBrand} onChange={(event) => setForm({ ...form, nameBrand: event.target.value })} maxLength={80} placeholder="例如：東元" /></Field> : null}
                  <Field label={form.rootItemKind === "purchased" ? "規格 / 型號（選填）" : "特性（選填）"} hint={form.rootItemKind === "purchased" ? "盡量填可區分3D檔名的關鍵規格。" : "可填規格、型號、材質或用途，可用空白或底線分段。"}><input value={form.rootItemKind === "purchased" ? form.nameSpecification : form.nameFeature} onChange={(event) => form.rootItemKind === "purchased" ? setForm({ ...form, nameSpecification: event.target.value }) : setForm({ ...form, nameFeature: event.target.value })} maxLength={120} placeholder={form.rootItemKind === "purchased" ? "例如：1HP_4P_220VAC" : "例如：白鐵 100L"} /></Field>
                  {form.partItemKind === "manufactured" ? <SeriesCodeField label="系列代號（選填）" value={form.seriesCode} options={seriesCodeOptions} dataQc="root-series-code" onChange={(value) => setForm({ ...form, seriesCode: value })} /> : null}
                  {form.rootItemKind !== "purchased" ? <Field label="流水識別（選填）" hint="對應品名用的流水號，建議從 A 開始；不等於料號流水。"><input value={form.nameSerial} onChange={(event) => setForm({ ...form, nameSerial: event.target.value })} maxLength={40} placeholder="例如：A、B、01" /></Field> : null}
                  <label className="number-state-checkbox number-state-name-scope"><input type="checkbox" checked={form.sharedName} onChange={(event) => setForm({ ...form, sharedName: event.target.checked })} />跨專案共用</label>
                  <SuggestedNameReviewPanel
                    suggestedName={suggestedName}
                    duplicateResult={duplicateResult}
                    duplicateCheckState={duplicateCheckState}
                    duplicateCheckError={duplicateCheckError}
                    onApply={() => setForm({ ...form, coreName: suggestedName })}
                    onRetry={() => setDuplicateCheckRetry((value) => value + 1)}
                  />
                </div>
              </div>
              <Field label="確定品名" required hint="此欄位是唯一名稱來源；送出後系統會同步到料號主檔。品名不需唯一，唯一性由圖號 / 料號負責。"><input value={form.coreName} onChange={(event) => setForm({ ...form, coreName: event.target.value })} maxLength={300} /></Field>
            </>
          ) : (
            <><Field label="既有圖料根號" required hint="輸入使用者看得到的圖料根號，例如 A0001；系統會自動讀取圖料根號 ID。"><input value={form.sourceRootCode} onChange={(event) => setForm({ ...form, sourceRootCode: event.target.value.toUpperCase() })} maxLength={80} placeholder="例如：A0001" /></Field><AppendPolicyPanel policy={appendPolicy} state={appendPolicyState} rootCode={form.sourceRootCode} />{appendPolicy ? <Field label={`新增原因${appendPolicy.reasonRequired ? "" : "（選填）"}`} required={appendPolicy.reasonRequired} hint="追加圖料根號時請留下人類可讀的原因。"><input value={form.appendReason} onChange={(event) => setForm({ ...form, appendReason: event.target.value })} maxLength={1000} placeholder="例如：同一圖料根號新增第二款料件或補參考圖" /></Field> : null}</>
          )}
          {includesPart ? (
            <div className="number-state-form-section">
              <h3>料號</h3>
              <div className="number-state-form-grid">
                <div className="number-state-draft-summary is-fixed">
                  <PackagePlus size={17} />
                  <div>
                    <span>固定建立</span>
                    <strong>1 個料號</strong>
                    <small data-qc="part-number-preview">編號預覽：{previewText(visiblePreviewState, visiblePartPreview)}</small>
                    <small data-qc="number-preview-note">預覽不建立編號；送出申請後才會建立。</small>
                  </div>
                </div>
                {showPartKindSelector ? (
                  <SelectField
                    label="料件類型"
                    value={form.partItemKind === "purchased" && form.isUniversal && form.universalReason === "standard_part" ? "standard" : form.partItemKind}
                    onChange={(value) => {
                      const standard = value === "standard";
                      const nextKind = (standard ? "purchased" : value) as ItemKind;
                      setForm({
                        ...form,
                        partItemKind: nextKind,
                        isUniversal: standard,
                        universalReason: standard ? "standard_part" : "",
                        sourceDrawingNumberId: nextKind === "manufactured" && !standard ? form.sourceDrawingNumberId : "",
                        seriesCode: nextKind === "manufactured" ? form.seriesCode : ""
                      });
                    }}
                    options={appendPartKindOptions}
                  />
                ) : null}
                {form.mode === "append_part" && form.partItemKind === "manufactured" && !form.isUniversal ? (
                  <SelectField
                    label="自製件製造圖關聯"
                    value={form.sourceDrawingNumberId}
                    onChange={(value) => setForm({ ...form, sourceDrawingNumberId: value })}
                    options={[
                      { value: "", label: "請選擇正式製造圖" },
                      ...(appendPolicy?.drawings ?? [])
                        .filter((drawing) => drawing.purposeCode === "M" && !["Obsolete", "Merged"].includes(drawing.recordStatus))
                        .map((drawing) => ({ value: drawing.id, label: drawing.drawingNumber }))
                    ]}
                  />
                ) : null}
                {showPartCustomSpecification ? (
                  <Field label="客製規格" required>
                    <textarea value={form.customSpecification} onChange={(event) => setForm({ ...form, customSpecification: event.target.value })} maxLength={2000} rows={3} />
                  </Field>
                ) : null}
              </div>
            </div>
          ) : null}
          {showDrawingDraftSection ? (
            <div className="number-state-form-section">
              <div className="number-state-section-heading">
                <h3>圖號</h3>
                {canToggleDrawingDraft ? (
                  <label className={`number-state-section-toggle${effectiveIncludeDrawing ? " is-on" : ""}`}>
                    <input type="checkbox" checked={effectiveIncludeDrawing} onChange={(event) => setForm({ ...form, includeDrawing: event.target.checked })} aria-label="包含圖號" />
                    <span className="number-state-switch" aria-hidden="true"><span /></span>
                    <strong>包含圖號</strong>
                  </label>
                ) : null}
              </div>
              <div className="number-state-form-grid">
                <div className={`number-state-draft-summary${includesDrawing ? " is-fixed" : " is-muted"}`} data-qc={manufacturedPartMustIncludeDrawing ? "manufactured-fixed-drawing-draft" : undefined}>
                  <FileText size={17} />
                  <div>
                    <span>{includesDrawing ? (canToggleDrawingDraft ? "同時建立" : "固定建立") : "本次不建立"}</span>
                    <strong>{includesDrawing ? "圖號" : "未建立圖號"}</strong>
                    <small data-qc="drawing-number-preview">{includesDrawing ? `編號預覽：${previewText(visiblePreviewState, visibleDrawingPreview)}` : drawingHint}</small>
                  </div>
                </div>
                {includesDrawing ? (
                  <>
                    <SelectField
                      label="圖面用途"
                      value={form.purposeCode}
                      onChange={(value) => {
                        const purposeCode = value as PurposeCode;
                        setForm({ ...form, purposeCode, purposeDescription: isManufacturingPurposeCode(purposeCode) ? "" : form.purposeDescription });
                      }}
                      options={purposeOptions}
                    />
                    {form.purposeCode === "R" ? (
                      <Field label="參考用途" required hint="請說明此圖作為參考的用途；R 圖不作製造基準。">
                        <input value={form.purposeDescription} onChange={(event) => setForm({ ...form, purposeDescription: event.target.value })} maxLength={1000} placeholder="例如：安裝參考或尺寸參考" />
                      </Field>
                    ) : null}
                    <div className="number-state-inline-note">
                      <FileText size={16} />
                      <span>{relationLinkType === "primary_manufacturing" ? "圖料關聯會建立為製造基準。" : "圖料關聯會建立為參考，不會誤設為製造基準。"}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {error ? <div className="number-state-form-error" role="alert"><AlertTriangle size={17} />{error}</div> : null}
        <div className="number-state-modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || duplicateCheckState === "checking" || appendPolicyState === "loading" || Boolean(appendPolicy?.locked)}><Save size={16} />{busy ? "建立中..." : duplicateCheckState === "checking" ? "正在查重..." : appendPolicyState === "loading" ? "正在讀取圖料根號..." : "建立編號申請"}</button></div>
      </section>
    </div>
  );
}

function SuggestedNameReviewPanel({
  suggestedName,
  duplicateResult,
  duplicateCheckState,
  duplicateCheckError,
  onApply,
  onRetry
}: {
  suggestedName: string;
  duplicateResult: DuplicateResult | null;
  duplicateCheckState: DuplicateCheckState;
  duplicateCheckError: string;
  onApply: () => void;
  onRetry: () => void;
}) {
  const result = duplicateResult;
  const state = duplicateCheckState;
  const hasSuggestion = Boolean(suggestedName);
  const hasSimilarityWarning = Boolean(result && (result.blocked || result.warningsOnly));
  const panelClass = [
    "number-state-check-panel",
    "number-state-suggestion-review",
    hasSimilarityWarning ? "is-warning" : state === "error" ? "is-error" : result ? "is-ready" : ""
  ].filter(Boolean).join(" ");

  const statusIcon = state === "checking"
    ? <RefreshCcw size={14} />
    : state === "error"
      ? <AlertTriangle size={14} />
      : hasSimilarityWarning
        ? <AlertTriangle size={14} />
        : result
          ? <Check size={14} />
          : <Search size={14} />;

  const statusContent = (() => {
    if (!hasSuggestion) return <span>輸入至少兩個字後自動查重。</span>;
    if (state === "checking") return <span>正在檢查相似品名...</span>;
    if (state === "error" || !result) {
      return <><span>{duplicateCheckError || "查重暫時失敗。請稍後重試。"}</span><button type="button" onClick={onRetry}>重新查重</button></>;
    }
    return (
      <>
        <span data-qc={hasSimilarityWarning ? "duplicate-warning-only" : undefined}>
          {result.matches.length === 0 ? "未找到相同或高相似資料，可以繼續建立新圖料根號。" : `找到 ${result.matches.length} 筆相似資料，建議先確認是否沿用既有圖料根號；確認是新主題仍可繼續建立草稿。`}
        </span>
        {result.matches.length > 0 ? (
          <details>
            <summary>查看相似資料</summary>
            <ul>{result.matches.slice(0, 5).map((match) => <li key={`${match.entityType}:${match.entityId}`}>{match.severity === "blocker" ? "高度相似" : "注意"} · {match.displayCode} · {match.displayName} · {match.score}</li>)}</ul>
          </details>
        ) : null}
      </>
    );
  })();

  return (
    <div className={panelClass} data-qc="suggested-part-name" role={state === "error" ? "alert" : undefined}>
      {statusIcon}
      <div>
        <div className="number-state-suggestion-review-header">
          <strong>{suggestedName || "先輸入核心名詞產生建議品名"}</strong>
          <button type="button" disabled={!suggestedName} onClick={onApply}>套用建議品名</button>
        </div>
        <div className="number-state-suggestion-review-status" data-qc="suggested-duplicate-check" aria-live="polite">
          {statusContent}
        </div>
      </div>
    </div>
  );
}

function AppendPolicyPanel({ policy, state, rootCode }: { policy: AppendPolicy | null; state: "idle" | "loading" | "ready" | "error"; rootCode: string }) {
  if (state === "idle") return <div className="number-state-check-panel"><Search size={16} /><span>輸入圖料根號後會顯示名稱與下一號預覽。</span></div>;
  if (state === "loading") return <div className="number-state-check-panel" aria-live="polite"><RefreshCcw size={16} /><span>正在讀取圖料根號資料...</span></div>;
  if (state === "error" || !policy) return <div className="number-state-check-panel is-error" role="alert"><AlertTriangle size={16} /><span>找不到圖料根號 {rootCode || ""}，請確認後重試。</span></div>;
  return (
    <div className={`number-state-check-panel${policy.locked ? " is-blocked" : " is-ready"}`}>
      {policy.locked ? <AlertTriangle size={16} /> : <Check size={16} />}
      <div>
        <strong>{policy.root.rootCode} · {policy.root.coreName}</strong>
        <span>下一料號 {policy.nextNumbers.part} · 製造圖 {policy.nextNumbers.drawingM} · 參考圖 {policy.nextNumbers.drawingR}</span>
        <small>{policy.locked ? "此圖料根號已關閉，不能追加。" : policy.reasonRequired ? "此圖料根號已有已發布資料，新增原因必填。" : "可追加；新增原因選填。"}</small>
      </div>
    </div>
  );
}

export function WorkspaceDrawer({
  workspace,
  busy,
  editing,
  onEdit,
  onCancelEdit,
  onUpdate,
  onSubmit,
  onWithdraw,
  onPublish,
  onCancel,
  formalActionsUnopened,
  unopenedMessage,
  canCreateDrawingRevision,
  lifecycleV2Enabled,
  onV2WorkspaceChange,
  onV2Error,
  onV2Notice,
  seriesCodeOptions,
  width,
  onStartResize,
  keepOpenSelector,
  presentation,
  overview,
  onClose
}: {
  workspace: NumberingDraftWorkspace;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (payload: Record<string, unknown>) => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onPublish: () => void;
  onCancel: () => void;
  formalActionsUnopened: boolean;
  unopenedMessage: string;
  canCreateDrawingRevision: boolean;
  lifecycleV2Enabled: boolean;
  onV2WorkspaceChange: (workspace: CandidateRevisionWorkspace) => void;
  onV2Error: (message: string) => void;
  onV2Notice: (message: string) => void;
  seriesCodeOptions: string[];
  width: number;
  onStartResize: (clientX: number) => void;
  keepOpenSelector?: string;
  presentation?: {
    entityLabel: string;
    title: string;
    sourceContext: string;
    cancelLabel: string;
    cancelTitle: string;
  };
  overview?: ReactNode;
  onClose: () => void;
}) {
  const drawingCode = getPrimaryReservedDrawingCode(workspace);
  const entityLabel = presentation?.entityLabel ?? "圖號";
  const entityTitle = presentation?.title ?? drawingCode ?? "尚未產生圖號";
  const primaryAction = workspaceHeaderPrimaryAction({ workspace, busy, editing, lifecycleV2Enabled, formalActionsUnopened, unopenedMessage, onEdit, onSubmit, onPublish });
  return (
    <DrawingWorkspaceDrawer
      open
      width={width}
      ariaLabel={`${entityLabel}明細`}
      eyebrow={entityLabel}
      title={entityTitle}
      subtitle={workspaceTitle(workspace)}
      status={<WorkspaceHeaderStatus workspace={workspace} lifecycleV2Enabled={lifecycleV2Enabled} />}
      primaryAction={primaryAction}
      entityType="candidate_bundle"
      entityCode={workspace.id}
      sourceContext={presentation?.sourceContext ?? "number_state_workspace"}
      className="number-state-workspace-drawer"
      bodyClassName="number-state-drawer-body"
      resizeLabel={`調整${entityLabel}明細寬度`}
      resizeTitle={`拖曳調整${entityLabel}明細寬度`}
      closeLabel={`關閉${entityLabel}明細`}
      onClose={onClose}
      onStartResize={onStartResize}
      keepOpenSelector={keepOpenSelector}
      overviewLabel={`${entityLabel}摘要`}
      moreLabel={`更多${entityLabel}資料`}
      content={{
        overview: overview ?? <CandidateDrawingOverview workspace={workspace} />,
        body: <>
          <ReviewFeedbackPanel workspace={workspace} />
          <div id="candidate-revision-files" className="drawing-detail-section" data-drawing-detail-section="drawing-revision-files">
            {lifecycleV2Enabled && workspace.lifecycleV2 ? (
              !["official_controlled", "history_only"].includes(workspace.lifecycleV2.stage) ? (
                <NumberingCandidateRevisionEditor
                  workspace={workspace}
                  primaryDrawingCode={drawingCode}
                  disabled={busy || formalActionsUnopened || workspace.lifecycleV2.stage === "in_review" || workspace.lifecycleV2.stage === "auto_finalizing" || workspace.lifecycleV2.stage === "recovery_required"}
                  onWorkspaceChange={onV2WorkspaceChange}
                  onError={onV2Error}
                  onNotice={onV2Notice}
                />
              ) : <section className="number-state-drawer-section"><div className="number-state-section-heading"><h3>首版圖面／版次檔案</h3></div><p className="number-state-revision-message">{workspace.lifecycleV2.stage === "official_controlled" ? "首版已建立，可由圖號查看版次檔案。" : "此案只保留歷史紀錄。"}</p></section>
            ) : <RevisionPreparationPanel
              workspace={workspace}
              canCreateDrawingRevision={canCreateDrawingRevision}
              formalActionsUnopened={formalActionsUnopened}
            />}
          </div>
          <CandidateDrawingPreview workspace={workspace} />
        </>,
        pending: lifecycleV2Enabled && workspace.lifecycleV2
        ? shouldRenderLifecycleV2Pending(projectNumberLifecycleUserView(workspace.lifecycleV2).stage)
          ? <LifecycleV2PendingPanel workspace={workspace} formalActionsUnopened={formalActionsUnopened} unopenedMessage={unopenedMessage} />
          : null
        : <NowWhatPanel workspace={workspace} busy={busy} onSubmit={onSubmit} onPublish={onPublish} formalActionsUnopened={formalActionsUnopened} unopenedMessage={unopenedMessage} showAction={false} />,
        more: <>
            {editing
              ? <WorkspaceEditForm workspace={workspace} busy={busy} seriesCodeOptions={seriesCodeOptions} onCancel={onCancelEdit} onSave={onUpdate} />
              : <WorkspaceRelationsDetails workspace={workspace} primaryDrawingCode={drawingCode} />}
            <div className="number-state-future-actions">
              {workspace.capabilities.canUpdate && !editing ? <button className="secondary-button" type="button" onClick={onEdit}><Pencil size={15} />編輯資料</button> : null}
              {!lifecycleAdoptionHidden(workspace) && workspace.capabilities.canWithdrawReview ? formalActionsUnopened ? <UnopenedAction label="撤回審核" reason={unopenedMessage}><RotateCcw size={15} /></UnopenedAction> : <button className="secondary-button" type="button" onClick={onWithdraw} disabled={busy}><RotateCcw size={15} />撤回審核</button> : null}
              {!lifecycleAdoptionHidden(workspace) && workspace.latestApproval?.status === "apply_failed" ? <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><RefreshCcw size={15} />重試審核套用</Link> : null}
              {workspace.capabilities.canCancel ? (
                <button className="danger-button" type="button" disabled={busy} title={presentation?.cancelTitle ?? "取消圖號申請"} onClick={onCancel}><Ban size={16} />{presentation?.cancelLabel ?? "取消圖號申請"}</button>
              ) : null}
            </div>
          </>,
        bodyTitle: "圖面與附件",
        bodyLabel: "圖面與附件",
        pendingTitle: "下一步",
        pendingLabel: "下一步",
        moreTitle: "更多"
      }}
    />
  );
}

function WorkspaceHeaderStatus({ workspace, lifecycleV2Enabled }: { workspace: NumberingDraftWorkspace; lifecycleV2Enabled: boolean }) {
  if (lifecycleV2Enabled && workspace.lifecycleV2) {
    const lifecycle = projectNumberLifecycleUserView(workspace.lifecycleV2);
    return <span className={`number-state-badge lifecycle-v2-${lifecycle.stage}`}>{lifecycleV2Label(lifecycle.stage)}</span>;
  }
  return <LifecycleBadge lifecycle={workspace.projection.lifecycle} />;
}

function workspaceHeaderPrimaryAction({
  workspace,
  busy,
  editing,
  lifecycleV2Enabled,
  formalActionsUnopened,
  unopenedMessage,
  onEdit,
  onSubmit,
  onPublish
}: {
  workspace: NumberingDraftWorkspace;
  busy: boolean;
  editing: boolean;
  lifecycleV2Enabled: boolean;
  formalActionsUnopened: boolean;
  unopenedMessage: string;
  onEdit: () => void;
  onSubmit: () => void;
  onPublish: () => void;
}) {
  if (lifecycleV2Enabled && workspace.lifecycleV2) {
    const lifecycle = projectNumberLifecycleUserView(workspace.lifecycleV2);
    const requestId = bundleRequestId(workspace);
    if (lifecycle.stage === "drawing_preparation" || lifecycle.stage === "drawing_addendum_required") {
      return null;
    }
    if (lifecycle.stage === "bundle_ready") {
      return formalActionsUnopened
        ? <UnopenedAction label="送交審核" reason={unopenedMessage}><LockKeyhole size={15} /></UnopenedAction>
        : <button className="primary-button" data-primary-action="submit-bundle-review" type="button" onClick={onSubmit} disabled={busy}><LockKeyhole size={15} />送交審核</button>;
    }
    if (lifecycle.stage === "in_review" && requestId) {
      return formalActionsUnopened
        ? <UnopenedAction label="查看審核" reason={unopenedMessage}><FileText size={15} /></UnopenedAction>
        : <Link className="primary-button" data-primary-action="view-review" href={`/approvals?requestId=${encodeURIComponent(requestId)}`}><FileText size={15} />查看審核</Link>;
    }
    if (lifecycle.stage === "official_controlled") {
      const formalDrawingId = workspace.candidateRevisions.find((candidate) => candidate.formalDrawingNumberId)?.formalDrawingNumberId;
      return <Link className="primary-button" data-primary-action="view-formal-drawing" href={formalDrawingId ? `/numbering/drawings?detail=${encodeURIComponent(formalDrawingId)}` : "/numbering/drawings"}><FileText size={15} />查看圖面</Link>;
    }
    if (lifecycle.stage === "recovery_required" && requestId) {
      return <Link className="primary-button" data-primary-action="retry-formalization" href={`/approvals?requestId=${encodeURIComponent(requestId)}`}><RefreshCcw size={15} />查看處理狀態</Link>;
    }
    return null;
  }
  if (workspace.capabilities.canSubmitReview) {
    return formalActionsUnopened
      ? <UnopenedAction label="送交審核" reason={unopenedMessage}><LockKeyhole size={15} /></UnopenedAction>
      : <button className="primary-button" type="button" onClick={onSubmit} disabled={busy}><LockKeyhole size={15} />送交審核</button>;
  }
  if (workspace.capabilities.canPublish) {
    return formalActionsUnopened
      ? <UnopenedAction label="發布" reason={unopenedMessage}><Check size={15} /></UnopenedAction>
      : <button className="primary-button" type="button" onClick={onPublish} disabled={busy}><Check size={15} />發布</button>;
  }
  if (workspace.latestApproval?.requestId) {
    return formalActionsUnopened
      ? <UnopenedAction label="查看審核" reason={unopenedMessage}><FileText size={15} /></UnopenedAction>
      : <Link className="primary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><FileText size={15} />查看審核</Link>;
  }
  if (workspace.capabilities.canUpdate && !editing) return <button className="primary-button" type="button" onClick={onEdit}><Pencil size={15} />編輯資料</button>;
  return null;
}

function CandidateDrawingOverview({ workspace }: { workspace: NumberingDraftWorkspace }) {
  const purpose = [...new Set(workspace.drawings.map((drawing) => purposeLabel(drawing.purposeCode)))].join("、") || "尚未設定";
  return (
    <NumberingSubmissionResult
      mode="author"
      showCandidates={false}
      heading="建立結果"
      subtitle="目前工作區資料"
      facts={[
        { label: "用途", value: purpose },
        { label: "關聯", value: workspace.parts.length > 0 ? `${workspace.parts.length} 個料號` : "尚未關聯" },
        { label: "內容", value: `${workspace.drawings.length} 圖號 · ${workspace.parts.length} 料號` },
        { label: "使用條件", value: workspace.projection.numberQualification === "candidate" ? "編號仍在申請流程，發布前不能使用" : "可依目前狀態使用" }
      ]}
    />
  );
}

function ReviewFeedbackPanel({ workspace }: { workspace: NumberingDraftWorkspace }) {
  const feedback = workspace.latestReviewFeedback;
  if (!feedback || !["needs_info", "rejected"].includes(feedback.status) || !feedback.comment?.trim()) return null;
  const rejected = feedback.status === "rejected";
  return (
    <section className={`number-state-review-feedback${rejected ? " is-rejected" : ""}`} aria-label={rejected ? "審核退回原因" : "審核要求補充資料"}>
      <span>{rejected ? "審核退回原因" : "審核要求補充資料"}</span>
      <strong>{feedback.comment}</strong>
      <small>請依此意見修正後，再送交審核。</small>
    </section>
  );
}

function CandidateDrawingPreview({ workspace }: { workspace: NumberingDraftWorkspace }) {
  const activeFiles = workspace.candidateRevisions.flatMap((candidate) => candidate.files.filter((file) => !file.removedAt).map((file) => ({ candidate, file })));
  const threeD = activeFiles.find((entry) => entry.file.role === "cad_3d");
  const twoD = activeFiles.find((entry) => ["drawing_2d", "pdf", "dwg_dxf"].includes(entry.file.role));
  const previewMedia = (entry: typeof threeD) => entry ? {
    href: `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(entry.candidate.id)}/files/${encodeURIComponent(entry.file.id)}?preview=1`,
    mode: entry.file.role === "cad_3d" ? "image" as const : "document" as const,
    title: `${entry.file.displayName || "圖面附件"} 預覽`,
    alt: `${entry.file.displayName || "圖面附件"} 預覽`
  } : undefined;
  return (
    <DrawingDetailPreview
      className="number-state-drawer-section candidate-drawing-preview"
      cards={[
        {
          kind: "three-d",
          title: "3D 模型",
          fileName: threeD?.file.displayName,
          state: threeD ? "ready" : "missing",
          stateTitle: threeD ? "檔案預覽" : "尚無 3D 檔案",
          stateText: threeD ? "檔案與工作區同步；預覽完成後會直接顯示。" : "加入 3D 檔案後，預覽會顯示在這裡。",
          media: previewMedia(threeD)
        },
        {
          kind: "two-d",
          title: "2D 圖面",
          fileName: twoD?.file.displayName,
          state: twoD ? "ready" : "missing",
          stateTitle: twoD ? "檔案預覽" : "尚無 2D 檔案",
          stateText: twoD ? "檔案與工作區同步；預覽完成後會直接顯示。" : "加入 2D 檔案後，預覽會顯示在這裡。",
          media: previewMedia(twoD)
        }
      ]}
    />
  );
}

function shouldRenderLifecycleV2Pending(stage: NonNullable<NumberingDraftWorkspace["lifecycleV2"]>["stage"]) {
  return !["drawing_preparation", "drawing_addendum_required", "bundle_ready"].includes(stage);
}

function LifecycleV2PendingPanel({ workspace, formalActionsUnopened, unopenedMessage }: { workspace: NumberingDraftWorkspace; formalActionsUnopened: boolean; unopenedMessage: string }) {
  const stage = projectNumberLifecycleUserView(workspace.lifecycleV2!).stage;
  const content = ({
    drawing_preparation: { title: "補齊首版檔案", detail: "在上方加入主要受控檔並完成驗證。" },
    bundle_ready: { title: "送交審核", detail: "圖料號、關係與首版檔案已齊。" },
    in_review: { title: "等待審核", detail: "送審者可撤回後補正。" },
    auto_finalizing: { title: "不用操作", detail: "系統正在建立已發布資料。" },
    official_controlled: { title: "不用再處理", detail: "圖料號已建立。" },
    drawing_addendum_required: { title: "補齊首版圖面", detail: "完成主要受控檔驗證後即可繼續。" },
    recovery_required: { title: "查看處理狀態", detail: "請由 PDM Admin 依原審核紀錄重試。" },
    history_only: { title: "不用再處理", detail: "此案只供歷史查閱。" }
  } as const)[stage];
  const blocked = formalActionsUnopened && ["drawing_preparation", "bundle_ready", "drawing_addendum_required"].includes(stage);
  return <section className="number-state-now-what"><div><span>下一步</span><strong>{blocked ? "此階段尚未開放" : content.title}</strong><small>{blocked ? unopenedMessage : content.detail}</small></div></section>;
}

function NowWhatPanel({ workspace, busy, onSubmit, onPublish, formalActionsUnopened, unopenedMessage, showAction = true }: { workspace: NumberingDraftWorkspace; busy: boolean; onSubmit: () => void; onPublish: () => void; formalActionsUnopened: boolean; unopenedMessage: string; showAction?: boolean }) {
  const action = workspace.capabilities.canSubmitReview
    ? formalActionsUnopened
      ? <UnopenedAction label="送交審核" reason={unopenedMessage}><LockKeyhole size={15} /></UnopenedAction>
      : <button className="primary-button" type="button" onClick={onSubmit} disabled={busy}><LockKeyhole size={15} />送交審核</button>
    : workspace.capabilities.canPublish
      ? formalActionsUnopened
        ? <UnopenedAction label="發布" reason={unopenedMessage}><Check size={15} /></UnopenedAction>
        : <button className="primary-button" type="button" onClick={onPublish} disabled={busy}><Check size={15} />發布</button>
      : workspace.latestApproval?.requestId
        ? formalActionsUnopened
          ? <UnopenedAction label="查看審核" reason={unopenedMessage}><FileText size={15} /></UnopenedAction>
          : <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><FileText size={15} />查看審核</Link>
        : null;
  return (
    <section className="number-state-now-what"><div><span>下一步</span><strong>{formalActionsUnopened && (workspace.capabilities.canSubmitReview || workspace.capabilities.canPublish) ? "此階段尚未開放" : nowWhatLabel(workspace.projection.nowWhat.label)}</strong><small>{formalActionsUnopened && (workspace.capabilities.canSubmitReview || workspace.capabilities.canPublish) ? unopenedMessage : `責任角色：${ownerRoleLabel(workspace.projection.nowWhat.ownerRole)}`}</small></div>{showAction ? action : null}</section>
  );
}

function UnopenedAction({ label, reason, children }: { label: string; reason: string; children: ReactNode }) {
  return <button className="secondary-button production-slice-unopened" type="button" aria-disabled="true" data-production-slice-unopened="true" title={`未開放：${reason}`} onClick={(event) => event.preventDefault()}>{children}{label}<span className="nav-unopened-badge">未開放</span></button>;
}

function WorkspaceRelationsDetails({ workspace, primaryDrawingCode }: { workspace: NumberingDraftWorkspace; primaryDrawingCode: string | null }) {
  const additionalDrawings = workspace.drawings.filter((drawing) => drawing.candidateCode !== primaryDrawingCode);
  return (
    <details className="drawing-workbench-secondary-section candidate-drawing-relations">
      <summary><span>圖號與關聯</span><strong>{workspace.parts.length + additionalDrawings.length} 筆</strong></summary>
      <div className="number-state-item-list">{workspace.root ? <DraftItem icon={<PackagePlus size={16} />} title="圖料根號" subtitle={`${itemKindLabel(workspace.root.itemKind)} · ${draftNumberLabel(workspace, workspace.root.candidateCode)}`} /> : null}{workspace.parts.map((part) => <DraftItem key={part.id} icon={<PackagePlus size={16} />} title={part.candidateCode ?? "尚未產生料號"} subtitle={`${itemKindLabel(part.itemKind)}${part.seriesCode ? ` · 系列 ${part.seriesCode}` : ""}`} />)}{additionalDrawings.map((drawing) => <DraftItem key={drawing.id} icon={<FileText size={16} />} title={drawing.candidateCode ?? "尚未產生圖號"} subtitle={purposeLabel(drawing.purposeCode)} />)}</div>
    </details>
  );
}

function lifecycleV2Label(stage: NonNullable<NumberingDraftWorkspace["lifecycleV2"]>["stage"]) {
  return ({
    drawing_preparation: "準備首版",
    bundle_ready: "整包可送審",
    in_review: "整包審核中",
    auto_finalizing: "系統發布中",
    official_controlled: "圖料號已建立",
    drawing_addendum_required: "需補齊首版圖面",
    recovery_required: "需要管理者處理",
    history_only: "歷史紀錄"
  } as const)[stage];
}

function LifecycleV2Badge({ workspace }: { workspace: NumberingDraftWorkspace }) {
  if (!workspace.lifecycleV2) return null;
  const lifecycle = projectNumberLifecycleUserView(workspace.lifecycleV2);
  const readyCandidates = workspace.candidateRevisions.filter((candidate) => candidate.files.some((file) => !file.removedAt && file.isPrimary && file.publicationEvidenceId)).length;
  return <div className="pdm-meta-strip"><span className={`number-state-badge lifecycle-v2-${lifecycle.stage}`}>{lifecycleV2Label(lifecycle.stage)}</span><span className="muted-text">首版 {readyCandidates}/{workspace.drawings.length}</span></div>;
}

function bundleRequestId(workspace: NumberingDraftWorkspace) {
  return workspace.candidateRevisions.find((candidate) => candidate.approvalRequestId)?.approvalRequestId ?? workspace.latestApproval?.requestId ?? null;
}

function RevisionPreparationPanel({
  workspace,
  canCreateDrawingRevision,
  formalActionsUnopened
}: {
  workspace: NumberingDraftWorkspace;
  canCreateDrawingRevision: boolean;
  formalActionsUnopened: boolean;
}) {
  const drawingNumber = getPrimaryReservedDrawingCode(workspace);
  const [retryKey, setRetryKey] = useState(0);
  const [suggestion, setSuggestion] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    revision: string | null;
    message: string;
  }>({ status: "idle", revision: null, message: "" });

  useEffect(() => {
    if (!drawingNumber || workspace.lifecycleStatus === "cancelled") {
      setSuggestion({ status: "idle", revision: null, message: "" });
      return;
    }

    const controller = new AbortController();
    setSuggestion({ status: "loading", revision: null, message: "" });
    void (async () => {
      try {
        const params = new URLSearchParams({ drawingNumber, workflowIntent: "rd_workspace" });
        const response = await fetch(`/api/submissions/revision-suggestion?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const body = await readApiBody<{
          suggestedRevision?: string;
          revisionPolicySuggestion?: { suggestedRevision?: string };
        }>(response);
        if (!response.ok) throw new Error(apiErrorMessage(response, body, "無法取得建議版次，請稍後重試。"));
        const revision = String(body.revisionPolicySuggestion?.suggestedRevision ?? body.suggestedRevision ?? "").trim();
        if (!revision) throw new Error("系統沒有回傳建議版次，請稍後重試。");
        setSuggestion({ status: "ready", revision, message: "" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestion({
          status: "error",
          revision: null,
          message: error instanceof Error ? error.message : "無法取得建議版次，請稍後重試。"
        });
      }
    })();

    return () => controller.abort();
  }, [drawingNumber, retryKey, workspace.lifecycleStatus]);

  const officialDrawingAvailable = Boolean(
    drawingNumber &&
      workspace.lifecycleStatus === "published" &&
      workspace.reservations.some(
        (reservation) => reservation.itemType === "drawing" && reservation.state === "promoted" && reservation.candidateCode === drawingNumber
      )
  );
  const canOpenRevisionWorkbench = officialDrawingAvailable && canCreateDrawingRevision && !formalActionsUnopened;

  return (
    <section className="number-state-drawer-section number-state-revision-preparation" data-revision-preparation-state={suggestion.status}>
      <div className="number-state-section-heading">
        <h3>首版圖面／版次檔案</h3>
        {drawingNumber ? <span className="number-state-revision-drawing">{drawingNumber}</span> : null}
      </div>
      {!drawingNumber ? (
        <p className="number-state-revision-message">尚未有圖號，先建立圖號。</p>
      ) : workspace.lifecycleStatus === "cancelled" ? (
        <p className="number-state-revision-message">此編號申請已取消，不建立圖面版次。</p>
      ) : (
        <>
          <div className="number-state-revision-summary">
            <span>建議研發版次</span>
            <strong>{suggestion.status === "ready" ? suggestion.revision : suggestion.status === "error" ? "暫時無法取得" : "計算中"}</strong>
          </div>
          {suggestion.status === "error" ? (
            <div className="number-state-revision-recovery" role="status">
              <span>{suggestion.message}</span>
              <button className="secondary-button" type="button" onClick={() => setRetryKey((value) => value + 1)}>
                <RefreshCcw size={15} />重新取得
              </button>
            </div>
          ) : (
            <p className="number-state-revision-message">尚未建立版次；建立首版圖面時可確認或調整。</p>
          )}
          <div className="number-state-revision-actions">
            {canOpenRevisionWorkbench ? (
              <Link className="primary-button" href={buildFirstDrawingRevisionHref(workspace, drawingNumber)}>
                <FilePlus2 size={16} />建立首版圖面
              </Link>
            ) : (
              <button className="secondary-button" type="button" disabled aria-describedby={`revision-preparation-reason-${workspace.id}`}>
                <FilePlus2 size={16} />建立首版圖面
              </button>
            )}
            {!officialDrawingAvailable ? (
              <small id={`revision-preparation-reason-${workspace.id}`}>先完成編號申請審核與發布，再進入圖面進版工作台。</small>
            ) : formalActionsUnopened ? (
              <small id={`revision-preparation-reason-${workspace.id}`}>圖面進版尚未納入本次編號建立開放範圍。</small>
            ) : !canCreateDrawingRevision ? (
              <small id={`revision-preparation-reason-${workspace.id}`}>目前帳號沒有建立圖面進版送審的權限。</small>
            ) : (
              <small>圖號已建立；工作台會重新計算建議版次。</small>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function WorkspaceEditForm({ workspace, busy, seriesCodeOptions, onCancel, onSave }: { workspace: NumberingDraftWorkspace; busy: boolean; seriesCodeOptions: string[]; onCancel: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [root, setRoot] = useState(workspace.root ? { ...workspace.root } : null);
  const [parts, setParts] = useState(workspace.parts.map((part) => ({ ...part })));
  const [drawings, setDrawings] = useState(workspace.drawings.map((drawing) => ({ ...drawing })));
  return (
    <section className="number-state-drawer-section">
      <h3>編輯編號申請</h3>
      <div className="number-state-edit-list">
        {root ? <Field label="確定品名" hint="此欄位是唯一名稱來源；儲存時會同步到料號主檔。"><input value={root.coreName} onChange={(event) => setRoot({ ...root, coreName: event.target.value })} /></Field> : null}
        {parts.map((part, index) => {
          const showSeriesCode = part.itemKind === "manufactured" && !part.isUniversal;
          const showUniversalReason = part.isUniversal || part.itemKind === "shared";
          if (!showSeriesCode && !showUniversalReason) return null;
          return (
            <div className="number-state-edit-list" key={part.id}>
              {showSeriesCode ? <SeriesCodeField label={`系列代號 ${index + 1}（選填）`} value={part.seriesCode ?? ""} options={seriesCodeOptions} onChange={(value) => setParts((items) => items.map((item) => item.id === part.id ? { ...item, seriesCode: value } : item))} /> : null}
              {showUniversalReason ? <Field label={`共用原因 ${index + 1}`} required><input value={part.universalReason ?? ""} maxLength={1000} onChange={(event) => setParts((items) => items.map((item) => item.id === part.id ? { ...item, universalReason: event.target.value } : item))} /></Field> : null}
            </div>
          );
        })}
        {drawings.map((drawing, index) => drawing.purposeCode === "R" ? <Field label={`參考用途 ${index + 1}`} required hint="請說明此圖作為參考的用途；R 圖不作製造基準。" key={drawing.id}><input value={drawing.purposeDescription} onChange={(event) => setDrawings((items) => items.map((item) => item.id === drawing.id ? { ...item, purposeDescription: event.target.value } : item))} /></Field> : null)}
      </div>
      <div className="number-state-inline-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>取消編輯</button>
        <button className="primary-button" type="button" disabled={busy} onClick={() => onSave({
          root: root ? { id: root.id, coreName: root.coreName, itemKind: root.itemKind, ruleVersionId: root.ruleVersionId } : undefined,
          parts: parts.map((part) => ({
            id: part.id,
            partName: root?.coreName ?? part.partName,
            itemKind: part.itemKind,
            isUniversal: part.isUniversal,
            universalReason: (part.isUniversal || part.itemKind === "shared") ? part.universalReason : null,
            customSpecification: part.customSpecification,
            seriesCode: part.itemKind === "manufactured" && !part.isUniversal ? part.seriesCode : null
          })),
          drawings: drawings.map((drawing) => ({ id: drawing.id, purposeCode: drawing.purposeCode, purposeDescription: drawing.purposeCode === "R" ? drawing.purposeDescription : "", isPrimaryManufacturing: drawing.isPrimaryManufacturing }))
        })}><Save size={15} />儲存變更</button>
      </div>
    </section>
  );
}

export function ConfirmDialog({ action, workspace, busy, lifecycleV2Enabled = false, onClose, onConfirm }: { action: WorkspaceAction; workspace: NumberingDraftWorkspace; busy: boolean; lifecycleV2Enabled?: boolean; onClose: () => void; onConfirm: () => void }) {
  const content = ({
    cancel: {
      title: "取消編號申請",
      strong: "取消後編號申請不能再編輯",
      detail: candidateCodes(workspace).length > 0 ? `將停止處理 ${candidateCodes(workspace).join("、")}；有審核或外部引用時系統會阻擋。` : "此申請尚未產生編號，取消後不會繼續處理。",
      confirm: "確認取消編號申請",
      icon: <AlertTriangle size={22} />,
      danger: true
    },
    submit: {
      title: lifecycleV2Enabled ? "送交圖料與首版整包審核" : "送交發布審核",
      strong: lifecycleV2Enabled ? "送審後圖料號、關係、版次與檔案證據將一起鎖定" : "送審後申請與編號將鎖定",
      detail: lifecycleV2Enabled ? "核准後由系統建立圖料號與受控研發首版，不需要再按人工發布。" : "核准只代表允許發布，不會建立主檔；核准後仍需由具發布權限的人員執行發布。",
      confirm: lifecycleV2Enabled ? "確認整包送審" : "確認送交審核",
      icon: <LockKeyhole size={22} />,
      danger: false
    },
    withdraw: {
      title: lifecycleV2Enabled ? "撤回整包審核" : "撤回發布審核",
      strong: "撤回後核准流程將中止",
      detail: "編號會解除審核鎖定，申請可修改後再次送審。",
      confirm: "確認撤回審核",
      icon: <RotateCcw size={22} />,
      danger: false
    },
    publish: {
      title: "發布圖料號",
      strong: "此動作會建立主檔，無法由此畫面復原",
      detail: `將以已核准的編號建立圖料根號、${workspace.parts.length} 個料號與 ${workspace.drawings.length} 個圖號。核准本身尚未執行這個動作。`,
      confirm: "確認發布",
      icon: <AlertTriangle size={22} />,
      danger: true
    }
  } as const)[action];
  const dialogRef = useRef<HTMLElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  useOverlayLifecycle(dialogRef, onClose, busy);
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;

    // The detail drawer owns a document-level pointerdown listener. Stop the
    // event in native capture so a modal click cannot become an outside click
    // on the underlying drawer before React's delegated handler receives it.
    const stopUnderlyingDrawerPointer = (event: PointerEvent) => {
      event.stopPropagation();
    };
    const closeFromNativeClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-number-state-modal-close='true']") || busy) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    backdrop.addEventListener("pointerdown", stopUnderlyingDrawerPointer, true);
    backdrop.addEventListener("click", closeFromNativeClick, true);
    return () => {
      backdrop.removeEventListener("pointerdown", stopUnderlyingDrawerPointer, true);
      backdrop.removeEventListener("click", closeFromNativeClick, true);
    };
  }, [busy, onClose]);
  return (
    <div ref={backdropRef} className="number-state-modal-backdrop" role="presentation">
      <section ref={dialogRef} className="number-state-modal number-state-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="number-state-confirm-title">
        <div className="number-state-modal-header">
          <div><h2 id="number-state-confirm-title">{content.title}</h2><p>{workspaceTitle(workspace)}</p></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} data-number-state-modal-close="true" aria-label="關閉確認"><X size={20} /></button>
        </div>
        <div className={`number-state-confirm-summary${content.danger ? " is-danger" : ""}`}>{content.icon}<div><strong>{content.strong}</strong><p>{content.detail}</p></div></div>
        <div className="number-state-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy} data-number-state-modal-close="true" data-autofocus>返回檢查</button>
          <button className={content.danger ? "danger-button" : "primary-button"} type="button" onClick={onConfirm} disabled={busy}>{action === "cancel" ? <Ban size={16} /> : action === "withdraw" ? <RotateCcw size={16} /> : <Check size={16} />}{busy ? "處理中..." : content.confirm}</button>
        </div>
      </section>
    </div>
  );
}

function SeriesCodeField({
  label,
  value,
  options,
  onChange,
  dataQc
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  dataQc?: string;
}) {
  const listId = useId();
  return (
    <Field label={label} hint="可選既有系列代號或輸入新代號；儲存後會自動加入共用選項。">
      <input
        data-qc={dataQc}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={80}
        placeholder="例如：JF、100L、S1"
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((option) => <option value={option} key={option} />)}
      </datalist>
    </Field>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="number-state-field"><span>{label}{required ? <em>必填</em> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}

function DraftItem({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="number-state-item"><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div></div>;
}

function LifecycleBadge({ lifecycle }: { lifecycle: NumberStateProjection["lifecycle"] }) {
  return <span className={`number-state-badge lifecycle-${lifecycle}`}>{lifecycleLabel(lifecycle)}</span>;
}

function candidateCodes(workspace: NumberingDraftWorkspace) {
  return workspace.reservations.filter((reservation) => reservation.state !== "recycled").map((reservation) => reservation.candidateCode);
}

function workspaceMatchesModule(workspace: NumberingDraftWorkspace, module: NumberStateModule) {
  if (module === "drawings") return workspace.drawings.length > 0;
  if (module === "parts") return workspace.parts.length > 0;
  return workspace.parts.length > 0 || workspace.drawings.length > 0;
}

function candidateCodesForModule(workspace: NumberingDraftWorkspace, module: NumberStateModule) {
  return workspace.reservations
    .filter((reservation) => {
      if (reservation.state === "recycled" || reservation.itemType === "root") return false;
      if (module === "drawings") return reservation.itemType === "drawing";
      if (module === "parts") return reservation.itemType === "part";
      return reservation.itemType === "part" || reservation.itemType === "drawing";
    })
    .map((reservation) => reservation.candidateCode);
}

function moduleSearchValues(workspace: NumberingDraftWorkspace, module: NumberStateModule) {
  const partValues = workspace.parts.flatMap((part) => [part.partName, part.candidateCode]);
  const drawingValues = workspace.drawings.flatMap((drawing) => [drawing.purposeDescription, drawing.candidateCode]);
  if (module === "drawings") return drawingValues;
  if (module === "parts") return partValues;
  return [...partValues, ...drawingValues];
}

function moduleContentSummary(workspace: NumberingDraftWorkspace, module: NumberStateModule) {
  if (module === "drawings") return `${workspace.drawings.length} 圖號`;
  if (module === "parts") return `${workspace.parts.length} 料號`;
  return `${workspace.drawings.length} 圖號 · ${workspace.parts.length} 料號`;
}

function getReservedDrawingCandidates(workspace: NumberingDraftWorkspace): DraftDrawing[] {
  const activeDrawingIds = new Set(
    workspace.reservations
      .filter((reservation) => reservation.itemType === "drawing" && reservation.state !== "recycled")
      .map((reservation) => reservation.itemId)
  );
  return workspace.drawings.filter((drawing) => Boolean(drawing.candidateCode) && activeDrawingIds.has(drawing.id));
}

function getPrimaryReservedDrawingCode(workspace: NumberingDraftWorkspace): string | null {
  const drawings = getReservedDrawingCandidates(workspace);
  return drawings.find((drawing) => drawing.isPrimaryManufacturing)?.candidateCode ?? drawings[0]?.candidateCode ?? null;
}

function buildFirstDrawingRevisionHref(workspace: NumberingDraftWorkspace, drawingNumber: string): string {
  const params = new URLSearchParams({
    drawingNumber,
    workflowIntent: "rd_workspace",
    source: "number_state_workspace",
    workspaceId: workspace.id
  });
  return `/numbering/revisions?${params.toString()}`;
}

function draftNumberLabel(workspace: NumberingDraftWorkspace, candidateCode: string | null) {
  if (!candidateCode) return "尚未產生號碼";
  return workspace.lifecycleStatus === "cancelled" ? `歷史編號 ${candidateCode}` : candidateCode;
}

function workspaceTitle(workspace: NumberingDraftWorkspace) {
  return workspace.root?.coreName ?? workspace.parts[0]?.partName ?? workspace.drawings[0]?.purposeDescription ?? `編號申請 ${workspace.id.slice(-8)}`;
}

function createModeFromLocation(): DraftMode {
  if (typeof window === "undefined") return "new_bundle";
  const mode = new URLSearchParams(window.location.search).get("create") as DraftMode | null;
  return mode && modeOptions.some((option) => option.value === mode) ? mode : "new_bundle";
}

function sourceRootFromLocation() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("sourceRootCode") ?? params.get("sourceRootId") ?? "";
}

function recoveryHref(workspace: NumberingDraftWorkspace) {
  if (workspace.projection.nowWhat.href) return workspace.projection.nowWhat.href;
  return workspace.projection.nowWhat.blockedReason === "candidate_review_locked" ? "/approvals" : null;
}

function lifecycleAdoptionHidden(workspace: NumberingDraftWorkspace) {
  return workspace.lifecycleV2 ? isNumberLifecycleAdoptionHiddenFromUser(workspace.lifecycleV2) : false;
}

function draftModeLabel(value: DraftMode) { return ({ new_bundle: "新圖料", append_drawing: "新增圖號", append_part: "新增料號", append_drawing_part: "新增圖號與料號" } as const)[value]; }
function itemKindLabel(value: ItemKind) { return itemKindOptions.find((option) => option.value === value)?.label ?? value; }
function purposeLabel(value: PurposeCode) { return purposeOptions.find((option) => option.value === value)?.label ?? value; }
function isManufacturingPurposeCode(value: PurposeCode) { return value === "M" || value === "MA"; }
function lifecycleLabel(value: NumberStateProjection["lifecycle"]) { return ({ draft: "編輯中", cancelled: "已取消", published: "已發布", obsolete: "已失效" } as const)[value]; }
function ownerRoleLabel(value: string) { return ({ "Draft owner": "編號申請負責人", Approver: "審核者", Publisher: "發布者", PDM: "PDM 管理者", "PDM Admin": "PDM Admin" } as Record<string, string>)[value] ?? value; }
function nowWhatLabel(value: string) { return ({ "Acquire candidate numbers": "尚未產生編號", "Complete draft and submit review": "完成編號申請並送審", "View cancelled draft": "查看已取消編號申請", "View official record": "查看已發布資料", "Check state inconsistency": "請 PDM Admin 檢查狀態", "View review": "查看審核", "Retry approval apply": "重試核准套用", "Update requested information": "補齊審核要求的資料", "Revise draft before resubmission": "修訂編號申請後重新送審", "Publish official number": "發布編號" } as Record<string, string>)[value] ?? value; }
function publicationBlockerLabel(value: string | null) {
  if (value?.startsWith("drawing_evidence_not_finalized:")) return "至少一份圖面受控檔案證據尚未定稿。";
  return ({
    direct_gcs_verifier_unavailable: "GCS 檔案證據驗證器尚未啟用，圖面申請不可發布。",
    publication_evidence_not_ready: "發布所需證據尚未完成。",
    numbering_publish_permission_required: "目前帳號沒有發布權限。",
    candidate_approval_required: "編號尚未完成核准。",
    candidate_approval_lock_mismatch: "核准鎖定資料不一致，請由 PDM Admin 處理。",
    approval_snapshot_stale: "核准快照已過期，請重新送審。"
  } as Record<string, string>)[value ?? ""] ?? "目前狀態不可發布。";
}
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false }); }
