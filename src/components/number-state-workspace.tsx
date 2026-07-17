"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
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
import { StatusHelpPopover, StatusScopeHelp } from "@/components/status-help-popover";
import { formatStatusForUser } from "@/lib/status-display";

type DraftMode = "new_bundle" | "append_drawing" | "append_part" | "append_drawing_part";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type PurposeCode = "MA" | "OT" | "M" | "R";
type LifecycleStatus = "active" | "cancelled" | "published";
type NumberQualification = "unnumbered" | "candidate" | "official" | "legacy_official_reservation";
type NumberEffectivenessFilter = "all" | "not_generated" | "reserved" | "official";
type FeatureStatus = { enabled: boolean; flag: string; phase: string };
type ProductionSliceStatus = { configured: boolean; unopenedMessage?: string };
type WorkspaceAction = "cancel" | "submit" | "withdraw" | "publish";

const DEFAULT_PRODUCTION_SLICE_UNOPENED_MESSAGE = "此功能未納入本次正式領號 / 保留號 production slice。";

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

type NumberingDraftWorkspace = {
  id: string;
  companyId: string;
  draftMode: DraftMode;
  lifecycleStatus: LifecycleStatus;
  ownerId: string;
  sourceRootId: string | null;
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
  };
  projection: NumberStateProjection;
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
  { value: "manufactured", label: "自製" },
  { value: "purchased", label: "外購" },
  { value: "outsourced", label: "發包" },
  { value: "shared", label: "共用" },
  { value: "custom", label: "客製" }
];
const createItemKindOptions = itemKindOptions.filter((option) => option.value !== "shared");
const purposeOptions: Array<{ value: PurposeCode; label: string }> = [
  { value: "M", label: "製造圖 M" },
  { value: "R", label: "參考圖 R" }
];
const modeOptions: Array<{ value: DraftMode; label: string; description: string }> = [
  { value: "new_bundle", label: "建立新圖料", description: "建立新的品名主題，可同時準備料號與圖號。" },
  { value: "append_drawing", label: "既有主根加圖號", description: "在既有正式主根下新增圖號保留號。" },
  { value: "append_part", label: "既有主根加料號", description: "在既有正式主根下新增料號保留號。" },
  { value: "append_drawing_part", label: "既有主根加圖號與料號", description: "同一申請內建立相互關聯的圖號與料號保留號。" }
];

export type NumberStateCreateSurface = "parts" | "drawings" | "search" | "drafts" | "root-detail" | "global";
export type NumberStateModule = "search" | "drawings" | "parts";

type NumberStateModuleConfig = {
  title: string;
  officialLabel: string;
  officialHref: string;
  reservedHref: string;
  ariaLabel: string;
  createSurface: NumberStateCreateSurface;
};

const numberStateModuleConfigs: Record<NumberStateModule, NumberStateModuleConfig> = {
  search: {
    title: "圖料模組",
    officialLabel: "圖料總表",
    officialHref: "/numbering/search",
    reservedHref: "/numbering/search?tab=reserved",
    ariaLabel: "圖料模組分頁",
    createSurface: "search"
  },
  drawings: {
    title: "圖號模組",
    officialLabel: "圖號總表",
    officialHref: "/numbering/drawings",
    reservedHref: "/numbering/drawings?tab=reserved",
    ariaLabel: "圖號模組分頁",
    createSurface: "drawings"
  },
  parts: {
    title: "料號模組",
    officialLabel: "料號總表",
    officialHref: "/parts",
    reservedHref: "/parts?tab=drafts",
    ariaLabel: "料號模組分頁",
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
      label: "保留新圖號",
      title: "在目前主根保留新圖號",
      ariaLabel: "在目前主根保留新圖號",
      defaultMode: "append_drawing"
    };
  }
  if (hasRootContext && preferredMode === "append_part") {
    return {
      label: "保留新料號",
      title: "在目前主根保留新料號",
      ariaLabel: "在目前主根保留新料號",
      defaultMode: "append_part"
    };
  }
  if (hasRootContext && preferredMode === "append_drawing_part") {
    return {
      label: "保留新圖料號",
      title: "在目前主根保留相互關聯的圖號與料號",
      ariaLabel: "在目前主根保留新圖料號",
      defaultMode: "append_drawing_part"
    };
  }

  const defaultMode = surface === "root-detail" ? preferredMode : "new_bundle";
  return {
    label: "建立保留號",
    title: "建立後直接保留號碼，不會占用正式號碼",
    ariaLabel: "建立保留號",
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
  if (kind === "purchased") return "外購件建議：[核心名詞]_[品牌]_[規格/型號]";
  return "自製/發包/客製建議：[核心名詞]_[系列代號]_[特性]_[流水識別]";
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
  if (code === "feature_not_open_in_production_slice") return "此功能被正式領號 / 保留號 production slice 邊界封鎖，請通知管理員檢查 API allowlist。";
  if (response.status === 401) return "登入已失效，請重新登入後回到這筆保留號。";
  if (response.status === 403) return "目前帳號或公司沒有執行此動作的權限。";
  if (response.status === 404) return "找不到這筆保留號，或它不屬於目前公司。";
  if (code === "source_root_not_found") return "找不到這個主根號，請確認後重試。";
  if (code === "append_reason_required") return "此主根已有正式資料，請填寫新增原因。";
  if (code === "numbering_invalid_relation") return "圖料關聯不符合規則；參考圖不能設為製造基準。";
  if (response.status === 409 && code === "workspace_version_conflict") return "保留號內容已被更新，系統已重新載入最新內容，請確認後再操作。";
  if (code === "candidate_required_before_review") return "此申請尚未保留完整號碼，請重新建立申請或請 PDM Admin 協助。";
  if (code === "candidate_review_already_pending") return "這筆保留號已在審核中，請前往審核中心查看。";
  if (code === "candidate_review_not_pending") return "這筆保留號目前沒有可撤回的待審申請。";
  if (code === "review_withdraw_owner_required") return "只有申請負責人可以撤回待審申請。";
  if (code === "candidate_approval_required") return "保留號碼尚未完成核准，不能正式發布。";
  if (code === "candidate_approval_lock_mismatch") return "核准鎖定資料已不一致，請由 PDM Admin 檢查。";
  if (code === "approval_snapshot_stale") return "已核准快照與目前保留號內容不一致，請重新送審。";
  if (code === "publication_evidence_not_ready") return "圖面受控檔案證據尚未完成，不能正式發布。";
  if (code === "official_number_collision") return "正式號碼已存在；系統沒有自動改號，請由 PDM Admin 處理衝突。";
  if (code === "workspace_already_published") return "這筆保留號已經正式發布，系統不會重複建立正式資料。";
  if (response.status === 503 || code === "numbering_authority_unavailable") return "領號服務目前不可用。表單已保留，請稍後重試；不可改用離線或自行編號。";
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

export function NumberStateModuleTabs({ module, active }: { module: NumberStateModule; active: "official" | "reserved" }) {
  const feature = useFeatureStatus();
  const config = numberStateModuleConfigs[module];
  if (!feature?.enabled) return null;
  return (
    <nav className="number-state-tabs" aria-label={config.ariaLabel}>
      <a className={active === "official" ? "is-active" : undefined} href={config.officialHref} aria-current={active === "official" ? "page" : undefined}>
        {config.officialLabel}
      </a>
      <a className={active === "reserved" ? "is-active" : undefined} href={config.reservedHref} aria-current={active === "reserved" ? "page" : undefined}>
        保留號
      </a>
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
  hasRootContext = false
}: {
  label?: string;
  defaultMode?: DraftMode;
  sourceRootId?: string;
  surface?: NumberStateCreateSurface;
  hasRootContext?: boolean;
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
  const createTitle = actionPermissions === null ? "正在確認建立權限" : canCreate ? createCta.title : "未開放：目前帳號沒有建立保留號的權限";

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
          onClose={() => setOpen(false)}
          onCreated={(workspace) => {
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
  const [numberEffectiveness, setNumberEffectiveness] = useState<NumberEffectivenessFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const idempotencyKeys = useRef(new Map<string, string>());
  const initialQueryHandled = useRef(false);
  const createCta = getNumberStateCreateCta({ surface: moduleConfig.createSurface });
  const canCreate = actionPermissions?.["numbering.workspace.create"] === true;
  const createTitle = actionPermissions === null ? "正在確認建立權限" : canCreate ? createCta.title : "未開放：目前帳號沒有建立保留號的權限";
  const formalActionsUnopened = productionSlice?.configured === true;
  const formalActionsUnopenedMessage = productionSlice?.unopenedMessage ?? DEFAULT_PRODUCTION_SLICE_UNOPENED_MESSAGE;

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    if (!feature?.enabled) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ owner: ownerScope, limit: "100" });
    if (lifecycle !== "all") params.set("lifecycleStatus", lifecycle);
    const response = await fetch(`/api/numbering/draft-workspaces?${params.toString()}`, { cache: "no-store" });
    const body = await readApiBody<{ workspaces?: NumberingDraftWorkspace[] }>(response);
    setLoading(false);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      setError(apiErrorMessage(response, body, "保留號清單暫時無法讀取。"));
      return;
    }
    const next = body.workspaces ?? [];
    setWorkspaces(next);
    setSelected((current) => {
      const targetId = preferredId ?? current?.id;
      if (!targetId) return current;
      const nextSelected = next.find((workspace) => workspace.id === targetId) ?? null;
      if (!nextSelected) setEditOpen(false);
      return nextSelected;
    });
  }, [feature?.enabled, lifecycle, ownerScope]);

  const loadDetail = useCallback(async (workspaceId: string) => {
    setError("");
    const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace }>(response);
    if (!response.ok || !body.workspace) {
      setError(apiErrorMessage(response, body, "保留號明細暫時無法讀取。"));
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
    if (!matchesNumberEffectiveness(workspace.projection.numberQualification, numberEffectiveness)) return false;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    const values = [
      workspace.id,
      workspace.sourceRootId,
      workspace.root?.coreName,
      workspace.root?.candidateCode,
      ...workspace.parts.flatMap((part) => [part.partName, part.candidateCode]),
      ...workspace.drawings.flatMap((drawing) => [drawing.purposeDescription, drawing.candidateCode])
    ];
    return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
  }), [numberEffectiveness, query, workspaces]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [lifecycle, numberEffectiveness, ownerScope, query]);
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
      submit: "submit-review",
      withdraw: "withdraw-review",
      publish: "publish"
    } as const)[action];
    const response = await fetch(
      `/api/numbering/draft-workspaces/${encodeURIComponent(selected.id)}/${endpoint}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey(selected.id, action)
        },
        body: JSON.stringify({
          expectedRowVersion: selected.rowVersion,
          ...(action === "cancel" ? { reason: "user_cancelled_draft" } : {}),
          ...(action === "submit" ? { reason: "draft_owner_confirmed_candidate_publication_review" } : {})
        })
      }
    );
    const body = await readApiBody<{ workspace?: NumberingDraftWorkspace; idempotentReplay?: boolean }>(response);
    setActionBusy(false);
    setConfirmAction(null);
    if (!response.ok || !body.workspace) {
      const fallback = ({ cancel: "保留號取消失敗。", submit: "送審失敗。", withdraw: "撤回審核失敗。", publish: "正式發布失敗。" } as const)[action];
      setError(apiErrorMessage(response, body, fallback));
      if (response.status !== 503) idempotencyKeys.current.delete(`${selected.id}:${action}`);
      if (response.status === 409) await refreshWorkspace(selected.id);
      return;
    }
    idempotencyKeys.current.delete(`${selected.id}:${action}`);
    setSelected(body.workspace);
    setNotice(({
      cancel: "申請已取消；原保留號碼已釋出。",
      submit: "申請已送審，保留號碼已鎖定；核准不會自動正式發布。",
      withdraw: "待審申請已撤回，保留號碼已解鎖，可繼續編輯。",
      publish: "圖料號已正式發布；正式主檔狀態為有效，後續圖面版本發行仍走既有流程。"
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
      setError(apiErrorMessage(response, body, "保留號更新失敗。"));
      if (response.status === 409) await refreshWorkspace(selected.id);
      return;
    }
    setSelected(body.workspace);
    setEditOpen(false);
    setNotice("申請內容已更新。保留號碼與狀態仍以伺服器回傳為準。");
    await loadWorkspaces(body.workspace.id);
  }

  if (feature === null) {
    return <section className="panel"><div className="empty">正在確認保留號功能狀態...</div></section>;
  }
  if (!feature.enabled) {
    return (
      <>
        <div className="topbar"><div><h1>{moduleConfig.title}</h1><p>保留號功能尚未開放。</p></div></div>
        <section className="panel"><div className="empty"><LockKeyhole size={26} /><strong>保留號分頁尚未開放</strong><p>請回{moduleConfig.officialLabel}；系統不會從此頁建立申請或占用號碼。</p><Link className="primary-button" href={moduleConfig.officialHref}>回{moduleConfig.officialLabel}</Link></div></section>
      </>
    );
  }

  return (
    <>
      <div className="topbar number-state-topbar">
        <div>
          <h1>{moduleConfig.title} <StatusScopeHelp scope="numberStateWorkspace" /></h1>
          <p>建立申請時會直接保留號碼；正式發布前不可正式使用。</p>
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
          {selected && recoveryHref(selected) ? <Link href={recoveryHref(selected)!}>前往處理阻擋</Link> : null}
          <button className="icon-button" type="button" onClick={() => setError("")} aria-label="關閉錯誤訊息"><X size={16} /></button>
        </div>
      ) : null}

      <section className="panel number-state-toolbar">
        <div className="number-state-filter-grid">
          <label>
            <span>搜尋</span>
            <div className="number-state-search-field"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="申請名稱、保留號碼或 ID" /></div>
          </label>
          <label><span>範圍</span><select value={ownerScope} onChange={(event) => setOwnerScope(event.target.value as "mine" | "all")}><option value="mine">我的保留號</option><option value="all">全公司保留號</option></select></label>
          <label><span>生命週期</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as "all" | LifecycleStatus)}><option value="all">全部</option><option value="active">進行中</option><option value="cancelled">已取消</option><option value="published">已發布</option></select></label>
          <label><span>號碼效力</span><select value={numberEffectiveness} onChange={(event) => setNumberEffectiveness(event.target.value as NumberEffectivenessFilter)}><option value="all">全部</option><option value="not_generated">尚未產生</option><option value="reserved">已保留</option><option value="official">正式</option></select></label>
        </div>
      </section>

      <section className="panel number-state-list-panel">
        <div className="panel-header number-state-list-header">
          <div><div className="number-state-list-title"><h2>保留號清單</h2><StatusScopeHelp scope="numberStateWorkspace" /><StatusHelpPopover context="numberEffectiveness" buttonLabel="查看號碼效力說明" /></div><p>{filtered.length} 筆；已保留號碼與正式資料分開保存。</p></div>
          <span className="number-state-page-count">第 {page} / {pageCount} 頁</span>
        </div>
        {loading && workspaces.length === 0 ? <div className="empty">正在載入圖料號申請...</div> : null}
        {!loading && !error && filtered.length === 0 ? (
          <div className="empty"><CircleDashed size={26} /><strong>目前沒有符合條件的保留號</strong><p>請建立新申請；關閉建立視窗不會寫入資料或占用號碼。</p><button className="primary-button" type="button" onClick={() => setCreateOpen(true)} disabled={!canCreate} title={createTitle} aria-label={createCta.ariaLabel}><Plus size={16} />{createCta.label}</button></div>
        ) : null}
        {filtered.length > 0 ? (
          <div className="number-state-table-wrap">
            <table className="data-table number-state-table">
              <thead><tr><th>保留號</th><th>內容</th><th>申請狀態</th><th>號碼效力</th><th>號碼</th><th>下一步</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {visible.map((workspace) => (
                  <tr key={workspace.id}>
                    <td data-label="保留號"><button className="number-state-row-link" type="button" onClick={() => void loadDetail(workspace.id)}><strong>{workspaceTitle(workspace)}</strong><span>{draftModeLabel(workspace.draftMode)} · v{workspace.rowVersion}</span></button></td>
                    <td data-label="內容">{workspace.parts.length} 料號 · {workspace.drawings.length} 圖號</td>
                    <td data-label="申請狀態"><LifecycleBadge lifecycle={workspace.projection.lifecycle} /></td>
                    <td data-label="號碼效力"><NumberEffectivenessBadge qualification={workspace.projection.numberQualification} /></td>
                    <td data-label="號碼">{candidateCodes(workspace).length > 0 ? <span className="number-state-candidate-inline">{candidateCodes(workspace).join("、")}</span> : <span className="muted-text">尚未產生號碼</span>}</td>
                    <td data-label="下一步"><span className="number-state-next-label">{nowWhatLabel(workspace.projection.nowWhat.label)}</span></td>
                    <td data-label="操作"><button className="icon-button number-state-card-action" type="button" onClick={() => void loadDetail(workspace.id)} aria-label={`查看 ${workspaceTitle(workspace)} 明細`} title="查看明細"><span className="number-state-mobile-action-label">查看明細</span><ArrowRight size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {filtered.length > PAGE_SIZE ? (
          <div className="number-state-pagination">
            <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} />上一頁</button>
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
          onClose={() => { setSelected(null); setEditOpen(false); }}
        />
      ) : null}
      {createOpen ? (
        <DraftCreateDialog
          initialMode={createModeFromLocation()}
          initialSourceRootId={sourceRootFromLocation()}
          onClose={() => setCreateOpen(false)}
          onCreated={(workspace) => {
            setCreateOpen(false);
            setSelected(workspace);
            setNotice("申請已建立並保留號碼；正式發布前不可正式使用。");
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
          onConfirm={() => void runWorkspaceAction(confirmAction)}
        />
      ) : null}
    </>
  );
}

function DraftCreateDialog({
  initialMode,
  initialSourceRootId,
  onClose,
  onCreated
}: {
  initialMode: DraftMode;
  initialSourceRootId: string;
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
  const effectivePrimaryManufacturing = manufacturingDrawing;
  const relationLinkType = includesPart && includesDrawing && effectivePrimaryManufacturing ? "primary_manufacturing" : "reference";
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
              ? "查重功能被正式領號 / 保留號 production slice 邊界封鎖，請通知管理員檢查 API allowlist。"
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
    if (form.mode !== "new_bundle" && !form.sourceRootCode.trim()) return setError("請輸入既有正式主根號。");
    if (form.mode !== "new_bundle" && appendPolicyState === "loading") return setError("正在讀取主根資料，請稍候。");
    if (form.mode !== "new_bundle" && appendPolicyState !== "ready") return setError("找不到這個主根號，請確認後重試。");
    if (appendPolicy?.locked) return setError("此主根已關閉，不能再新增圖號或料號。");
    if (appendPolicy?.reasonRequired && !form.appendReason.trim()) return setError("此主根已有正式資料，請填寫新增原因。");
    if (includesPart && !lockedPartName) return setError("請先完成確定品名。");
    if (includesPart && form.partItemKind === "custom" && !form.customSpecification.trim()) return setError("客製料件請填寫客製尺寸或規格。");
    if (includesDrawing && form.purposeCode === "R" && !form.purposeDescription.trim()) return setError("請填寫參考用途。");

    const partClientKey = "part-1";
    const drawingClientKey = "drawing-1";
    const body = {
      autoAcquireCandidates: true,
      draftMode: form.mode,
      sourceRootId: form.mode === "new_bundle" ? undefined : appendPolicy?.root.id,
      appendReason: form.mode === "new_bundle" ? undefined : form.appendReason.trim() || null,
      root: form.mode === "new_bundle" ? { coreName: form.coreName.trim(), itemKind: form.rootItemKind } : undefined,
      parts: includesPart ? [{
        clientKey: partClientKey,
        partName: lockedPartName,
        itemKind: form.partItemKind,
        isUniversal: false,
        universalReason: null,
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
      setError(apiErrorMessage(response, responseBody, "申請建立或號碼保留失敗。表單內容已保留。"));
      if (response.status !== 503) idempotencyKey.current = newIdempotencyKey("create");
      return;
    }
    onCreated(responseBody.workspace);
  }

  return (
    <div className="number-state-modal-backdrop" role="presentation">
      <section ref={dialogRef} className="number-state-modal number-state-create-modal" role="dialog" aria-modal="true" aria-labelledby="number-state-create-title">
        <div className="number-state-modal-header">
          <div><h2 id="number-state-create-title" tabIndex={-1} data-autofocus>建立保留號</h2><p>先確認品名、查重與追加規則；建立後會直接保留號碼，關閉視窗不會寫入資料。</p></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="關閉建立保留號"><X size={20} /></button>
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
                  {form.partItemKind === "manufactured" ? <Field label="系列代號（選填）" hint="非共用件會納入建議品名；勾選跨專案共用時不納入品名。"><input data-qc="root-series-code" value={form.seriesCode} onChange={(event) => setForm({ ...form, seriesCode: event.target.value })} maxLength={80} placeholder="例如：JF、100L、S1" /></Field> : null}
                  {form.rootItemKind !== "purchased" ? <Field label="流水識別（選填）" hint="對應品名用的流水號，建議從 A 開始；不等於正式料號流水。"><input value={form.nameSerial} onChange={(event) => setForm({ ...form, nameSerial: event.target.value })} maxLength={40} placeholder="例如：A、B、01" /></Field> : null}
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
            <><Field label="既有正式主根號" required hint="輸入使用者看得到的主根號，例如 A0001；系統會自動讀取主根 ID。"><input value={form.sourceRootCode} onChange={(event) => setForm({ ...form, sourceRootCode: event.target.value.toUpperCase() })} maxLength={80} placeholder="例如：A0001" /></Field><AppendPolicyPanel policy={appendPolicy} state={appendPolicyState} rootCode={form.sourceRootCode} />{appendPolicy ? <Field label={`新增原因${appendPolicy.reasonRequired ? "" : "（選填）"}`} required={appendPolicy.reasonRequired} hint="正式主根追加需留下人類可讀的原因，方便日後稽核。"><input value={form.appendReason} onChange={(event) => setForm({ ...form, appendReason: event.target.value })} maxLength={1000} placeholder="例如：同主根新增第二款料件或補參考圖" /></Field> : null}</>
          )}
          {includesPart ? (
            <div className="number-state-form-section">
              <h3>料號保留號</h3>
              <div className="number-state-form-grid">
                <div className="number-state-draft-summary is-fixed">
                  <PackagePlus size={17} />
                  <div>
                    <span>固定建立</span>
                    <strong>1 個料號保留號</strong>
                    <small data-qc="part-number-preview">預覽料號：{previewText(numberPreviewState, numberPreview?.part)}</small>
                    <small data-qc="number-preview-note">預覽不占號；建立申請後才會保留號碼。</small>
                  </div>
                </div>
                {showPartKindSelector ? (
                  <SelectField
                    label="料件類型"
                    value={form.partItemKind}
                    onChange={(value) => {
                      const nextKind = value as ItemKind;
                      setForm({
                        ...form,
                        partItemKind: nextKind,
                        seriesCode: nextKind === "manufactured" ? form.seriesCode : ""
                      });
                    }}
                    options={createItemKindOptions}
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
                <h3>圖號保留號</h3>
                {canToggleDrawingDraft ? (
                  <label className={`number-state-section-toggle${effectiveIncludeDrawing ? " is-on" : ""}`}>
                    <input type="checkbox" checked={effectiveIncludeDrawing} onChange={(event) => setForm({ ...form, includeDrawing: event.target.checked })} aria-label="包含圖號保留號" />
                    <span className="number-state-switch" aria-hidden="true"><span /></span>
                    <strong>包含圖號保留號</strong>
                  </label>
                ) : null}
              </div>
              <div className="number-state-form-grid">
                <div className={`number-state-draft-summary${includesDrawing ? " is-fixed" : " is-muted"}`} data-qc={manufacturedPartMustIncludeDrawing ? "manufactured-fixed-drawing-draft" : undefined}>
                  <FileText size={17} />
                  <div>
                    <span>{includesDrawing ? (canToggleDrawingDraft ? "同時建立" : "固定建立") : "本次不建立"}</span>
                    <strong>{includesDrawing ? "圖號保留號" : "未建立圖號保留號"}</strong>
                    <small data-qc="drawing-number-preview">{includesDrawing ? `預覽圖號：${previewText(numberPreviewState, numberPreview?.drawing)}` : drawingHint}</small>
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
        <div className="number-state-modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || duplicateCheckState === "checking" || appendPolicyState === "loading" || Boolean(appendPolicy?.locked)}><Save size={16} />{busy ? "建立中..." : duplicateCheckState === "checking" ? "正在查重..." : appendPolicyState === "loading" ? "正在讀取主根..." : "建立並保留號碼"}</button></div>
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
          {result.matches.length === 0 ? "未找到相同或高相似資料，可以繼續建立新主根。" : `找到 ${result.matches.length} 筆相似資料，建議先確認是否沿用既有主根；確認是新主題仍可繼續建立草稿。`}
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
  if (state === "idle") return <div className="number-state-check-panel"><Search size={16} /><span>輸入主根號後會顯示名稱與下一號預覽。</span></div>;
  if (state === "loading") return <div className="number-state-check-panel" aria-live="polite"><RefreshCcw size={16} /><span>正在讀取主根資料...</span></div>;
  if (state === "error" || !policy) return <div className="number-state-check-panel is-error" role="alert"><AlertTriangle size={16} /><span>找不到主根 {rootCode || ""}，請確認後重試。</span></div>;
  return (
    <div className={`number-state-check-panel${policy.locked ? " is-blocked" : " is-ready"}`}>
      {policy.locked ? <AlertTriangle size={16} /> : <Check size={16} />}
      <div>
        <strong>{policy.root.rootCode} · {policy.root.coreName}</strong>
        <span>下一料號 {policy.nextNumbers.part} · 製造圖 {policy.nextNumbers.drawingM} · 參考圖 {policy.nextNumbers.drawingR}</span>
        <small>{policy.locked ? "此主根已關閉，不能追加。" : policy.reasonRequired ? "此主根已有正式資料，新增原因必填。" : "可追加；新增原因選填。"}</small>
      </div>
    </div>
  );
}

function WorkspaceDrawer({
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
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  useOverlayLifecycle(drawerRef, onClose, busy);
  return (
    <div className="number-state-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={drawerRef} className="number-state-drawer" role="dialog" aria-modal="true" aria-labelledby="number-state-drawer-title">
        <div className="number-state-drawer-header"><div><span className="eyebrow">{draftModeLabel(workspace.draftMode)}</span><h2 id="number-state-drawer-title" tabIndex={-1} data-autofocus>{workspaceTitle(workspace)}</h2><p>v{workspace.rowVersion} · 更新於 {formatDateTime(workspace.updatedAt)}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉保留號明細"><X size={20} /></button></div>
        <div className="number-state-drawer-body">
          <ProjectionSummary projection={workspace.projection} />
          {workspace.projection.numberQualification === "candidate" && candidateCodes(workspace).length > 0 ? <div className="number-state-candidate-watermark"><AlertTriangle size={18} /><div><strong>已保留，尚不可正式使用</strong><span>{candidateCodes(workspace).join(" · ")}</span></div></div> : null}
          <NowWhatPanel workspace={workspace} busy={busy} onSubmit={onSubmit} onPublish={onPublish} formalActionsUnopened={formalActionsUnopened} unopenedMessage={unopenedMessage} />
          {editing ? <WorkspaceEditForm workspace={workspace} busy={busy} onCancel={onCancelEdit} onSave={onUpdate} /> : <WorkspaceFacts workspace={workspace} />}
          <section className="number-state-drawer-section">
            <div className="number-state-section-heading"><h3>後續動作</h3>{workspace.capabilities.canUpdate && !editing ? <button className="secondary-button" type="button" onClick={onEdit}><Pencil size={15} />編輯保留號</button> : null}</div>
            <div className="number-state-future-actions">
              {workspace.capabilities.canSubmitReview ? formalActionsUnopened ? <UnopenedAction label="送交發布審核" reason={unopenedMessage}><LockKeyhole size={15} /></UnopenedAction> : <button className="primary-button" type="button" onClick={onSubmit} disabled={busy}><LockKeyhole size={15} />送交發布審核</button> : null}
              {workspace.latestApproval?.status === "pending" ? formalActionsUnopened ? <UnopenedAction label="查看審核" reason={unopenedMessage}><FileText size={15} /></UnopenedAction> : <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><FileText size={15} />查看審核</Link> : null}
              {workspace.capabilities.canWithdrawReview ? formalActionsUnopened ? <UnopenedAction label="撤回審核" reason={unopenedMessage}><RotateCcw size={15} /></UnopenedAction> : <button className="secondary-button" type="button" onClick={onWithdraw} disabled={busy}><RotateCcw size={15} />撤回審核</button> : null}
              {workspace.latestApproval?.status === "apply_failed" ? <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><RefreshCcw size={15} />重試審核套用</Link> : null}
              {workspace.projection.review === "approved" && workspace.lifecycleStatus === "active" ? (
                formalActionsUnopened ? <UnopenedAction label="正式發布" reason={unopenedMessage}><Check size={15} /></UnopenedAction> : <button className="primary-button" type="button" onClick={onPublish} disabled={!workspace.capabilities.canPublish || busy} title={!workspace.capabilities.canPublish ? publicationBlockerLabel(workspace.capabilities.publishBlockedReason) : "正式建立主根、料號、圖號與關係"}><Check size={15} />正式發布</button>
              ) : null}
            </div>
          </section>
        </div>
        <div className="number-state-drawer-footer"><button className="danger-button" type="button" disabled={!workspace.capabilities.canCancel || busy} title={!workspace.capabilities.canCancel ? blockedReasonLabel(workspace.projection.nowWhat.blockedReason) : "取消申請並釋出保留號碼"} onClick={onCancel}><Ban size={16} />取消保留號</button><button className="secondary-button" type="button" onClick={onClose}>關閉</button></div>
      </aside>
    </div>
  );
}

function ProjectionSummary({ projection }: { projection: NumberStateProjection }) {
  return <section className="number-state-drawer-section"><div className="number-state-section-heading"><h3>目前狀態</h3><ProjectionBadges projection={projection} /></div><dl className="number-state-state-grid"><div><dt>審核</dt><dd>{reviewLabel(projection.review)}</dd></div><div><dt>發布</dt><dd>{publicationLabel(projection.publication)}</dd></div><div><dt>完整度</dt><dd>{readinessLabel(projection.readiness)}</dd></div><div><dt>正式用途</dt><dd>{usageLabel(projection.usage)}</dd></div></dl></section>;
}

function NowWhatPanel({ workspace, busy, onSubmit, onPublish, formalActionsUnopened, unopenedMessage }: { workspace: NumberingDraftWorkspace; busy: boolean; onSubmit: () => void; onPublish: () => void; formalActionsUnopened: boolean; unopenedMessage: string }) {
  const action = workspace.capabilities.canSubmitReview
    ? formalActionsUnopened
      ? <UnopenedAction label="送交審核" reason={unopenedMessage}><LockKeyhole size={15} /></UnopenedAction>
      : <button className="primary-button" type="button" onClick={onSubmit} disabled={busy}><LockKeyhole size={15} />送交審核</button>
    : workspace.capabilities.canPublish
      ? formalActionsUnopened
        ? <UnopenedAction label="正式發布" reason={unopenedMessage}><Check size={15} /></UnopenedAction>
        : <button className="primary-button" type="button" onClick={onPublish} disabled={busy}><Check size={15} />正式發布</button>
      : workspace.latestApproval?.requestId
        ? formalActionsUnopened
          ? <UnopenedAction label="查看審核" reason={unopenedMessage}><FileText size={15} /></UnopenedAction>
          : <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(workspace.latestApproval.requestId)}`}><FileText size={15} />查看審核</Link>
        : null;
  return (
    <section className="number-state-now-what"><div><span>現在要做什麼</span><strong>{formalActionsUnopened && (workspace.capabilities.canSubmitReview || workspace.capabilities.canPublish) ? "此階段尚未開放" : nowWhatLabel(workspace.projection.nowWhat.label)}</strong><small>{formalActionsUnopened && (workspace.capabilities.canSubmitReview || workspace.capabilities.canPublish) ? unopenedMessage : `責任角色：${ownerRoleLabel(workspace.projection.nowWhat.ownerRole)}`}</small></div>{action}</section>
  );
}

function UnopenedAction({ label, reason, children }: { label: string; reason: string; children: ReactNode }) {
  return <button className="secondary-button production-slice-unopened" type="button" aria-disabled="true" data-production-slice-unopened="true" title={`未開放：${reason}`} onClick={(event) => event.preventDefault()}>{children}{label}<span className="nav-unopened-badge">未開放</span></button>;
}

function WorkspaceFacts({ workspace }: { workspace: NumberingDraftWorkspace }) {
  return (
    <section className="number-state-drawer-section"><h3>保留號內容</h3><div className="number-state-item-list">{workspace.root ? <DraftItem icon={<PackagePlus size={16} />} title={workspace.root.coreName} subtitle={`${itemKindLabel(workspace.root.itemKind)} · ${draftNumberLabel(workspace, workspace.root.candidateCode)}`} /> : null}{workspace.parts.map((part) => <DraftItem key={part.id} icon={<PackagePlus size={16} />} title={part.partName} subtitle={`${itemKindLabel(part.itemKind)}${part.seriesCode ? ` · 系列 ${part.seriesCode}` : ""} · ${draftNumberLabel(workspace, part.candidateCode)}`} />)}{workspace.drawings.map((drawing) => <DraftItem key={drawing.id} icon={<FileText size={16} />} title={purposeLabel(drawing.purposeCode)} subtitle={`${drawing.purposeCode === "R" && drawing.purposeDescription ? `${drawing.purposeDescription} · ` : ""}${draftNumberLabel(workspace, drawing.candidateCode)}`} />)}</div></section>
  );
}

function WorkspaceEditForm({ workspace, busy, onCancel, onSave }: { workspace: NumberingDraftWorkspace; busy: boolean; onCancel: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [root, setRoot] = useState(workspace.root ? { ...workspace.root } : null);
  const [parts, setParts] = useState(workspace.parts.map((part) => ({ ...part })));
  const [drawings, setDrawings] = useState(workspace.drawings.map((drawing) => ({ ...drawing })));
  return (
    <section className="number-state-drawer-section">
      <h3>編輯保留號</h3>
      <div className="number-state-edit-list">
        {root ? <Field label="確定品名" hint="此欄位是唯一名稱來源；儲存時會同步到料號主檔。"><input value={root.coreName} onChange={(event) => setRoot({ ...root, coreName: event.target.value })} /></Field> : null}
        {parts.map((part, index) => {
          const showSeriesCode = part.itemKind === "manufactured" && !part.isUniversal;
          const showUniversalReason = part.isUniversal || part.itemKind === "shared";
          if (!showSeriesCode && !showUniversalReason) return null;
          return (
            <div className="number-state-edit-list" key={part.id}>
              {showSeriesCode ? <Field label={`系列代號 ${index + 1}（選填）`} hint="非共用件會納入建議品名；跨專案共用時不納入品名。"><input value={part.seriesCode ?? ""} maxLength={80} onChange={(event) => setParts((items) => items.map((item) => item.id === part.id ? { ...item, seriesCode: event.target.value } : item))} /></Field> : null}
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

function ConfirmDialog({ action, workspace, busy, onClose, onConfirm }: { action: WorkspaceAction; workspace: NumberingDraftWorkspace; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const content = ({
    cancel: {
      title: "取消申請並釋出號碼",
      strong: "取消後保留號不能再編輯",
      detail: candidateCodes(workspace).length > 0 ? `將釋出 ${candidateCodes(workspace).join("、")}；有審核或外部引用時系統會阻擋。` : "此申請尚未產生號碼，取消後不會釋出號碼。",
      confirm: "確認取消保留號",
      icon: <AlertTriangle size={22} />,
      danger: true
    },
    submit: {
      title: "送交正式發布審核",
      strong: "送審後申請與保留號碼將鎖定",
      detail: "核准只代表允許發布，不會建立正式主檔；核准後仍需由具發布權限的人員執行正式發布。",
      confirm: "確認送交審核",
      icon: <LockKeyhole size={22} />,
      danger: false
    },
    withdraw: {
      title: "撤回正式發布審核",
      strong: "撤回後核准流程將中止",
      detail: "保留號碼會解除審核鎖定，申請可修改後再次送審。",
      confirm: "確認撤回審核",
      icon: <RotateCcw size={22} />,
      danger: false
    },
    publish: {
      title: "正式發布圖料號",
      strong: "此動作會建立正式主檔，無法由此畫面復原",
      detail: `將以已核准的保留號碼建立正式主根、${workspace.parts.length} 個料號與 ${workspace.drawings.length} 個圖號。核准本身尚未執行這個動作。`,
      confirm: "確認正式發布",
      icon: <AlertTriangle size={22} />,
      danger: true
    }
  } as const)[action];
  const dialogRef = useRef<HTMLElement | null>(null);
  useOverlayLifecycle(dialogRef, onClose, busy);
  return (
    <div className="number-state-modal-backdrop" role="presentation"><section ref={dialogRef} className="number-state-modal number-state-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="number-state-confirm-title"><div className="number-state-modal-header"><div><h2 id="number-state-confirm-title">{content.title}</h2><p>{workspaceTitle(workspace)}</p></div><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="關閉確認"><X size={20} /></button></div><div className={`number-state-confirm-summary${content.danger ? " is-danger" : ""}`}>{content.icon}<div><strong>{content.strong}</strong><p>{content.detail}</p></div></div><div className="number-state-modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy} data-autofocus>返回檢查</button><button className={content.danger ? "danger-button" : "primary-button"} type="button" onClick={onConfirm} disabled={busy}>{action === "cancel" ? <Ban size={16} /> : action === "withdraw" ? <RotateCcw size={16} /> : <Check size={16} />}{busy ? "處理中..." : content.confirm}</button></div></section></div>
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

function ProjectionBadges({ projection }: { projection: NumberStateProjection }) {
  return <div className="number-state-badges"><NumberEffectivenessBadge qualification={projection.numberQualification} /><LifecycleBadge lifecycle={projection.lifecycle} /></div>;
}

function NumberEffectivenessBadge({ qualification }: { qualification: NumberQualification }) {
  if (qualification === "unnumbered") return <span className="muted-text">尚未產生號碼</span>;
  return <span className={`number-state-badge qualification-${qualification}`}>{formatStatusForUser(qualification, "numberEffectiveness")}</span>;
}

function LifecycleBadge({ lifecycle }: { lifecycle: NumberStateProjection["lifecycle"] }) {
  return <span className={`number-state-badge lifecycle-${lifecycle}`}>{lifecycleLabel(lifecycle)}</span>;
}

function candidateCodes(workspace: NumberingDraftWorkspace) {
  return workspace.reservations.filter((reservation) => reservation.state !== "recycled").map((reservation) => reservation.candidateCode);
}

function draftNumberLabel(workspace: NumberingDraftWorkspace, candidateCode: string | null) {
  if (!candidateCode) return "尚未產生號碼";
  return workspace.lifecycleStatus === "cancelled" ? `歷史保留號碼 ${candidateCode}（已釋出）` : candidateCode;
}

function workspaceTitle(workspace: NumberingDraftWorkspace) {
  return workspace.root?.coreName ?? workspace.parts[0]?.partName ?? workspace.drawings[0]?.purposeDescription ?? `保留號 ${workspace.id.slice(-8)}`;
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

function draftModeLabel(value: DraftMode) { return ({ new_bundle: "新圖料", append_drawing: "新增圖號", append_part: "新增料號", append_drawing_part: "新增圖號與料號" } as const)[value]; }
function itemKindLabel(value: ItemKind) { return itemKindOptions.find((option) => option.value === value)?.label ?? value; }
function purposeLabel(value: PurposeCode) { return purposeOptions.find((option) => option.value === value)?.label ?? value; }
function isManufacturingPurposeCode(value: PurposeCode) { return value === "M" || value === "MA"; }
function matchesNumberEffectiveness(value: NumberQualification, filter: NumberEffectivenessFilter) {
  if (filter === "all") return true;
  if (filter === "not_generated") return value === "unnumbered";
  if (filter === "reserved") return value === "candidate";
  return value === "official" || value === "legacy_official_reservation";
}
function lifecycleLabel(value: NumberStateProjection["lifecycle"]) { return ({ draft: "編輯中", cancelled: "已取消", published: "已轉正式資料", obsolete: "已失效" } as const)[value]; }
function reviewLabel(value: NumberStateProjection["review"]) { return ({ not_submitted: "未送審", in_review: "審核中", needs_info: "待補資料", rejected: "已退回", approved: "已核准" } as const)[value]; }
function publicationLabel(value: NumberStateProjection["publication"]) { return ({ not_ready: "尚未開放", ready: "可發布", publishing: "發布中", failed: "發布失敗", published: "已發布" } as const)[value]; }
function readinessLabel(value: NumberStateProjection["readiness"]) { return ({ incomplete: "未完成", ready: "完成", stale: "需重整", not_applicable: "不適用" } as const)[value]; }
function usageLabel(value: NumberStateProjection["usage"]) { return ({ not_for_formal_use: "不可正式使用", formal_use_allowed: "可正式使用", historical_only: "僅供歷史查閱" } as const)[value]; }
function ownerRoleLabel(value: string) { return ({ "Draft owner": "保留號負責人", Approver: "審核者", Publisher: "發布者", PDM: "PDM 管理者", "PDM Admin": "PDM Admin" } as Record<string, string>)[value] ?? value; }
function nowWhatLabel(value: string) { return ({ "Acquire candidate numbers": "尚未產生號碼", "Complete draft and submit review": "完成保留號並送審", "View cancelled draft": "查看已取消保留號", "View official record": "查看正式資料", "Check state inconsistency": "請 PDM Admin 檢查狀態", "View review": "查看審核", "Retry approval apply": "重試核准套用", "Update requested information": "補齊審核要求的資料", "Revise draft before resubmission": "修訂保留號後重新送審", "Publish official number": "正式發布" } as Record<string, string>)[value] ?? value; }
function blockedReasonLabel(value: string | null) { return ({ candidate_review_locked: "保留號碼正在審核，請先查看或撤回審核。", approval_apply_failed: "核准結果尚未成功套用，請至審核中心重試。", state_inconsistent: "狀態不一致，請 PDM Admin 協助。" } as Record<string, string>)[value ?? ""] ?? "目前狀態不可取消。"; }
function publicationBlockerLabel(value: string | null) {
  if (value?.startsWith("drawing_evidence_not_finalized:")) return "至少一份圖面受控檔案證據尚未定稿。";
  return ({
    direct_gcs_verifier_unavailable: "正式 GCS 檔案證據驗證器尚未啟用，圖面草稿不可發布。",
    publication_evidence_not_ready: "正式發布所需證據尚未完成。",
    numbering_publish_permission_required: "目前帳號沒有正式發布權限。",
    candidate_approval_required: "保留號碼尚未完成核准。",
    candidate_approval_lock_mismatch: "核准鎖定資料不一致，請由 PDM Admin 處理。",
    approval_snapshot_stale: "核准快照已過期，請重新送審。"
  } as Record<string, string>)[value ?? ""] ?? "目前狀態不可正式發布。";
}
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false }); }
