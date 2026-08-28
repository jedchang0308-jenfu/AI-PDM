"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { RETIRED_WORKBENCH_QUERY_KEYS } from "@/lib/pdm-canonical-workbench-contract";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { RelationMatrixTable, type RelationMatrixCell, type RelationMatrixIdentity } from "@/components/relation-matrix-table";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { PdmWorkbenchLayoutSwitch } from "@/components/pdm-workbench-layout-switch";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { CanonicalEntityPreviewGallery } from "@/components/canonical-pdm-preview-gallery";
import { CanonicalPreviewPanel } from "@/components/canonical-preview-panel";
import { PartPreviewSourceControl } from "@/components/part-preview-source-control";
import { PartBomContext } from "@/components/part-bom-context";
import { PartStructureClassification } from "@/components/part-structure-classification";
import { CanonicalNumberingCreateAction } from "@/components/canonical-numbering-create-action";
import { NumberSortHeader } from "@/components/number-sort-header";
import { DRAWING_LAYOUT_STORAGE_KEY, PART_LAYOUT_STORAGE_KEY, normalizeCanonicalWorkbenchLayout, type CanonicalPreviewProjection, type CanonicalWorkbenchLayout } from "@/lib/pdm-canonical-preview";
import type { PartPreviewMutationResult } from "@/lib/pdm-part-preview";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { ACTIVE_DRAWING_PURPOSE_CODES, displayDrawingPurposeLabel, type ActiveDrawingPurposeCode } from "@/lib/numbering-identity";
import { CANONICAL_NUMBERING_ITEM_KIND_OPTIONS, type CanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import type {
  CanonicalHandling,
  CanonicalLayer,
  CanonicalWorkbenchSortField,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchDetailDto,
  CanonicalWorkbenchListDto,
  CanonicalWorkbenchRowDto,
  CanonicalRelationMatrixProjection,
  CanonicalDetailReadModelRow
} from "@/lib/pdm-canonical-workbench-contract";

type DomainConfig = {
  entityType: "drawing" | "part";
  title: string;
  listEndpoint: string;
  detailEndpoint: string;
  searchPlaceholder: string;
  layerFilterLabel: string;
  layerHeader: string;
  layerOptions: Array<{ value: CanonicalLayer; label: string }>;
};

const DOMAIN_CONFIG: Record<"drawing" | "part", DomainConfig> = {
  drawing: {
    entityType: "drawing",
    title: "圖號工作台",
    listEndpoint: "/api/numbering/drawings/workbench",
    detailEndpoint: "/api/numbering/drawings/workbench",
    searchPlaceholder: "搜尋圖號、品名或料號",
    layerFilterLabel: "版本",
    layerHeader: "版本",
    layerOptions: [{ value: "production", label: "量產版" }, { value: "rd", label: "研發版" }]
  },
  part: {
    entityType: "part",
    title: "料號工作台",
    listEndpoint: "/api/parts/workbench",
    detailEndpoint: "/api/parts/workbench",
    searchPlaceholder: "搜尋料號、品名或圖號",
    layerFilterLabel: "資料",
    layerHeader: "資料",
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

type Detail = CanonicalWorkbenchDetailDto;
type Candidate = { kind: "production" | "rd"; label: string; target: { major: number; minor: number; label: string }; enabled: boolean; reason: string | null; candidateToken: string | null };
type RevisionTargetResponse = {
  data: {
    source: { rowKey: string; rowVersion: number; revision: { major: number; minor: number; label: string }; basisState: "current" | "stale" | "preproduction" };
    basisState: "current" | "stale" | "preproduction";
    manualRule: { enabled: boolean; major: number | null; minExclusive: number | null; maxInclusive: number; reason: string | null };
    candidates: Candidate[];
    recovery: { label: string; targetsHref: string } | null;
  };
  meta: { contractToken: string };
};
type ApiError = { error?: { code?: string; message?: string; correlationId?: string } };
type HistoryRevisionDetail = {
  data: {
    revision: { revision: string; lifecycleState: string };
    files: Array<{ id: string; role: string; displayName: string; fileName: string; mimeType: string; fileSize: number; contentHash: string; downloadHref: string; isPrimary: boolean }>;
  };
  meta: { readOnly: true };
};
type LayerSelection = PdmWorkbenchFilterSelection<CanonicalLayer>;
type HandlingSelection = PdmWorkbenchFilterSelection<CanonicalHandling>;
type PurposeSelection = PdmWorkbenchFilterSelection<ActiveDrawingPurposeCode>;
type ItemKindSelection = PdmWorkbenchFilterSelection<CanonicalNumberingItemKind>;
type SeriesSelection = PdmWorkbenchFilterSelection<string>;
type SeriesFilterOption = { value: string; label: string };

const DRAWING_PURPOSE_OPTIONS = ACTIVE_DRAWING_PURPOSE_CODES.map((value) => ({
  value,
  label: `${value} ${displayDrawingPurposeLabel(value)}`
}));

const DRAWER_WIDTH_STORAGE_KEYS: Record<"drawing" | "part", string> = {
  drawing: "pdm-drawing-detail-drawer-width",
  part: "pdm-part-detail-drawer-width"
};

function errorMessage(body: unknown, fallback: string) {
  const api = body as ApiError;
  if (typeof (body as { message?: unknown } | null)?.message === "string" && String((body as { message: string }).message).trim()) return String((body as { message: string }).message).trim();
  if (typeof (body as { error?: unknown } | null)?.error === "string" && String((body as { error: string }).error).trim()) return String((body as { error: string }).error).trim();
  return api?.error?.message?.trim() || fallback;
}

function errorCode(body: unknown) {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return String((error as { code: string }).code);
  return null;
}

async function readJson(response: Response) {
  try { return await response.json() as unknown; }
  catch { return null; }
}

function replaceLocation(patch: { query?: string; layer?: LayerSelection; handling?: HandlingSelection; purposeFilter?: PurposeSelection; itemKindFilter?: ItemKindSelection; seriesFilter?: SeriesSelection; materialFilter?: string; colorFilter?: string; sortBy?: CanonicalWorkbenchSortField; sort?: "asc" | "desc"; detail?: string | null; historyRevision?: string | null; layout?: CanonicalWorkbenchLayout | null; cursor?: string | null; direction?: "after" | "before"; pageIndex?: number; historyMode?: "replace" | "push" }) {
  const url = new URL(window.location.href);
  const queryChanged = patch.query !== undefined || patch.layer !== undefined || patch.handling !== undefined || patch.purposeFilter !== undefined || patch.itemKindFilter !== undefined || patch.seriesFilter !== undefined || patch.materialFilter !== undefined || patch.colorFilter !== undefined || patch.sortBy !== undefined || patch.sort !== undefined;
  if (queryChanged && patch.cursor === undefined) { url.searchParams.delete("cursor"); url.searchParams.delete("direction"); url.searchParams.delete("page"); }
  if (patch.query !== undefined) {
    if (patch.query.trim()) url.searchParams.set("query", patch.query.trim());
    else url.searchParams.delete("query");
  }
  if (patch.layer !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "layer", patch.layer);
  if (patch.handling !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "handling", patch.handling);
  if (patch.purposeFilter !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "purpose", patch.purposeFilter, { allowedValues: ACTIVE_DRAWING_PURPOSE_CODES });
  if (patch.itemKindFilter !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "itemKind", patch.itemKindFilter, { allowedValues: CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((option) => option.value) });
  if (patch.seriesFilter !== undefined) serializePdmWorkbenchFilterSelection(url.searchParams, "series", patch.seriesFilter);
  const csvPatches: Array<[string, string | undefined]> = [["material", patch.materialFilter], ["color", patch.colorFilter]];
  for (const [key, value] of csvPatches) if (value !== undefined) { url.searchParams.delete(key); for (const entry of csvFilterValues(value)) url.searchParams.append(key, entry); }
  if (patch.sortBy !== undefined) {
    if (patch.sortBy === "name") url.searchParams.set("sortBy", "name");
    else url.searchParams.delete("sortBy");
  }
  if (patch.sort !== undefined) {
    if (patch.sort === "desc") url.searchParams.set("sort", "desc");
    else url.searchParams.delete("sort");
  }
  if (patch.detail !== undefined) {
    if (patch.detail) url.searchParams.set("detail", patch.detail);
    else { url.searchParams.delete("detail"); url.searchParams.delete("historyRevision"); }
  }
  if (patch.historyRevision !== undefined) {
    if (patch.historyRevision) url.searchParams.set("historyRevision", patch.historyRevision);
    else url.searchParams.delete("historyRevision");
  }
  if (patch.layout !== undefined) {
    if (patch.layout) url.searchParams.set("layout", patch.layout);
    else url.searchParams.delete("layout");
  }
  if (patch.cursor !== undefined) {
    if (patch.cursor) url.searchParams.set("cursor", patch.cursor); else url.searchParams.delete("cursor");
    if (patch.cursor && patch.direction) url.searchParams.set("direction", patch.direction); else url.searchParams.delete("direction");
  }
  if (patch.pageIndex !== undefined) {
    if (patch.pageIndex > 0) url.searchParams.set("page", String(Math.floor(patch.pageIndex)));
    else url.searchParams.delete("page");
  }
  const write = patch.historyMode === "push" ? window.history.pushState : window.history.replaceState;
  write.call(window.history, {}, "", `${url.pathname}${url.search}${url.hash}`);
}

function csvFilterValues(value: string) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function parseCsvFilterSelectionForBrowser(params: URLSearchParams, key: string): SeriesSelection {
  const normalized = new URLSearchParams();
  for (const value of params.getAll(key).flatMap(csvFilterValues)) normalized.append(key, value);
  return parsePdmWorkbenchFilterSelectionForBrowser(normalized, key);
}

function seriesFilterOptionsFromResponse(body: unknown): SeriesFilterOption[] {
  const values = body && typeof body === "object" && Array.isArray((body as { seriesCodeOptions?: unknown }).seriesCodeOptions)
    ? (body as { seriesCodeOptions: unknown[] }).seriesCodeOptions
    : [];
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-Hant"))
    .map((value) => ({ value, label: value }));
}

function appendCsvFilter(params: URLSearchParams, key: string, value: string) {
  for (const entry of csvFilterValues(value)) params.append(key, entry);
}

function DetailFields({ fields }: { fields: Detail["data"]["presentation"]["fields"] }) {
  if (!fields.length) return <p className="canonical-empty">無資料</p>;
  return <dl className="canonical-field-grid">{fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}

function DetailReadModelRows({ rows }: { rows: CanonicalDetailReadModelRow[] }) {
  return <div className="canonical-detail-read-model-rows">
    <div className="canonical-detail-read-model-header" aria-hidden="true"><span>欄位</span><span>值</span><span /></div>
    {rows.map((row) => <details className="canonical-detail-read-model-row" key={row.key}>
      <summary>
        <span className="canonical-detail-read-model-label">{row.label}</span>
        <strong className="canonical-detail-read-model-value">{row.value}</strong>
        <span className="canonical-detail-read-model-toggle" aria-hidden="true">⌄</span>
      </summary>
      {row.details.length ? <dl className="canonical-detail-read-model-details">{row.details.map((detail) => <div key={`${row.key}-${detail.label}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : null}
    </details>)}
  </div>;
}

function DetailRecognitionSections({ detail }: { detail: Detail }) {
  const recognition = detail.data.presentation.recognition;
  const sections = detail.data.presentation.kind === "part"
    ? [
        { key: "part-attributes", title: "料號屬性", rows: recognition.partAttributes },
        { key: "controlled-notes", title: "受控註記", rows: recognition.controlledNotes },
        { key: "engineering-evidence", title: "辨識證據", rows: recognition.engineeringEvidence }
      ]
    : [
        { key: "revision-metadata", title: "版次資料", rows: recognition.revisionMetadata },
        { key: "controlled-notes", title: "受控註記", rows: recognition.controlledNotes },
        { key: "engineering-evidence", title: "辨識證據", rows: recognition.engineeringEvidence }
      ];
  return <>{sections.filter((section) => section.rows.length > 0).map((section) => <section className="canonical-recognition-section" data-section={section.key} key={section.key}>
    <h3>{section.title}</h3>
    <DetailReadModelRows rows={section.rows} />
  </section>)}</>;
}

function DrawingCanonicalPreview({ previews, relationAction }: { previews: [DrawingPreviewSlotModel, DrawingPreviewSlotModel]; relationAction?: ReactNode }) {
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
  return <DrawingDetailPreview cards={cards} title={null} showHeader={false} headerActions={relationAction} dataSection="canonical-drawing-preview" />;
}

function PartCanonicalPreview({
  partNumber,
  preview,
  control,
  onCommitted,
  relationAction
}: {
  partNumber: string;
  preview: CanonicalPreviewProjection;
  control: NonNullable<Extract<Detail["data"]["presentation"], { kind: "part" }>["previewSourceControl"]>;
  onCommitted: (result: PartPreviewMutationResult) => void;
  relationAction?: ReactNode;
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
    headerActions={relationAction}
  />;
}

function RelationMatrixEditor({ matrix, contractToken, editable, editing, onEditingChange, onSaved, onDirtyChange, onOpenDrawing, onOpenPart, createAction }: {
  matrix: CanonicalRelationMatrixProjection;
  contractToken: string;
  editable: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onOpenDrawing: (detailHref: string) => void;
  onOpenPart: (detailHref: string) => void;
  createAction?: ReactNode;
}) {
  const [cells, setCells] = useState(matrix.cells as RelationMatrixCell[]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { setCells(matrix.cells as RelationMatrixCell[]); onEditingChange(false); setError(""); }, [matrix, onEditingChange]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
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
      onEditingChange(false);
      onDirtyChange(false);
      onSaved();
    } catch { setError("關聯矩陣儲存失敗"); }
    finally { setSaving(false); }
  }, [changes, contractToken, editing, matrix.matrixEtag, matrix.rootId, onDirtyChange, onEditingChange, onSaved, saving]);
  const cancel = useCallback(() => {
    setCells(matrix.cells as RelationMatrixCell[]);
    onEditingChange(false);
    onDirtyChange(false);
    setError("");
  }, [matrix.cells, onDirtyChange, onEditingChange]);
  return <section className="canonical-drawer-matrix"><div className="canonical-drawer-section-heading"><h3>關聯矩陣</h3>{createAction}</div>
    {matrix.issue ? <p className="canonical-error" role="alert" data-anomaly-code={matrix.issue.code}>{matrix.issue.message}</p> : null}
    {error ? <p className="canonical-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p> : null}
      {matrix.rootId ? <RelationMatrixTable rootCode={matrix.rootCode} drawings={matrix.drawings as RelationMatrixIdentity[]} parts={matrix.parts as RelationMatrixIdentity[]} matrix={cells} editable={editable && editing} onChange={handleChange} onOpenDrawing={onOpenDrawing} onOpenPart={onOpenPart} /> : matrix.issue ? null : <p className="pdm-relation-empty-line">目前尚未建立圖料根號，暫無可顯示的關聯矩陣。</p>}
    {editable && editing ? <div className="canonical-matrix-actions"><button type="button" className="primary-button" disabled={!changes.length || saving} onClick={() => void save()}>{saving ? "儲存中…" : "儲存關聯"}</button><button type="button" className="secondary-button" disabled={saving} onClick={cancel}>取消</button>{changes.length ? <span role="status">已變更 {changes.length} 格</span> : null}</div> : null}
  </section>;
}

function DrawingHistoryRevision({ drawingId, revisionId, onBack }: { drawingId: string; revisionId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<HistoryRevisionDetail | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(`/api/numbering/drawings/${encodeURIComponent(drawingId)}/history/${encodeURIComponent(revisionId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) throw new Error(errorMessage(body, "歷史版次載入失敗"));
        setData(body as HistoryRevisionDetail);
      })
      .catch((requestError: unknown) => { if (!(requestError instanceof Error && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "歷史版次載入失敗"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [drawingId, revisionId]);
  return <section className="canonical-history-detail" aria-label="歷史版次明細">
    <div className="canonical-drawer-section-heading"><h3>歷史版次明細</h3><button type="button" className="secondary-button" onClick={onBack}>返回版次清單</button></div>
    {loading ? <p className="canonical-drawer-message" role="status">正在載入指定版次…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : data ? <><p className="canonical-history-readonly">唯讀 · {data.data.revision.revision} · {data.data.revision.lifecycleState}</p><ul className="canonical-record-list">{data.data.files.map((file) => <li className="canonical-record" key={file.id}><div><strong>{file.displayName || file.fileName}</strong><small>{file.role} · {file.fileSize} bytes · {file.contentHash || "無雜湊"}</small></div><a className="secondary-button" href={file.downloadHref}>下載</a></li>)}</ul>{!data.data.files.length ? <p className="canonical-empty">此版次沒有可讀檔案。</p> : null}</> : null}
  </section>;
}

function Drawer({ detail, loading, error, width, canManageAttachments, historyRevisionId, onHistoryRevisionChange, onStartResize, onClose, onAction, onManageAttachments, onPartPreviewCommitted, onBeforeCreate, onMatrixSaved, onMatrixDirtyChange, onOpenMatrixDrawing, onOpenMatrixPart }: {
  detail: Detail | null; loading: boolean; error: string; onClose: () => void;
  width: number; onStartResize: (clientX: number) => void;
  canManageAttachments: boolean;
  historyRevisionId: string | null;
  onHistoryRevisionChange: (revisionId: string | null) => void;
  onAction: (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => void;
  onManageAttachments: (row: CanonicalWorkbenchRowDto) => void;
  onPartPreviewCommitted: (row: CanonicalWorkbenchRowDto, result: PartPreviewMutationResult) => void;
  onBeforeCreate: () => boolean;
  onMatrixSaved: () => void;
  onMatrixDirtyChange: (dirty: boolean) => void;
  onOpenMatrixDrawing: (detailHref: string) => void;
  onOpenMatrixPart: (detailHref: string) => void;
}) {
  const [matrixEditing, setMatrixEditing] = useState(false);
  const presentation = detail?.data.presentation;
  const relationMatrix = presentation?.relationMatrix;
  const relationEditable = Boolean(relationMatrix?.rootId)
    && (relationMatrix?.drawings.length ?? 0) > 0
    && (relationMatrix?.parts.length ?? 0) > 0
    && Boolean(detail?.data.row.actions.some((action) => action.key === "edit_relation_matrix"));
  useEffect(() => { setMatrixEditing(false); }, [detail?.data.row.rowKey]);
  const relationAction = relationEditable && !matrixEditing
    ? <button type="button" className="secondary-button canonical-preview-relation-action" data-canonical-relation-edit="true" onClick={() => setMatrixEditing(true)}>編輯關聯</button>
    : null;
  const footerActions = detail?.data.row.actions.filter((action) => action.key !== "edit_relation_matrix") ?? [];
  const footer = footerActions.length ? <div className="canonical-drawer-actions">{footerActions.map((action) => <button key={action.key} type="button" className={action.key === "void_rd" ? "secondary-button" : "primary-button"} onClick={() => onAction(detail!.data.row, action)}>{action.label}</button>)}</div> : undefined;
  return <PdmEntityDetailDrawer
    open
    width={width}
    ariaLabel="工作台明細"
    title={detail?.data.row.code ?? "明細"}
    subtitle={detail?.data.row.name || undefined}
    status={detail ? <span className="canonical-status-pair"><span className={`canonical-layer is-${detail.data.row.layer}`}>{detail.data.row.layerLabel}</span><span className={`canonical-handling is-${detail.data.row.handling}`}>{detail.data.row.handlingLabel}</span></span> : undefined}
    footer={footer}
    entityType={detail?.data.row.entityType}
    entityCode={detail?.data.row.code}
    sourceContext="canonical-workbench"
    detailFamily="canonical"
    resizeLabel="調整明細欄寬度"
    resizeTitle="拖拉調整明細欄寬度"
    keepOpenSelector="[data-canonical-workbench-row='true'], [data-canonical-preview-card='true'], .canonical-modal"
    onStartResize={onStartResize}
    onClose={onClose}
  >
    {loading ? <p className="canonical-drawer-message" role="status">正在載入明細…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : detail && presentation ? <div className="pdm-entity-drawer-body canonical-drawer-body">
       <section><h3>目前資料</h3><DetailFields fields={presentation.fields} /></section>
       <DetailRecognitionSections detail={detail} />
       {presentation.kind === "drawing" ? <DrawingCanonicalPreview previews={presentation.previews} relationAction={relationAction} /> : null}
      {presentation.kind === "part" && presentation.preview && presentation.previewSourceControl ? <PartCanonicalPreview
        partNumber={detail.data.row.code}
        preview={presentation.preview}
        control={presentation.previewSourceControl}
        onCommitted={(result) => onPartPreviewCommitted(detail.data.row, result)}
        relationAction={relationAction}
      /> : null}
      {presentation.kind === "part" ? <PartStructureClassification partNumberId={detail.data.row.entityId} contractToken={detail.meta.contractToken} onSaved={onMatrixSaved} /> : null}
      {presentation.kind === "part" ? <PartBomContext context={presentation.bomContext} partNumberId={detail.data.row.entityId} partNumber={detail.data.row.code} /> : null}
      {presentation.kind === "part" ? <section data-section="part-attachments"><div className="canonical-drawer-section-heading"><h3>附件</h3>{canManageAttachments ? <button type="button" className="secondary-button" onClick={() => onManageAttachments(detail.data.row)}>管理附件</button> : null}</div>{presentation.files.length ? <ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul> : <p className="canonical-empty">尚無附件</p>}</section> : presentation.files.length ? <section><h3>圖面檔案</h3><ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul></section> : null}
      {presentation.kind === "drawing" || presentation.kind === "part" ? <>
        <RelationMatrixEditor
        matrix={presentation.relationMatrix}
        contractToken={detail.meta.contractToken}
        editable={relationEditable}
        editing={matrixEditing}
        onEditingChange={setMatrixEditing}
        createAction={presentation.relationMatrix.rootId ? <CanonicalNumberingCreateAction
          surface={presentation.kind}
          rootCode={presentation.relationMatrix.rootCode}
          returnTo={typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`}
          className="secondary-button"
          onBeforeNavigate={onBeforeCreate}
        /> : null}
        onSaved={onMatrixSaved}
        onDirtyChange={onMatrixDirtyChange}
        onOpenDrawing={onOpenMatrixDrawing}
        onOpenPart={onOpenMatrixPart}
      /></> : null}
      {detail.data.row.handling === "blocked" ? <section className="canonical-blocker"><h3>受阻資訊</h3><p>{detail.data.row.blockerReason || "請系統管理員處理"}</p></section> : null}
      {presentation.kind === "drawing" ? historyRevisionId ? <DrawingHistoryRevision drawingId={presentation.history.find((history) => history.id === historyRevisionId)?.drawingId ?? detail.data.row.entityId} revisionId={historyRevisionId} onBack={() => onHistoryRevisionChange(null)} /> : <section><h3>歷史版次清單</h3>{presentation.history.length ? <ul className="canonical-record-list">{presentation.history.map((history) => <li className="canonical-record" key={history.id}><button type="button" className="canonical-history-open" onClick={() => onHistoryRevisionChange(history.id)}><strong>{history.layerLabel} {history.revision}</strong><span>開啟指定版次</span></button></li>)}</ul> : <p className="canonical-empty">目前沒有歷史版次</p>}</section> : null}
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
  const [handling, setHandling] = useState<HandlingSelection>({ mode: "all" });
  const [purposeFilter, setPurposeFilter] = useState<PurposeSelection>({ mode: "all" });
  const [itemKindFilter, setItemKindFilter] = useState<ItemKindSelection>({ mode: "all" });
  const [seriesFilter, setSeriesFilter] = useState<SeriesSelection>({ mode: "all" });
  const [seriesOptions, setSeriesOptions] = useState<SeriesFilterOption[]>([]);
  const [seriesOptionsLoading, setSeriesOptionsLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [sortBy, setSortBy] = useState<CanonicalWorkbenchSortField>("code");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [pageIndex, setPageIndex] = useState(0);
  const [groups, setGroups] = useState<CanonicalWorkbenchListDto["data"]["groups"]>([]);
  const [contractToken, setContractToken] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [historyRevisionId, setHistoryRevisionId] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [matrixDirty, setMatrixDirty] = useState(false);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [candidateRow, setCandidateRow] = useState<CanonicalWorkbenchRowDto | null>(null);
  const [candidateSourceRowKey, setCandidateSourceRowKey] = useState<string | null>(null);
  const [candidateSourceRowVersion, setCandidateSourceRowVersion] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateMode, setCandidateMode] = useState<"recommended" | "manual_minor">("recommended");
  const [candidateKind, setCandidateKind] = useState<"production" | "rd">("rd");
  const [manualMinor, setManualMinor] = useState("");
  const [candidateRecovery, setCandidateRecovery] = useState<RevisionTargetResponse["data"]["recovery"]>(null);
  const [manualRule, setManualRule] = useState<RevisionTargetResponse["data"]["manualRule"] | null>(null);
  const [candidateError, setCandidateError] = useState("");
  const candidateTriggerRef = useRef<HTMLElement | null>(null);
  const manualValidationErrorRef = useRef<string | null>(null);
  const [obsoleteRow, setObsoleteRow] = useState<CanonicalWorkbenchRowDto | null>(null);
  const [obsoleteImpact, setObsoleteImpact] = useState<{ entityType: "drawing_number" | "part_number"; entityId: string; entityCode: string; recordStatus: string; dependencies: Array<{ kind: string; id: string; code: string; disposition: string }>; fingerprint: string; pendingRequestId: string | null } | null>(null);
  const [obsoleteReason, setObsoleteReason] = useState("");
  const [obsoleteError, setObsoleteError] = useState("");
  const [obsoleteLoading, setObsoleteLoading] = useState(false);
  const [retiredQuery, setRetiredQuery] = useState(false);
  const [layout, setLayout] = useState<CanonicalWorkbenchLayout>("list");
  const [previewByRowKey, setPreviewByRowKey] = useState<Record<string, CanonicalPreviewProjection>>({});
  const [previewCapability, setPreviewCapability] = useState(false);
  const [canManageAttachments, setCanManageAttachments] = useState(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const listRequestRef = useRef(0);
  const restoredPageRef = useRef<{ cursor: string | null; direction: "after" | "before" } | null>(null);

  const restoreLocationState = useCallback(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("query") ?? "");
    setLayer(parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "layer", { allowedValues: config.layerOptions.map((option) => option.value) }));
    setHandling(parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "handling", { allowedValues: HANDLING_OPTIONS.map((option) => option.value) }));
    setPurposeFilter(entityType === "drawing"
      ? parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "purpose", { allowedValues: ACTIVE_DRAWING_PURPOSE_CODES })
      : { mode: "all" });
    setItemKindFilter(entityType === "part"
      ? parsePdmWorkbenchFilterSelectionForBrowser(url.searchParams, "itemKind", { allowedValues: CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((option) => option.value) })
      : { mode: "all" });
    setSeriesFilter(parseCsvFilterSelectionForBrowser(url.searchParams, "series"));
    setMaterialFilter(url.searchParams.getAll("material").join(", "));
    setColorFilter(url.searchParams.getAll("color").join(", "));
    setSortBy(url.searchParams.get("sortBy") === "name" ? "name" : "code");
    setSort(url.searchParams.get("sort") === "desc" ? "desc" : "asc");
    const rawPageIndex = Number(url.searchParams.get("page") ?? "0");
    setPageIndex(Number.isSafeInteger(rawPageIndex) && rawPageIndex > 0 ? rawPageIndex : 0);
    restoredPageRef.current = {
      cursor: url.searchParams.get("cursor"),
      direction: url.searchParams.get("direction") === "before" ? "before" : "after"
    };
    const initialDetailKey = url.searchParams.get("detail");
    setDetailKey(initialDetailKey);
    setSelectedRowKey(initialDetailKey);
    setHistoryRevisionId(initialDetailKey ? url.searchParams.get("historyRevision") : null);
    setRetiredQuery([...RETIRED_WORKBENCH_QUERY_KEYS].some((key) => url.searchParams.has(key)));
    const rawLayout = url.searchParams.get("layout");
    const urlLayout = normalizeCanonicalWorkbenchLayout(rawLayout);
    if (rawLayout !== null && !urlLayout) replaceLocation({ layout: "list" });
    const storageKey = entityType === "drawing" ? DRAWING_LAYOUT_STORAGE_KEY : PART_LAYOUT_STORAGE_KEY;
    const storedLayout = normalizeCanonicalWorkbenchLayout(window.localStorage.getItem(storageKey));
    setLayout(urlLayout ?? storedLayout ?? "list");
  }, [config.layerOptions, entityType]);

  useEffect(() => { restoreLocationState(); }, [restoreLocationState]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch("/api/numbering/series-codes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) throw new Error("系列選項載入失敗");
        return body;
      })
      .then((body) => {
        if (!active) return;
        setSeriesOptions(seriesFilterOptionsFromResponse(body));
        setSeriesOptionsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active || requestError instanceof Error && requestError.name === "AbortError") return;
        setSeriesOptions([]);
        setSeriesOptionsLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (entityType !== "part") { setCanManageAttachments(false); return; }
    let active = true;
    void fetch("/api/numbering/permissions", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { actions?: Record<string, boolean> } : null)
      .then((body) => { if (active) setCanManageAttachments(body?.actions?.["numbering.attachments.manage"] === true); })
      .catch(() => { if (active) setCanManageAttachments(false); });
    return () => { active = false; };
  }, [entityType]);

  useEffect(() => {
    if (!candidateRow) return;
    const timer = window.setTimeout(() => {
      const modal = document.querySelector<HTMLElement>(".canonical-revision-modal");
      const preferred = modal?.querySelector<HTMLElement>('input[type="radio"]:checked');
      const fallback = modal?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])");
      (preferred ?? fallback)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidateRow, manualRule]);

  const candidateManualError = useMemo(() => {
    if (candidateMode !== "manual_minor" || !manualRule?.enabled) return null;
    if (!manualMinor) return "請輸入研發小版次。";
    const requestedMinor = Number(manualMinor);
    if (!Number.isSafeInteger(requestedMinor) || requestedMinor > manualRule.maxInclusive) return `小版次不可大於 ${manualRule.maxInclusive}。`;
    if (requestedMinor <= Number(manualRule.minExclusive)) return `小版次必須大於 ${manualRule.minExclusive}。`;
    return null;
  }, [candidateMode, manualMinor, manualRule]);

  useEffect(() => {
    if (!candidateRow) return;
    const previousValidationError = manualValidationErrorRef.current;
    manualValidationErrorRef.current = candidateManualError;
    setCandidateError((current) => candidateManualError ?? (current === previousValidationError ? "" : current));
  }, [candidateManualError, candidateRow]);

  useEffect(() => {
    if (!candidateRow || candidateMode !== "manual_minor") return;
    const modal = document.querySelector<HTMLElement>(".canonical-revision-modal");
    const input = modal?.querySelector<HTMLInputElement>('input[aria-label="自訂研發小版次"]');
    const alert = modal?.querySelector<HTMLElement>(".canonical-error[role='alert']");
    const submit = modal?.querySelector<HTMLButtonElement>(".canonical-modal-actions .primary-button");
    if (candidateManualError && alert) alert.id = "canonical-manual-minor-error";
    input?.setAttribute("aria-invalid", candidateManualError ? "true" : "false");
    if (candidateManualError) input?.setAttribute("aria-describedby", "canonical-manual-minor-error");
    else input?.removeAttribute("aria-describedby");
    if (submit) submit.disabled = busy || Boolean(candidateManualError);
  }, [busy, candidateError, candidateManualError, candidateMode, candidateRow]);

  useEffect(() => {
    if (!candidateRow) return;
    const modal = document.querySelector<HTMLElement>(".canonical-revision-modal");
    if (!modal) return;
    const trigger = candidateTriggerRef.current;
    function handleFocusTrap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = [...modal!.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); modal!.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const closeButton = modal!.querySelector<HTMLButtonElement>("header .secondary-button");
      if (closeButton?.disabled) return;
      event.preventDefault();
      setCandidateRow(null);
    }
    modal.addEventListener("keydown", handleFocusTrap);
    document.addEventListener("keydown", handleEscape);
    return () => {
      modal.removeEventListener("keydown", handleFocusTrap);
      document.removeEventListener("keydown", handleEscape);
      window.requestAnimationFrame(() => trigger?.focus());
    };
  }, [candidateRow]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (query.trim()) params.set("query", query.trim());
    serializePdmWorkbenchFilterSelection(params, "layer", layer);
    serializePdmWorkbenchFilterSelection(params, "handling", handling);
    if (entityType === "drawing") serializePdmWorkbenchFilterSelection(params, "purpose", purposeFilter, { allowedValues: ACTIVE_DRAWING_PURPOSE_CODES });
    if (entityType === "part") serializePdmWorkbenchFilterSelection(params, "itemKind", itemKindFilter, { allowedValues: CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((option) => option.value) });
    serializePdmWorkbenchFilterSelection(params, "series", seriesFilter);
    if (entityType === "part") {
      appendCsvFilter(params, "material", materialFilter);
      appendCsvFilter(params, "color", colorFilter);
    }
    if (sortBy === "name") params.set("sortBy", "name");
    params.set("sort", sort);
    return `${config.listEndpoint}${params.size ? `?${params}` : ""}`;
  }, [colorFilter, config.listEndpoint, entityType, handling, itemKindFilter, layer, materialFilter, purposeFilter, query, seriesFilter, sort, sortBy]);
  const seriesFilterOptions = useMemo(() => {
    const selectedValues = seriesFilter.mode === "some" ? seriesFilter.values : [];
    return seriesFilterOptionsFromResponse({ seriesCodeOptions: [...seriesOptions.map((option) => option.value), ...selectedValues] });
  }, [seriesFilter, seriesOptions]);

  const load = useCallback(async (cursor?: string | null, direction: "after" | "before" = "after") => {
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setLoading(true); setError("");
    if (retiredQuery) {
      setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setError("此篩選網址已失效"); setLoading(false); return;
    }
    const separator = listUrl.includes("?") ? "&" : "?";
    try {
      const response = await fetch(cursor ? `${listUrl}${separator}cursor=${encodeURIComponent(cursor)}&direction=${direction}` : listUrl, { cache: "no-store", signal: controller.signal });
      const body = await readJson(response);
      if (requestId !== listRequestRef.current) return;
      if (!response.ok) { setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setError(errorMessage(body, "清單載入失敗")); setLoading(false); return; }
      const result = body as CanonicalWorkbenchListDto;
      setGroups(result.data.groups);
      const hasPreviewCapability = result.data.previewByRowKey !== undefined;
      setPreviewCapability(hasPreviewCapability);
      setPreviewByRowKey(result.data.previewByRowKey ?? {});
      if (!hasPreviewCapability) { setLayout("list"); replaceLocation({ layout: null }); }
      setNextCursor(result.data.nextCursor); setPreviousCursor(result.data.previousCursor); setContractToken(result.meta.contractToken); setLoading(false);
    } catch (requestError) {
      if (requestId !== listRequestRef.current || (requestError instanceof Error && requestError.name === "AbortError")) return;
      setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setError("清單載入失敗"); setLoading(false);
    } finally {
      if (requestId === listRequestRef.current) listAbortRef.current = null;
    }
  }, [listUrl, retiredQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restoredPage = restoredPageRef.current;
      restoredPageRef.current = null;
      if (restoredPage) {
        void load(restoredPage.cursor, restoredPage.direction);
        return;
      }
      setPageIndex(0);
      replaceLocation({ query, layer, handling, purposeFilter: entityType === "drawing" ? purposeFilter : undefined, itemKindFilter: entityType === "part" ? itemKindFilter : undefined, seriesFilter, materialFilter, colorFilter, sortBy, sort, pageIndex: 0 });
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [colorFilter, entityType, handling, itemKindFilter, layer, load, materialFilter, purposeFilter, query, seriesFilter, sort, sortBy]);
  useEffect(() => {
    const handlePopState = () => restoreLocationState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [restoreLocationState]);

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
    const historyMode = detailKey ? "replace" : "push";
    setHistoryRevisionId(null);
    setSelectedRowKey(rowKey); setDetailKey(rowKey); replaceLocation({ detail: rowKey, historyRevision: null, historyMode });
  }, [confirmDiscardMatrix, detailKey, selectedRowKey]);

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
    setDetailKey(null); setHistoryRevisionId(null); setDetail(null); setDetailLoading(false); setDetailError(""); setMatrixDirty(false); replaceLocation({ detail: null });
    window.requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
  }, [confirmDiscardMatrix]);
  const changeHistoryRevision = useCallback((revisionId: string | null) => {
    setHistoryRevisionId(revisionId);
    replaceLocation({ historyRevision: revisionId, historyMode: "push" });
  }, []);
  const manageAttachments = useCallback((row: CanonicalWorkbenchRowDto) => {
    if (!confirmDiscardMatrix()) return;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.push(`/parts/${encodeURIComponent(row.code)}/attachments?returnTo=${encodeURIComponent(returnTo)}`);
  }, [confirmDiscardMatrix, router]);
  const openMatrixIdentity = useCallback((detailHref: string) => {
    if (!confirmDiscardMatrix()) return;
    setMatrixDirty(false);
    const destination = new URL(detailHref, window.location.href);
    const nextLocation = `${destination.pathname}${destination.search}${destination.hash}`;
    if (destination.pathname === window.location.pathname) router.push(nextLocation);
    else window.location.assign(nextLocation);
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

  const command = useCallback(async (row: CanonicalWorkbenchRowDto, href: string, body: Record<string, unknown>, options?: { onFailure?: (message: string) => void }) => {
    setBusy(true); setError("");
    const response = await fetch(href, {
      method: "POST", headers: { "content-type": "application/json", "if-match": `\"${row.rowVersion}\"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken }, body: JSON.stringify(body)
    });
    const result = await readJson(response); setBusy(false);
    if (!response.ok) { const message = errorMessage(result, "操作失敗"); options?.onFailure?.(message); if (!options?.onFailure) setError(message); return null; }
    closeDetail(); await load(); return result;
  }, [closeDetail, contractToken, load]);

  const loadObsoleteImpact = useCallback(async (row: CanonicalWorkbenchRowDto, notice = "") => {
    const entityType = row.entityType === "drawing" ? "drawing_number" : "part_number";
    setObsoleteImpact(null); setObsoleteError(notice); setObsoleteLoading(true);
    const params = new URLSearchParams({ entityType, entityCode: row.code });
    if (row.entityType === "part") params.set("entityId", row.entityId);
    try {
      const response = await fetch(`/api/lifecycle/obsolete-impact?${params.toString()}`, { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok) setObsoleteError(errorMessage(body, "無法取得作廢影響"));
      else { setObsoleteImpact((body as { impact: typeof obsoleteImpact }).impact); setObsoleteError(notice); }
    } catch { setObsoleteError("無法取得作廢影響"); }
    finally { setObsoleteLoading(false); }
  }, []);

  const onAction = useCallback(async (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => {
    if (busy) return;
    if (action.key === "request_obsolete") {
      setObsoleteRow(row); setObsoleteReason("");
      await loadObsoleteImpact(row);
      return;
    }
    if (!action.href) return;
    if (action.key === "edit" || action.key === "review") { router.push(action.href); return; }
    if (action.key === "advance" || action.key === "restart_from_current_production") {
      candidateTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setCandidateRow(row); setCandidateSourceRowKey(row.rowKey); setCandidateSourceRowVersion(row.rowVersion); setCandidates([]); setCandidateError(""); setCandidateRecovery(null); setManualRule(null); setCandidateMode("recommended"); setCandidateKind("rd"); setManualMinor(""); setBusy(true);
      const response = await fetch(action.href, { cache: "no-store" }); const body = await readJson(response); setBusy(false);
      if (!response.ok) setCandidateError(errorMessage(body, "無法取得可用版次"));
      else { const result = body as RevisionTargetResponse; setCandidateSourceRowKey(result.data.source.rowKey); setCandidateSourceRowVersion(result.data.source.rowVersion); setCandidates(result.data.candidates); setCandidateRecovery(result.data.recovery); setManualRule(result.data.manualRule); setCandidateKind(result.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled) ? "rd" : "production"); setContractToken(result.meta.contractToken); }
      return;
    }
    if (action.key === "void_rd" && !window.confirm(`核准後，${row.layerLabel} 將不再有效，這一系列研發版會從目前清單移除，且無法復原。確定送出申請？`)) return;
    const result = await command(row, action.href, action.key === "void_rd" ? { rowKey: row.rowKey } : {});
    if (action.key === "create_change" && result) {
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId && row.entityType === "part") router.push(`/parts/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
      if (workId && row.entityType === "drawing") router.push(`/numbering/drawings/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [busy, command, loadObsoleteImpact, router]);

  const requestObsolete = useCallback(async () => {
    if (!obsoleteRow || !obsoleteImpact || !obsoleteReason.trim() || busy) return;
    setBusy(true); setObsoleteError("");
    try {
      const response = await fetch("/api/lifecycle/obsolete-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ entityType: obsoleteImpact.entityType, entityId: obsoleteImpact.entityId, entityCode: obsoleteImpact.entityCode, impactFingerprint: obsoleteImpact.fingerprint, reason: obsoleteReason.trim() })
      });
      const body = await readJson(response);
      if (!response.ok) {
        const code = errorCode(body);
        if (code === "LIFE_OBSOLETE_SNAPSHOT_STALE" || code === "ROOT_OBSOLETE_SNAPSHOT_STALE") {
          await loadObsoleteImpact(obsoleteRow, "影響範圍已更新，請重新確認");
          return;
        }
        setObsoleteError(errorMessage(body, "作廢申請失敗"));
        return;
      }
      setObsoleteRow(null); setObsoleteImpact(null); setObsoleteReason(""); closeDetail(); await load();
    } catch { setObsoleteError("作廢申請失敗"); }
    finally { setBusy(false); }
  }, [busy, closeDetail, load, loadObsoleteImpact, obsoleteImpact, obsoleteReason, obsoleteRow]);

  const createRevision = useCallback(async () => {
    if (!candidateRow || !candidateSourceRowKey || candidateSourceRowVersion === null || !manualRule || candidateManualError || candidateMode === "recommended" && !candidates.some((candidate) => candidate.kind === candidateKind && candidate.enabled && candidate.candidateToken)) return;
    const href = `/api/pdm/drawings/${encodeURIComponent(candidateRow.entityId)}/revision-works`;
    const candidate = candidates.find((entry) => entry.kind === candidateKind && entry.enabled);
    const body = candidateMode === "manual_minor"
      ? { sourceRowKey: candidateSourceRowKey, selectionMode: "manual_minor", requestedMinor: Number(manualMinor) }
      : { sourceRowKey: candidateSourceRowKey, selectionMode: "recommended", candidateToken: candidate?.candidateToken };
    const result = await command({ ...candidateRow, rowKey: candidateSourceRowKey, rowVersion: candidateSourceRowVersion }, href, body, { onFailure: setCandidateError });
    if (result) {
      setCandidateRow(null); setCandidates([]);
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId) router.push(`/numbering/drawings/${encodeURIComponent(candidateRow.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [candidateKind, candidateManualError, candidateMode, candidateRow, candidateSourceRowKey, candidateSourceRowVersion, candidates, command, manualMinor, manualRule, router]);

  const resetRetiredUrl = useCallback(() => {
    const url = new URL(window.location.href);
    RETIRED_WORKBENCH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}`); setRetiredQuery(false);
  }, []);

  return <div className="canonical-workbench">
    <header className="canonical-workbench-header"><h1>{config.title}</h1><div className="canonical-workbench-header-actions"><CanonicalNumberingCreateAction surface={entityType} />{previewCapability ? <PdmWorkbenchLayoutSwitch value={layout} onChange={changeLayout} disabled={busy} /> : null}</div></header>
    <section className="canonical-toolbar" aria-label="清單篩選">
      <label className="canonical-search" htmlFor={searchId}><span>搜尋</span><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.searchPlaceholder} /></label>
      <PdmWorkbenchMultiSelectFilter label={config.layerFilterLabel} value={layer} options={config.layerOptions} onApply={(value) => setLayer(value)} />
      <PdmWorkbenchMultiSelectFilter label="處理" value={handling} options={HANDLING_OPTIONS} onApply={(value) => setHandling(value)} />
      {entityType === "drawing" ? <PdmWorkbenchMultiSelectFilter label="用途" value={purposeFilter} options={DRAWING_PURPOSE_OPTIONS} onApply={(value) => setPurposeFilter(value)} /> : null}
      {entityType === "part" ? <PdmWorkbenchMultiSelectFilter label="料件類型" value={itemKindFilter} options={CANONICAL_NUMBERING_ITEM_KIND_OPTIONS} onApply={(value) => setItemKindFilter(value)} /> : null}
      <PdmWorkbenchMultiSelectFilter label="系列" value={seriesFilter} options={seriesFilterOptions} searchable disabled={seriesOptionsLoading || seriesFilterOptions.length === 0} onApply={(value) => setSeriesFilter(value)} />
      {entityType === "part" ? <label className="canonical-domain-filter"><span>材質</span><input value={materialFilter} onChange={(event) => setMaterialFilter(event.target.value)} placeholder="代碼或名稱" /></label> : null}
      {entityType === "part" ? <label className="canonical-domain-filter"><span>顏色</span><input value={colorFilter} onChange={(event) => setColorFilter(event.target.value)} placeholder="代碼或名稱" /></label> : null}
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
      /> : <div ref={listRef} className="canonical-table-wrap" role="region" aria-label="工作台資料清單" tabIndex={0} aria-keyshortcuts={listKeyboard.shortcuts} onKeyDown={listKeyboard.handleKeyDown}><table><thead><tr><th aria-sort={sortBy === "code" ? sort === "asc" ? "ascending" : "descending" : undefined}><NumberSortHeader label="編號" direction={sort} active={sortBy === "code"} onToggle={() => { if (sortBy === "code") setSort((current) => current === "asc" ? "desc" : "asc"); else { setSortBy("code"); setSort("asc"); } }} /></th><th aria-sort={sortBy === "name" ? sort === "asc" ? "ascending" : "descending" : undefined}><NumberSortHeader label="品名" direction={sort} active={sortBy === "name"} onToggle={() => { if (sortBy === "name") setSort((current) => current === "asc" ? "desc" : "asc"); else { setSortBy("name"); setSort("asc"); } }} /></th><th>版本</th><th>資料狀態</th><th>處理</th></tr></thead><tbody>
        {groups.map((group) => group.rows.map((row, index) => <tr key={row.rowKey} data-canonical-workbench-row="true" data-row-key={row.rowKey} tabIndex={0} aria-selected={selectedRowKey === row.rowKey} className={`${index === 0 ? "is-group-first" : ""} is-${row.layer}${selectedRowKey === row.rowKey ? " is-selected" : ""}`} onClick={() => selectDetail(row.rowKey)}>
          <td><button type="button" className="canonical-row-open" onClick={(event) => { event.stopPropagation(); selectDetail(row.rowKey); }}>{row.code}</button>{index === 0 ? null : <span className="canonical-branch-mark" aria-label="同一編號的另一資料列">↳</span>}</td><td title={row.name || undefined}>{row.name || "—"}</td><td><span className={`canonical-layer is-${row.layer}`}>{row.layerLabel}</span></td><td><span className={`canonical-data-state is-${row.dataState}`}>{row.dataStateLabel}</span></td><td><span className={`canonical-handling is-${row.handling}`}>{row.handlingLabel}</span></td>
        </tr>))}
        {!loading && !groups.length && !error ? <tr><td colSpan={5} className="canonical-empty">沒有符合條件的資料</td></tr> : null}
      </tbody></table></div>}
      <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={() => { if (!previousCursor) return; const nextPageIndex = Math.max(0, pageIndex - 1); setPageIndex(nextPageIndex); replaceLocation({ cursor: previousCursor, direction: "before", pageIndex: nextPageIndex, historyMode: "push" }); void load(previousCursor, "before"); }} onNext={() => { if (!nextCursor) return; const nextPageIndex = pageIndex + 1; setPageIndex(nextPageIndex); replaceLocation({ cursor: nextCursor, direction: "after", pageIndex: nextPageIndex, historyMode: "push" }); void load(nextCursor, "after"); }} />
    </section>
    {detailKey ? <Drawer detail={detail} loading={detailLoading} error={detailError} width={drawerWidth} canManageAttachments={canManageAttachments} historyRevisionId={historyRevisionId} onHistoryRevisionChange={changeHistoryRevision} onStartResize={startDrawerResize} onClose={closeDetail} onAction={onAction} onManageAttachments={manageAttachments} onPartPreviewCommitted={partPreviewCommitted} onBeforeCreate={confirmDiscardMatrix} onMatrixSaved={() => { setMatrixDirty(false); if (detailKey) void openDetail(detailKey); }} onMatrixDirtyChange={setMatrixDirty} onOpenMatrixDrawing={openMatrixIdentity} onOpenMatrixPart={openMatrixIdentity} /> : null}
    {candidateRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal canonical-revision-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-advance-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setCandidateRow(null); }}><header><div><h2 id="canonical-advance-title">建立進版工作</h2><p>{candidateRow.code} · {candidateRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setCandidateRow(null)} disabled={busy}>關閉</button></header>{candidateError ? <p className="canonical-error" role="alert">{candidateError}</p> : null}{busy && !manualRule ? <p className="canonical-modal-status" role="status">正在取得可用版次…</p> : null}{manualRule?.enabled ? <div className="canonical-revision-choice" role="radiogroup" aria-label="進版方式"><label className={candidateMode === "recommended" ? "is-selected" : ""}><input type="radio" name="revision-selection-mode" value="recommended" checked={candidateMode === "recommended"} onChange={() => setCandidateMode("recommended")} /><span><strong>使用系統建議</strong><small>由伺服器選擇下一個未占用版次</small></span></label><label className={candidateMode === "manual_minor" ? "is-selected" : ""}><input type="radio" name="revision-selection-mode" value="manual_minor" checked={candidateMode === "manual_minor"} onChange={() => setCandidateMode("manual_minor")} /><span><strong>自訂研發小版</strong><small>主版次固定為 {manualRule.major}，只能輸入大於 {manualRule.minExclusive} 的小版次</small></span></label></div> : null}{manualRule?.enabled && candidateMode === "recommended" ? <div className="canonical-revision-targets" role="radiogroup" aria-label="伺服器建議版次">{candidates.map((candidate) => <label key={candidate.kind} className={`${candidateKind === candidate.kind ? "is-selected" : ""}${!candidate.enabled ? " is-disabled" : ""}`}><input type="radio" name="revision-target" value={candidate.kind} checked={candidateKind === candidate.kind} disabled={!candidate.enabled || busy} onChange={() => setCandidateKind(candidate.kind)} /><span><strong>{candidate.label}</strong><small>{candidate.reason || (candidate.kind === "rd" ? "建立研發版工作" : "採用為量產版，核准後才會成為正式量產基準")}</small></span></label>)}</div> : null}{manualRule?.enabled && candidateMode === "manual_minor" ? <label className="canonical-manual-minor"><span>研發版 {manualRule.major} .</span><input inputMode="numeric" pattern="[0-9]*" value={manualMinor} onChange={(event) => setManualMinor(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder={`大於 ${manualRule.minExclusive}`} aria-label="自訂研發小版次" /></label> : null}{candidateRecovery ? <div className="canonical-revision-recovery" role="alert"><span>這個研發分支的量產基準已更新，不能沿用舊分支進版。</span><button type="button" className="secondary-button" disabled={busy} onClick={async () => { setCandidateError(""); setManualRule(null); setCandidates([]); setBusy(true); const response = await fetch(candidateRecovery.targetsHref, { cache: "no-store" }); const body = await readJson(response); setBusy(false); if (!response.ok) setCandidateError(errorMessage(body, "無法取得目前量產版")); else { const result = body as RevisionTargetResponse; setCandidateSourceRowKey(result.data.source.rowKey); setCandidateSourceRowVersion(result.data.source.rowVersion); setCandidates(result.data.candidates); setCandidateRecovery(result.data.recovery); setManualRule(result.data.manualRule); setCandidateKind(result.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled) ? "rd" : "production"); setContractToken(result.meta.contractToken); } }}>{candidateRecovery.label}</button></div> : null}{manualRule?.enabled ? <div className="canonical-modal-actions"><button type="button" className="primary-button" disabled={busy || (candidateMode === "manual_minor" ? !manualMinor || Number(manualMinor) <= Number(manualRule.minExclusive) : !candidates.some((candidate) => candidate.kind === candidateKind && candidate.enabled && candidate.candidateToken))} onClick={() => void createRevision()}>{busy ? "建立中…" : "建立進版工作"}</button></div> : null}</section></div> : null}
    {obsoleteRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal canonical-obsolete-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-obsolete-title"><header><div><h2 id="canonical-obsolete-title">申請正式資料作廢</h2><p>{obsoleteRow.code} · {obsoleteRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setObsoleteRow(null)} disabled={busy}>關閉</button></header>{obsoleteLoading ? <><p role="status">正在讀取最新影響範圍…</p>{obsoleteError ? <p className="canonical-error" role="alert">{obsoleteError}</p> : null}</> : obsoleteError && !obsoleteImpact ? <p className="canonical-error" role="alert">{obsoleteError}</p> : obsoleteImpact ? <><p>影響項目：{obsoleteImpact.dependencies.length} 筆。送出前會再次驗證範圍；若資料已變更，系統會載入新範圍並要求重新確認。</p>{obsoleteImpact.dependencies.length ? <ul className="canonical-record-list">{obsoleteImpact.dependencies.map((dependency) => <li className="canonical-record" key={`${dependency.kind}:${dependency.id}`}><span>{dependency.code}</span><small>受影響項目</small></li>)}</ul> : <p className="canonical-empty">目前沒有其他受影響項目</p>}<label className="canonical-obsolete-reason"><span>作廢原因</span><textarea value={obsoleteReason} onChange={(event) => setObsoleteReason(event.target.value)} placeholder="請說明正式資料為何需要作廢" rows={3} /></label>{obsoleteError ? <p className="canonical-error" role="alert">{obsoleteError}</p> : null}<div className="canonical-modal-actions"><button type="button" className="primary-button" disabled={!obsoleteReason.trim() || busy} onClick={() => void requestObsolete()}>{busy ? "送出中…" : "送出作廢申請"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setObsoleteRow(null)}>取消</button></div></> : null}</section></div> : null}
  </div>;
}
