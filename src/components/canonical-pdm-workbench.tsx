"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { RETIRED_WORKBENCH_QUERY_KEYS } from "@/lib/pdm-canonical-workbench-contract";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { RelationMatrixTable, type RelationMatrixCell, type RelationMatrixIdentity } from "@/components/relation-matrix-table";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { PdmWorkbenchLayoutSwitch } from "@/components/pdm-workbench-layout-switch";
import { CanonicalEntityPreviewGallery } from "@/components/canonical-pdm-preview-gallery";
import { CanonicalPreviewPanel } from "@/components/canonical-preview-panel";
import { PartPreviewSourceControl } from "@/components/part-preview-source-control";
import { CanonicalNumberingCreateAction } from "@/components/canonical-numbering-create-action";
import { DRAWING_LAYOUT_STORAGE_KEY, PART_LAYOUT_STORAGE_KEY, normalizeCanonicalWorkbenchLayout, type CanonicalPreviewProjection, type CanonicalWorkbenchLayout } from "@/lib/pdm-canonical-preview";
import type { PartPreviewMutationResult } from "@/lib/pdm-part-preview";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import type {
  CanonicalDataState,
  CanonicalHandling,
  CanonicalLayer,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchDetailDto,
  CanonicalWorkbenchListDto,
  CanonicalWorkbenchRowDto,
  CanonicalRelationMatrixProjection
} from "@/lib/pdm-canonical-workbench-contract";

type DomainConfig = {
  entityType: "drawing" | "part";
  title: string;
  listEndpoint: string;
  detailEndpoint: string;
  searchPlaceholder: string;
  layerOptions: Array<{ value: CanonicalLayer; label: string }>;
};

const DOMAIN_CONFIG: Record<"drawing" | "part", DomainConfig> = {
  drawing: {
    entityType: "drawing",
    title: "圖號工作台",
    listEndpoint: "/api/numbering/drawings/workbench",
    detailEndpoint: "/api/numbering/drawings/workbench",
    searchPlaceholder: "搜尋圖號、品名或料號",
    layerOptions: [{ value: "production", label: "量產版" }, { value: "rd", label: "研發版" }]
  },
  part: {
    entityType: "part",
    title: "料號工作台",
    listEndpoint: "/api/parts/workbench",
    detailEndpoint: "/api/parts/workbench",
    searchPlaceholder: "搜尋料號、品名或圖號",
    layerOptions: [{ value: "formal", label: "正式資料" }, { value: "work", label: "修改中" }]
  },
};

const HANDLING_OPTIONS: Array<{ value: CanonicalHandling; label: string }> = [
  { value: "none", label: "無須處理" },
  { value: "owner", label: "負責人處理" },
  { value: "review_owner", label: "審核負責人處理" },
  { value: "system", label: "系統處理" },
  { value: "system_admin", label: "系統管理員處理" },
  { value: "blocked", label: "受阻" }
];

const DATA_STATE_OPTIONS: Array<{ value: CanonicalDataState; label: string }> = [
  { value: "editing", label: "編輯中" },
  { value: "reviewing", label: "審核中" },
  { value: "publishing", label: "發布中" },
  { value: "available", label: "可使用" }
];

type Detail = CanonicalWorkbenchDetailDto;
type Candidate = { kind: "production" | "rd"; label: string; enabled: boolean; reason: string | null; candidateToken: string | null };
type ApiError = { error?: { code?: string; message?: string; correlationId?: string } };
type LayerSelection = PdmWorkbenchFilterSelection<CanonicalLayer>;
type DataStateSelection = PdmWorkbenchFilterSelection<CanonicalDataState>;
type HandlingSelection = PdmWorkbenchFilterSelection<CanonicalHandling>;

const DRAWER_WIDTH_STORAGE_KEYS: Record<"drawing" | "part", string> = {
  drawing: "pdm-drawing-detail-drawer-width",
  part: "pdm-part-detail-drawer-width"
};

function errorMessage(body: unknown, fallback: string) {
  const api = body as ApiError;
  return api?.error?.message?.trim() || fallback;
}

async function readJson(response: Response) {
  try { return await response.json() as unknown; }
  catch { return null; }
}

function replaceLocation(patch: { query?: string; layer?: LayerSelection; dataState?: DataStateSelection; handling?: HandlingSelection; detail?: string | null; layout?: CanonicalWorkbenchLayout | null }) {
  const url = new URL(window.location.href);
  if (patch.query !== undefined) {
    if (patch.query.trim()) url.searchParams.set("query", patch.query.trim());
    else url.searchParams.delete("query");
  }
  if (patch.layer !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "layer", patch.layer);
  if (patch.dataState !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "stage", patch.dataState);
  if (patch.handling !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "handling", patch.handling);
  if (patch.detail !== undefined) {
    if (patch.detail) url.searchParams.set("detail", patch.detail);
    else url.searchParams.delete("detail");
  }
  if (patch.layout !== undefined) {
    if (patch.layout) url.searchParams.set("layout", patch.layout);
    else url.searchParams.delete("layout");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function DetailFields({ fields }: { fields: Detail["data"]["presentation"]["fields"] }) {
  if (!fields.length) return <p className="canonical-empty">無資料</p>;
  return <dl className="canonical-field-grid">{fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}

function DrawingCanonicalPreview({ previews }: { previews: [DrawingPreviewSlotModel, DrawingPreviewSlotModel] }) {
  const cards: DrawingDetailPreviewCard[] = (previews ?? []).map((preview) => ({
    kind: preview.kind,
    title: preview.title,
    fileName: preview.fileName,
    state: preview.state === "queued" || preview.state === "running" ? "pending" : preview.state,
    stateTitle: preview.stateTitle,
    stateText: preview.stateText,
    media: preview.state === "ready" && preview.mediaHref ? {
      href: preview.mediaHref,
      mode: preview.kind === "three-d" ? "image" : "document",
      title: preview.title,
      alt: preview.fileName ?? preview.title
    } : undefined
  }));
  return <DrawingDetailPreview cards={cards} title={null} showHeader={false} dataSection="canonical-drawing-preview" />;
}

function PartCanonicalPreview({
  partNumber,
  preview,
  control,
  onCommitted
}: {
  partNumber: string;
  preview: CanonicalPreviewProjection;
  control: NonNullable<Extract<Detail["data"]["presentation"], { kind: "part" }>["previewSourceControl"]>;
  onCommitted: (result: PartPreviewMutationResult) => void;
}) {
  const sourceMeta = preview.sourceDrawingNumber
    ? `${preview.sourceLabel} · ${preview.sourceDrawingNumber}${preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}`
    : preview.sourceLabel;
  const stateTitle = preview.sourceType === "custom_image" && preview.state === "unavailable"
    ? "自訂圖片無法顯示"
    : preview.state === "pending"
      ? "預覽產生中"
      : preview.state === "delayed"
        ? "預覽處理較久"
        : preview.state === "failed"
          ? "預覽產生失敗"
          : preview.state === "unavailable"
            ? "預覽暫時無法顯示"
            : preview.sourceType === "primary_manufacturing_drawing"
              ? "主要製造圖暫無 3D 預覽"
              : "尚無料號預覽圖";
  const drawingIdentity = preview.sourceDrawingNumber
    ? `${preview.sourceDrawingNumber}${preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}`
    : "主要製造圖";
  const stateText = preview.sourceType === "none"
    ? "尚未連結主要製造圖，也沒有自訂圖片。"
    : preview.sourceType === "custom_image" && preview.state === "unavailable"
      ? "目前指定的圖片已遺失或無法讀取；請更換圖片，或明確恢復使用主要製造圖。"
      : preview.state === "missing"
        ? `${drawingIdentity} 已連結，但目前沒有可用的 3D 預覽。`
        : preview.state === "pending" || preview.state === "delayed"
          ? `${drawingIdentity} 的 3D 預覽正在處理。`
          : preview.state === "failed"
            ? `${drawingIdentity} 的 3D 預覽產生失敗。`
            : `${drawingIdentity} 的 3D 預覽暫時無法讀取。`;
  return <CanonicalPreviewPanel
    cards={[{
      key: "part",
      title: "料號預覽",
      fileName: preview.media?.fileName ?? null,
      state: preview.state,
      stateTitle,
      stateText,
      visual: "image",
      media: preview.media ? { ...preview.media, title: "料號預覽", alt: preview.alt } : undefined,
      actions: <PartPreviewSourceControl partNumber={partNumber} preview={preview} control={control} onCommitted={onCommitted} />
    }]}
    title="料號預覽"
    meta={sourceMeta}
    layout="single"
    dataSection="canonical-part-preview"
    showCardHeader={false}
  />;
}

function RelationMatrixEditor({ matrix, contractToken, editable, onSaved, onDirtyChange, createAction }: {
  matrix: CanonicalRelationMatrixProjection;
  contractToken: string;
  editable: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  createAction?: ReactNode;
}) {
  const [cells, setCells] = useState(matrix.cells as RelationMatrixCell[]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setCells(matrix.cells as RelationMatrixCell[]); setEditing(false); setError(""); }, [matrix]);
  const changes = useMemo(() => {
    const original = new Map(matrix.cells.map((cell) => [`${cell.drawingNumberId}:${cell.partNumberId}`, cell.relationType]));
    const next = new Map(cells.map((cell) => [`${cell.drawingNumberId}:${cell.partNumberId}`, cell.relationType]));
    const result: Array<{ drawingNumberId: string; partNumberId: string; relationType: RelationMatrixCell["relationType"] | null }> = [];
    const keys = new Set([...original.keys(), ...next.keys()]);
    for (const key of keys) {
      const relationType = next.get(key) ?? null;
      if (original.get(key) === relationType) continue;
      const [drawingNumberId, partNumberId] = key.split(":");
      result.push({ drawingNumberId, partNumberId, relationType });
    }
    return result;
  }, [cells, matrix.cells]);
  useEffect(() => { onDirtyChange(editing && changes.length > 0); }, [changes.length, editing, onDirtyChange]);
  const handleChange = useCallback((change: { drawingNumberId: string; partNumberId: string; relationType: RelationMatrixCell["relationType"] | null }) => {
    setCells((current) => {
      const next = current.filter((cell) => !(cell.drawingNumberId === change.drawingNumberId && cell.partNumberId === change.partNumberId));
      if (change.relationType) {
        const drawing = matrix.drawings.find((item) => item.id === change.drawingNumberId);
        const part = matrix.parts.find((item) => item.id === change.partNumberId);
        if (drawing && part) next.push({ ...change, drawingNumber: drawing.number, partNumber: part.number });
      }
      return next;
    });
  }, [matrix.drawings, matrix.parts]);
  const save = useCallback(async () => {
    if (!editing || !changes.length || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/pdm/relations/${encodeURIComponent(matrix.rootId)}/matrix`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "if-match": `"${matrix.matrixEtag}"`,
          "idempotency-key": crypto.randomUUID(),
          "x-pdm-workbench-contract": contractToken
        },
        body: JSON.stringify({ changes })
      });
      const body = await readJson(response);
      if (!response.ok) { setError(errorMessage(body, "關聯矩陣儲存失敗")); return; }
      setEditing(false);
      onDirtyChange(false);
      onSaved();
    } catch { setError("關聯矩陣儲存失敗"); }
    finally { setSaving(false); }
  }, [changes, contractToken, editing, matrix.matrixEtag, matrix.rootId, onDirtyChange, onSaved, saving]);
  const cancel = useCallback(() => {
    setCells(matrix.cells as RelationMatrixCell[]);
    setEditing(false);
    onDirtyChange(false);
    setError("");
  }, [matrix.cells, onDirtyChange]);
  return <section className="canonical-drawer-matrix"><div className="canonical-drawer-section-heading"><h3>關聯矩陣</h3>{createAction}</div>
    {matrix.issue ? <p className="canonical-error" role="alert" data-anomaly-code={matrix.issue.code}>{matrix.issue.message}</p> : <p className="canonical-drawer-section-note">明確儲存後立即更新正式關聯，不需審核。</p>}
    {error ? <p className="canonical-error" role="alert">{error}</p> : null}
      {matrix.rootId ? <RelationMatrixTable rootCode={matrix.rootCode} drawings={matrix.drawings as RelationMatrixIdentity[]} parts={matrix.parts as RelationMatrixIdentity[]} matrix={cells} editable={editable && editing} onChange={handleChange} /> : matrix.issue ? null : <p className="pdm-relation-empty-line">目前尚未建立圖料根號，暫無可顯示的關聯矩陣。</p>}
    {editable && !editing ? <div className="canonical-matrix-actions"><button type="button" className="primary-button" onClick={() => { setError(""); setEditing(true); }}>編輯關聯</button></div> : null}
    {editable && editing ? <div className="canonical-matrix-actions"><button type="button" className="primary-button" disabled={!changes.length || saving} onClick={() => void save()}>{saving ? "儲存中…" : "儲存關聯"}</button><button type="button" className="secondary-button" disabled={saving} onClick={cancel}>取消</button>{changes.length ? <span role="status">已變更 {changes.length} 格</span> : null}</div> : null}
  </section>;
}

function Drawer({ detail, loading, error, width, canManageAttachments, onStartResize, onClose, onAction, onManageAttachments, onPartPreviewCommitted, onBeforeCreate, onMatrixSaved, onMatrixDirtyChange }: {
  detail: Detail | null; loading: boolean; error: string; onClose: () => void;
  width: number; onStartResize: (clientX: number) => void;
  canManageAttachments: boolean;
  onAction: (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => void;
  onManageAttachments: (row: CanonicalWorkbenchRowDto) => void;
  onPartPreviewCommitted: (row: CanonicalWorkbenchRowDto, result: PartPreviewMutationResult) => void;
  onBeforeCreate: () => boolean;
  onMatrixSaved: () => void;
  onMatrixDirtyChange: (dirty: boolean) => void;
}) {
  const presentation = detail?.data.presentation;
  const footerActions = detail?.data.row.actions.filter((action) => action.key !== "edit_relation_matrix") ?? [];
  const footer = footerActions.length ? <div className="canonical-drawer-actions">{footerActions.map((action) => <button key={action.key} type="button" className={action.key === "void_rd" ? "secondary-button" : "primary-button"} onClick={() => onAction(detail!.data.row, action)}>{action.label}</button>)}</div> : undefined;
  return <PdmEntityDetailDrawer
    open
    width={width}
    ariaLabel="工作台明細"
    title={detail?.data.row.code ?? "明細"}
    subtitle={detail?.data.row.name || undefined}
    status={detail ? <span className="canonical-status-pair"><span className={`canonical-layer is-${detail.data.row.layer}`}>{detail.data.row.layerLabel}</span><span className={`canonical-data-state is-${detail.data.row.dataState}`}>{detail.data.row.dataStateLabel}</span></span> : undefined}
    footer={footer}
    entityType={detail?.data.row.entityType}
    entityCode={detail?.data.row.code}
    sourceContext="canonical-workbench"
    detailFamily="canonical"
    resizeLabel="調整明細欄寬度"
    resizeTitle="拖拉調整明細欄寬度"
    keepOpenSelector="[data-canonical-workbench-row='true'], [data-canonical-preview-card='true']"
    onStartResize={onStartResize}
    onClose={onClose}
  >
    {loading ? <p className="canonical-drawer-message" role="status">正在載入明細…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : detail && presentation ? <div className="pdm-entity-drawer-body canonical-drawer-body">
      <section><h3>目前資料</h3><DetailFields fields={presentation.fields} /></section>
      {presentation.kind === "drawing" ? <DrawingCanonicalPreview previews={presentation.previews} /> : null}
      {presentation.kind === "part" && presentation.preview && presentation.previewSourceControl ? <PartCanonicalPreview
        partNumber={detail.data.row.code}
        preview={presentation.preview}
        control={presentation.previewSourceControl}
        onCommitted={(result) => onPartPreviewCommitted(detail.data.row, result)}
      /> : null}
      {presentation.kind === "part" ? <section data-section="part-attachments"><div className="canonical-drawer-section-heading"><h3>附件</h3>{canManageAttachments ? <button type="button" className="secondary-button" onClick={() => onManageAttachments(detail.data.row)}>管理附件</button> : null}</div>{presentation.files.length ? <ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul> : <p className="canonical-empty">尚無附件</p>}</section> : presentation.files.length ? <section><h3>圖面檔案</h3><ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul></section> : null}
      {presentation.kind === "drawing" || presentation.kind === "part" ? <>
        <RelationMatrixEditor
        matrix={presentation.relationMatrix}
        contractToken={detail.meta.contractToken}
        editable={Boolean(presentation.relationMatrix.rootId) && detail.data.row.actions.some((action) => action.key === "edit_relation_matrix")}
        createAction={presentation.relationMatrix.rootId ? <CanonicalNumberingCreateAction
          surface={presentation.kind}
          rootCode={presentation.relationMatrix.rootCode}
          returnTo={typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`}
          className="secondary-button"
          onBeforeNavigate={onBeforeCreate}
        /> : null}
        onSaved={onMatrixSaved}
        onDirtyChange={onMatrixDirtyChange}
      /></> : null}
      {detail.data.row.handling === "blocked" ? <section className="canonical-blocker"><h3>受阻資訊</h3><p>{detail.data.row.blockerReason || "請系統管理員處理"}</p></section> : null}
      {presentation.kind === "drawing" ? <section><h3>歷史版次清單</h3>{presentation.history.length ? <ul className="canonical-record-list">{presentation.history.map((history) => <li className="canonical-record" key={history.id}><strong>{history.layerLabel} {history.revision}</strong></li>)}</ul> : <p className="canonical-empty">目前沒有歷史版次</p>}</section> : null}
    </div> : null}
  </PdmEntityDetailDrawer>;
}

export function CanonicalPdmWorkbench({ entityType }: { entityType: "drawing" | "part" }) {
  const router = useRouter();
  const config = DOMAIN_CONFIG[entityType];
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: DRAWER_WIDTH_STORAGE_KEYS[entityType] });
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<LayerSelection>({ mode: "all" });
  const [dataState, setDataState] = useState<DataStateSelection>({ mode: "all" });
  const [handling, setHandling] = useState<HandlingSelection>({ mode: "all" });
  const [groups, setGroups] = useState<CanonicalWorkbenchListDto["data"]["groups"]>([]);
  const [totals, setTotals] = useState({ groups: 0, rows: 0 });
  const [contractToken, setContractToken] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [matrixDirty, setMatrixDirty] = useState(false);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [candidateRow, setCandidateRow] = useState<CanonicalWorkbenchRowDto | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateError, setCandidateError] = useState("");
  const [retiredQuery, setRetiredQuery] = useState(false);
  const [layout, setLayout] = useState<CanonicalWorkbenchLayout>("list");
  const [previewByRowKey, setPreviewByRowKey] = useState<Record<string, CanonicalPreviewProjection>>({});
  const [previewCapability, setPreviewCapability] = useState(false);
  const [canManageAttachments, setCanManageAttachments] = useState(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const listRequestRef = useRef(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("query") ?? "");
    setLayer(parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "layer", { allowedValues: config.layerOptions.map((option) => option.value) }));
    setDataState(parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "stage", { allowedValues: DATA_STATE_OPTIONS.map((option) => option.value) }));
    setHandling(parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "handling", { allowedValues: HANDLING_OPTIONS.map((option) => option.value) }));
    const initialDetailKey = url.searchParams.get("detail");
    setDetailKey(initialDetailKey);
    setSelectedRowKey(initialDetailKey);
    setRetiredQuery([...RETIRED_WORKBENCH_QUERY_KEYS].some((key) => url.searchParams.has(key)));
    const rawLayout = url.searchParams.get("layout");
    const urlLayout = normalizeCanonicalWorkbenchLayout(rawLayout);
    if (rawLayout !== null && !urlLayout) replaceLocation({ layout: "list" });
    const storageKey = entityType === "drawing" ? DRAWING_LAYOUT_STORAGE_KEY : PART_LAYOUT_STORAGE_KEY;
    const storedLayout = normalizeCanonicalWorkbenchLayout(window.localStorage.getItem(storageKey));
    setLayout(urlLayout ?? storedLayout ?? "list");
  }, [config.layerOptions, entityType]);

  useEffect(() => {
    if (entityType !== "part") { setCanManageAttachments(false); return; }
    const controller = new AbortController();
    void fetch("/api/numbering/permissions", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { actions?: Record<string, boolean> } : null)
      .then((body) => setCanManageAttachments(body?.actions?.["numbering.attachments.manage"] === true))
      .catch((permissionError) => { if (!(permissionError instanceof Error && permissionError.name === "AbortError")) setCanManageAttachments(false); });
    return () => controller.abort();
  }, [entityType]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (query.trim()) params.set("query", query.trim());
    serializePdmWorkbenchFilterSelection(params, "layer", layer);
    serializePdmWorkbenchFilterSelection(params, "stage", dataState);
    serializePdmWorkbenchFilterSelection(params, "handling", handling);
    return `${config.listEndpoint}${params.size ? `?${params}` : ""}`;
  }, [config.listEndpoint, dataState, handling, layer, query]);

  const load = useCallback(async (cursor?: string | null, append = false) => {
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setLoading(true); setError("");
    if (retiredQuery) {
      setGroups([]); setTotals({ groups: 0, rows: 0 }); setNextCursor(null); setPreviewByRowKey({}); setError("此篩選網址已失效"); setLoading(false); return;
    }
    const separator = listUrl.includes("?") ? "&" : "?";
    try {
      const response = await fetch(cursor ? `${listUrl}${separator}cursor=${encodeURIComponent(cursor)}` : listUrl, { cache: "no-store", signal: controller.signal });
      const body = await readJson(response);
      if (requestId !== listRequestRef.current) return;
      if (!response.ok) { setGroups([]); setTotals({ groups: 0, rows: 0 }); setNextCursor(null); setPreviewByRowKey({}); setError(errorMessage(body, "清單載入失敗")); setLoading(false); return; }
      const result = body as CanonicalWorkbenchListDto;
      setGroups((current) => append ? [...current, ...result.data.groups] : result.data.groups);
      const hasPreviewCapability = result.data.previewByRowKey !== undefined;
      setPreviewCapability(hasPreviewCapability);
      setPreviewByRowKey((current) => append ? { ...current, ...(result.data.previewByRowKey ?? {}) } : (result.data.previewByRowKey ?? {}));
      if (!hasPreviewCapability) { setLayout("list"); replaceLocation({ layout: null }); }
      setTotals({ groups: result.data.totalGroups, rows: result.data.totalRows });
      setNextCursor(result.data.nextCursor); setContractToken(result.meta.contractToken); setLoading(false);
    } catch (requestError) {
      if (requestId !== listRequestRef.current || (requestError instanceof Error && requestError.name === "AbortError")) return;
      setGroups([]); setTotals({ groups: 0, rows: 0 }); setNextCursor(null); setPreviewByRowKey({}); setError("清單載入失敗"); setLoading(false);
    } finally {
      if (requestId === listRequestRef.current) listAbortRef.current = null;
    }
  }, [listUrl, retiredQuery]);

  useEffect(() => { const timer = window.setTimeout(() => { replaceLocation({ query, layer, dataState, handling }); void load(); }, 250); return () => window.clearTimeout(timer); }, [dataState, handling, layer, load, query]);

  const openDetail = useCallback(async (rowKey: string) => {
    const requestId = ++detailRequestRef.current;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setDetail(null); setDetailLoading(true); setDetailError("");
    try {
      const response = await fetch(`${config.detailEndpoint}/${encodeURIComponent(rowKey)}`, { cache: "no-store", signal: controller.signal });
      const body = await readJson(response);
      if (requestId !== detailRequestRef.current) return;
      if (!response.ok) setDetailError(errorMessage(body, "明細載入失敗"));
      else { const result = body as Detail; setDetail(result); setContractToken(result.meta.contractToken); }
    } catch (requestError) {
      if (requestId !== detailRequestRef.current || (requestError instanceof Error && requestError.name === "AbortError")) return;
      setDetailError("明細載入失敗");
    } finally {
      if (requestId === detailRequestRef.current) {
        detailAbortRef.current = null;
        setDetailLoading(false);
      }
    }
  }, [config.detailEndpoint]);

  const confirmDiscardMatrix = useCallback(() => {
    if (!matrixDirty) return true;
    return window.confirm("關聯矩陣尚未儲存，確定要離開並捨棄變更嗎？");
  }, [matrixDirty]);
  const selectDetail = useCallback((rowKey: string) => {
    if (rowKey !== selectedRowKey && !confirmDiscardMatrix()) return;
    setMatrixDirty(false);
    setSelectedRowKey(rowKey); setDetailKey(rowKey); replaceLocation({ detail: rowKey });
  }, [confirmDiscardMatrix, selectedRowKey]);

  useEffect(() => { if (detailKey) void openDetail(detailKey); }, [detailKey, openDetail]);
  const changeLayout = useCallback((next: CanonicalWorkbenchLayout) => {
    if (!previewCapability) return;
    setLayout(next);
    window.localStorage.setItem(entityType === "drawing" ? DRAWING_LAYOUT_STORAGE_KEY : PART_LAYOUT_STORAGE_KEY, next);
    replaceLocation({ layout: next });
  }, [entityType, previewCapability]);
  const closeDetail = useCallback(() => {
    if (!confirmDiscardMatrix()) return;
    detailRequestRef.current += 1;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    setDetailKey(null); setDetail(null); setDetailLoading(false); setDetailError(""); setMatrixDirty(false); replaceLocation({ detail: null });
    window.requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
  }, [confirmDiscardMatrix]);
  const manageAttachments = useCallback((row: CanonicalWorkbenchRowDto) => {
    if (!confirmDiscardMatrix()) return;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.push(`/parts/${encodeURIComponent(row.code)}/attachments?returnTo=${encodeURIComponent(returnTo)}`);
  }, [confirmDiscardMatrix, router]);

  const flatRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const partPreviewCommitted = useCallback((row: CanonicalWorkbenchRowDto, result: PartPreviewMutationResult) => {
    setDetail((current) => {
      if (!current || current.data.presentation.kind !== "part" || current.data.row.entityId !== row.entityId || !current.data.presentation.previewSourceControl) return current;
      return {
        ...current,
        data: {
          ...current.data,
          presentation: {
            ...current.data.presentation,
            preview: result.preview,
            previewSourceControl: {
              ...current.data.presentation.previewSourceControl,
              settingRowVersion: result.settingRowVersion
            }
          }
        }
      };
    });
    setPreviewByRowKey((current) => {
      const next = { ...current };
      for (const candidate of flatRows) if (candidate.entityId === row.entityId) next[candidate.rowKey] = result.preview;
      return next;
    });
  }, [flatRows]);
  const handleListSelect = useCallback((row: CanonicalWorkbenchRowDto, options: { openDetail: boolean }) => {
    setSelectedRowKey(row.rowKey);
    if (options.openDetail) selectDetail(row.rowKey);
  }, [selectDetail]);
  const handleListOpen = useCallback((row: CanonicalWorkbenchRowDto) => selectDetail(row.rowKey), [selectDetail]);
  const listKeyboard = useListKeyboardShortcuts({
    items: flatRows,
    selectedKey: selectedRowKey,
    listRef,
    rowSelector: "[data-canonical-workbench-row='true']",
    getKey: (row) => row.rowKey,
    getCopyText: (row) => row.code,
    onSelect: handleListSelect,
    onOpenDetail: handleListOpen,
    onCloseDetail: closeDetail,
    isDetailOpen: Boolean(detailKey || detailLoading)
  });

  // The drawer keeps its own controls focusable. When focus is inside the
  // drawer, route the same list navigation to the next/previous row so the
  // user can inspect consecutive records without closing the drawer first.
  useEffect(() => {
    if (!detailKey) return;
    function handleDrawerNavigation(event: KeyboardEvent) {
      if (event.defaultPrevented || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
      if (!flatRows.length) return;
      const currentIndex = flatRows.findIndex((row) => row.rowKey === selectedRowKey);
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = event.key === "ArrowDown"
        ? Math.min(fallbackIndex + 1, flatRows.length - 1)
        : Math.max(currentIndex === -1 ? flatRows.length - 1 : currentIndex - 1, 0);
      const nextRow = flatRows[nextIndex];
      if (!nextRow || nextRow.rowKey === selectedRowKey) return;
      event.preventDefault();
      selectDetail(nextRow.rowKey);
    }
    window.addEventListener("keydown", handleDrawerNavigation);
    return () => window.removeEventListener("keydown", handleDrawerNavigation);
  }, [detailKey, flatRows, selectedRowKey, selectDetail]);

  const command = useCallback(async (row: CanonicalWorkbenchRowDto, href: string, body: Record<string, unknown>) => {
    setBusy(true); setError("");
    const response = await fetch(href, {
      method: "POST", headers: { "content-type": "application/json", "if-match": `\"${row.rowVersion}\"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken }, body: JSON.stringify(body)
    });
    const result = await readJson(response); setBusy(false);
    if (!response.ok) { const message = errorMessage(result, "操作失敗"); setError(message); return null; }
    closeDetail(); await load(); return result;
  }, [closeDetail, contractToken, load]);

  const onAction = useCallback(async (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => {
    if (!action.href || busy) return;
    if (action.key === "edit" || action.key === "review") { router.push(action.href); return; }
    if (action.key === "advance") {
      setCandidateRow(row); setCandidates([]); setCandidateError(""); setBusy(true);
      const response = await fetch(action.href, { cache: "no-store" }); const body = await readJson(response); setBusy(false);
      if (!response.ok) setCandidateError(errorMessage(body, "無法取得可用版次"));
      else { const result = body as { data: { candidates: Candidate[] }; meta: { contractToken: string } }; setCandidates(result.data.candidates); setContractToken(result.meta.contractToken); }
      return;
    }
    if (action.key === "void_rd" && !window.confirm(`核准後，${row.layerLabel} 將不再有效，這一系列研發版會從目前清單移除，且無法復原。確定送出申請？`)) return;
    const result = await command(row, action.href, action.key === "void_rd" ? { rowKey: row.rowKey } : {});
    if (action.key === "create_change" && result) {
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId && row.entityType === "part") router.push(`/parts/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
      if (workId && row.entityType === "drawing") router.push(`/numbering/drawings/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [busy, command, router]);

  const createRevision = useCallback(async (candidate: Candidate) => {
    if (!candidateRow || !candidate.candidateToken) return;
    const href = `/api/pdm/drawings/${encodeURIComponent(candidateRow.entityId)}/revision-works`;
    const result = await command(candidateRow, href, { sourceRowKey: candidateRow.rowKey, candidateToken: candidate.candidateToken });
    if (result) {
      setCandidateRow(null); setCandidates([]);
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId) router.push(`/numbering/drawings/${encodeURIComponent(candidateRow.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [candidateRow, command, router]);

  const resetRetiredUrl = useCallback(() => {
    const url = new URL(window.location.href);
    ["view", "history", "workStatus", "recordStatus", "dataStatus", "humanStatus", "responsibilityStatus", "viewerStatus", "availabilityScope", "lane", "versionLane"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}`); setRetiredQuery(false);
  }, []);

  return <main className="canonical-workbench">
    <header className="canonical-workbench-header"><h1>{config.title}</h1><div className="canonical-workbench-header-actions">{totals.rows > 0 ? <output className="canonical-workbench-result-count" aria-live="polite" aria-label={`已顯示 ${flatRows.length} 筆，共 ${totals.rows} 筆`}>{flatRows.length} / {totals.rows} 筆</output> : null}<CanonicalNumberingCreateAction surface={entityType} />{previewCapability ? <PdmWorkbenchLayoutSwitch value={layout} onChange={changeLayout} disabled={busy} /> : null}<button type="button" className="icon-button" onClick={() => void load()} disabled={loading || busy} title="重新整理" aria-label="重新整理"><RefreshCw size={17} aria-hidden="true" /></button></div></header>
    <section className="canonical-toolbar" aria-label="清單篩選">
      <label className="canonical-search" htmlFor={searchId}><span>搜尋</span><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.searchPlaceholder} /></label>
      <PdmWorkbenchMultiSelectFilter label="版本" value={layer} options={config.layerOptions} onApply={(value) => setLayer(value)} />
      <PdmWorkbenchMultiSelectFilter label="資料狀態" value={dataState} options={DATA_STATE_OPTIONS} onApply={(value) => setDataState(value)} />
      <PdmWorkbenchMultiSelectFilter label="處理" value={handling} options={HANDLING_OPTIONS} onApply={(value) => setHandling(value)} />
    </section>
    {error ? <div className="canonical-error" role="alert"><span>{error}</span>{error === "此篩選網址已失效" ? <button type="button" className="secondary-button" onClick={resetRetiredUrl}>清除舊篩選</button> : null}</div> : null}
    <section className="canonical-list" aria-busy={loading}>
      {loading ? <div className="canonical-list-meta" role="status">更新中…</div> : null}
      {previewCapability && layout === "preview" ? <CanonicalEntityPreviewGallery
        rows={flatRows}
        previewByRowKey={previewByRowKey}
        selectedKey={selectedRowKey}
        loading={loading}
        onSelect={(row) => setSelectedRowKey(row.rowKey)}
        onOpen={(row) => selectDetail(row.rowKey)}
        onCloseDetail={closeDetail}
      /> : <div ref={listRef} className="canonical-table-wrap" role="region" aria-label="工作台資料清單" tabIndex={0} aria-keyshortcuts={listKeyboard.shortcuts} onKeyDown={listKeyboard.handleKeyDown}><table><thead><tr><th>編號</th><th>品名</th><th>版本</th><th>資料狀態</th><th>處理</th></tr></thead><tbody>
        {groups.map((group) => group.rows.map((row, index) => <tr key={row.rowKey} data-canonical-workbench-row="true" data-row-key={row.rowKey} tabIndex={0} aria-selected={selectedRowKey === row.rowKey} className={`${index === 0 ? "is-group-first" : ""} is-${row.layer}${selectedRowKey === row.rowKey ? " is-selected" : ""}`} onClick={() => selectDetail(row.rowKey)}>
          <td><button type="button" className="canonical-row-open" onClick={(event) => { event.stopPropagation(); selectDetail(row.rowKey); }}>{row.code}</button>{index === 0 ? null : <span className="canonical-branch-mark" aria-label="同一編號的另一資料列">↳</span>}</td><td title={row.name || undefined}>{row.name || "—"}</td><td><span className={`canonical-layer is-${row.layer}`}>{row.layerLabel}</span></td><td><span className={`canonical-data-state is-${row.dataState}`}>{row.dataStateLabel}</span></td><td><span className={`canonical-handling is-${row.handling}`}>{row.handlingLabel}</span></td>
        </tr>))}
        {!loading && !groups.length && !error ? <tr><td colSpan={5} className="canonical-empty">沒有符合條件的資料</td></tr> : null}
      </tbody></table></div>}
      {nextCursor ? <button type="button" className="secondary-button canonical-load-more" disabled={loading} onClick={() => void load(nextCursor, true)}>載入更多</button> : null}
    </section>
    {detailKey ? <Drawer detail={detail} loading={detailLoading} error={detailError} width={drawerWidth} canManageAttachments={canManageAttachments} onStartResize={startDrawerResize} onClose={closeDetail} onAction={onAction} onManageAttachments={manageAttachments} onPartPreviewCommitted={partPreviewCommitted} onBeforeCreate={confirmDiscardMatrix} onMatrixSaved={() => { setMatrixDirty(false); if (detailKey) void openDetail(detailKey); }} onMatrixDirtyChange={setMatrixDirty} /> : null}
    {candidateRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-advance-title"><header><div><h2 id="canonical-advance-title">選擇進版方式</h2><p>{candidateRow.code} · {candidateRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setCandidateRow(null)}>關閉</button></header>{candidateError ? <p className="canonical-error" role="alert">{candidateError}</p> : null}<div className="canonical-candidates">{candidates.map((candidate) => <button type="button" key={candidate.kind} disabled={!candidate.enabled || busy} onClick={() => void createRevision(candidate)}><strong>{candidate.label}</strong>{candidate.reason ? <small>{candidate.reason}</small> : null}</button>)}</div>{busy && !candidates.length ? <p role="status">正在取得可用版次…</p> : null}</section></div> : null}
  </main>;
}
