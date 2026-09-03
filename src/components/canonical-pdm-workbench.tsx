"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { RETIRED_WORKBENCH_QUERY_KEYS } from "@/lib/pdm-canonical-workbench-contract";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { PdmWorkbenchMultiSelectFilter } from "@/components/pdm-workbench-multi-select-filter";
import { PdmWorkbenchLayoutSwitch } from "@/components/pdm-workbench-layout-switch";
import { PdmWorkbenchPagination } from "@/components/pdm-workbench-pagination";
import { CanonicalEntityPreviewGallery, CanonicalPreviewThumbnail } from "@/components/canonical-pdm-preview-gallery";
import { CanonicalPreviewPanel } from "@/components/canonical-preview-panel";
import { PartPreviewSourceControl } from "@/components/part-preview-source-control";
import { CanonicalPartPreviewSection } from "@/components/canonical-part-preview-section";
import { CanonicalRelationMatrixSection } from "@/components/canonical-relation-matrix-section";
import { CanonicalNumberingCreateAction } from "@/components/canonical-numbering-create-action";
import { NumberSortHeader } from "@/components/number-sort-header";
import { DRAWING_LAYOUT_STORAGE_KEY, PART_LAYOUT_STORAGE_KEY, normalizeCanonicalWorkbenchLayout, type CanonicalPreviewProjection, type CanonicalWorkbenchLayout } from "@/lib/pdm-canonical-preview";
import type { PartPreviewMutationResult } from "@/lib/pdm-part-preview";
import { parsePdmWorkbenchFilterSelectionForBrowser, serializePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { ACTIVE_DRAWING_PURPOSE_CODES, displayDrawingPurposeLabel, type ActiveDrawingPurposeCode } from "@/lib/numbering-identity";
import { normalizePdmDrawingReturnTo, normalizePdmPartReturnTo } from "@/lib/pdm-review-navigation";
import { CANONICAL_NUMBERING_ITEM_KIND_OPTIONS, type CanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import type {
  CanonicalHandling,
  CanonicalLayer,
  CanonicalWorkbenchSortField,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchDetailDto,
  CanonicalWorkbenchListDto,
  CanonicalWorkbenchRowDto,
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
    layerOptions: [{ value: "formal", label: "主檔" }, { value: "work", label: "修改中" }]
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
const CANONICAL_PREVIEW_STATES = new Set<CanonicalPreviewProjection["state"]>(["ready", "pending", "delayed", "missing", "failed", "unavailable"]);

function validatePreviewMapContract(
  groups: CanonicalWorkbenchListDto["data"]["groups"],
  previewByRowKey: Record<string, CanonicalPreviewProjection> | undefined
) {
  if (previewByRowKey === undefined) return null;
  const rows = groups.flatMap((group) => group.rows);
  const expectedKeys = rows.map((row) => row.rowKey);
  const expected = new Set(expectedKeys);
  if (expected.size !== expectedKeys.length) return "清單包含重複資料列識別碼";
  const actualKeys = Object.keys(previewByRowKey);
  if (actualKeys.length !== expected.size || actualKeys.some((key) => !expected.has(key))) return "預覽資料與清單資料列不一致";
  for (const key of actualKeys) {
    const preview = previewByRowKey[key];
    if (!preview || !CANONICAL_PREVIEW_STATES.has(preview.state)) return "預覽狀態無效";
    if (preview.state === "ready" ? !preview.media : preview.media !== null) return "預覽媒體狀態不一致";
  }
  return null;
}

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

function obsoleteRequestErrorMessage(body: unknown, entityType: "drawing" | "part") {
  const code = errorCode(body);
  const message = errorMessage(body, "作廢申請失敗");
  if (code === "Insufficient role permission" || code === "FORBIDDEN" || message === "Insufficient role permission") {
    const entityLabel = entityType === "part" ? "正式料號" : "正式圖號";
    const roleLabel = entityType === "part" ? "PDM 管理員或系統管理員" : "R&D 主管、PDM 管理員或系統管理員";
    return `目前登入角色沒有申請此${entityLabel}作廢的權限，請由${roleLabel}處理。`;
  }
  if (code === "LIFE_OBSOLETE_NOT_FORMAL" || message === "LIFE_OBSOLETE_NOT_FORMAL") {
    return "此資料尚未正式發行，不能申請作廢。「主檔」是工作台的資料層導覽錨點；請先確認生命週期為「已發布」後再申請。";
  }
  return message;
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

function readStoredLayout(storageKey: string) {
  try {
    return normalizeCanonicalWorkbenchLayout(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function writeStoredLayout(storageKey: string, layout: CanonicalWorkbenchLayout) {
  try { window.localStorage.setItem(storageKey, layout); } catch { /* session state remains authoritative */ }
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
    && detail?.data.row.entityType === "drawing"
    && Boolean(detail?.data.row.actions.some((action) => action.key === "edit_relation_matrix"));
  useEffect(() => { setMatrixEditing(false); }, [detail?.data.row.rowKey]);
  const relationAction = relationEditable && !matrixEditing
    ? <button type="button" className="secondary-button canonical-preview-relation-action" data-canonical-relation-edit="true" onClick={() => setMatrixEditing(true)}>編輯關聯</button>
    : null;
  const footerActions = detail?.data.row.actions.filter((action) => action.key !== "edit_relation_matrix") ?? [];
  const partPrimaryActions = footerActions.filter((action) => action.key === "edit" || action.key === "create_change" || action.key === "review");
  const partLifecycleActions = footerActions.filter((action) => !partPrimaryActions.includes(action));
  const renderAction = (action: CanonicalWorkbenchAction) => <button key={action.key} type="button" className={action.key === "cancel_work" ? "danger-button" : action.key === "void_rd" ? "secondary-button" : "primary-button"} onClick={() => onAction(detail!.data.row, action)}>{action.label}</button>;
  const footer = footerActions.length ? <div className="canonical-drawer-actions">{detail?.data.row.entityType === "part" ? <>{partPrimaryActions.map(renderAction)}{partLifecycleActions.length ? <details className="canonical-drawer-more-actions"><summary className="secondary-button">更多操作</summary><div>{partLifecycleActions.map(renderAction)}</div></details> : null}</> : footerActions.map(renderAction)}</div> : undefined;
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
       {presentation.kind === "drawing" ? <DrawingCanonicalPreview previews={presentation.previews} /> : null}
      {presentation.kind === "part" && presentation.preview ? <CanonicalPartPreviewSection
        partNumber={detail.data.row.code}
        preview={presentation.preview}
        control={presentation.previewSourceControl}
        mode="readonly"
        onCommitted={(result) => onPartPreviewCommitted(detail.data.row, result)}
      /> : null}
      {presentation.kind === "part" ? <section data-section="part-attachments"><div className="canonical-drawer-section-heading"><h3>附件</h3>{canManageAttachments ? <button type="button" className="secondary-button" onClick={() => onManageAttachments(detail.data.row)}>管理附件</button> : null}</div>{presentation.files.length ? <ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul> : <p className="canonical-empty">尚無附件</p>}</section> : presentation.files.length ? <section><h3>圖面檔案</h3><ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul></section> : null}
      {presentation.kind === "drawing" || presentation.kind === "part" ? <>
        <CanonicalRelationMatrixSection
        matrix={presentation.relationMatrix}
        contractToken={detail.meta.contractToken}
        mode={presentation.kind === "drawing" ? "manage" : "readonly"}
        editing={matrixEditing}
        onEditingChange={setMatrixEditing}
        editAction={relationAction}
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
  const [cancelWorkTarget, setCancelWorkTarget] = useState<{ row: CanonicalWorkbenchRowDto; action: CanonicalWorkbenchAction } | null>(null);
  const [cancelWorkError, setCancelWorkError] = useState("");
  const cancelWorkTriggerRef = useRef<HTMLElement | null>(null);
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
  const listPageRef = useRef<{ cursor: string | null; direction: "after" | "before" }>({ cursor: null, direction: "after" });
  const restoredPageRef = useRef<{ cursor: string | null; direction: "after" | "before" } | null>(null);
  const entryCommandKeysRef = useRef(new Map<string, string>());

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
    const storedLayout = rawLayout === null ? readStoredLayout(storageKey) : null;
    setLayout(rawLayout === null ? storedLayout ?? "list" : urlLayout ?? "list");
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

  useEffect(() => {
    if (!cancelWorkTarget) return;
    const modal = document.querySelector<HTMLElement>(".canonical-cancel-work-modal");
    if (!modal) return;
    const trigger = cancelWorkTriggerRef.current;
    const timer = window.setTimeout(() => modal.querySelector<HTMLButtonElement>(".secondary-button")?.focus(), 0);
    function handleFocusTrap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = [...modal!.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); modal!.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    modal.addEventListener("keydown", handleFocusTrap);
    return () => {
      window.clearTimeout(timer);
      modal.removeEventListener("keydown", handleFocusTrap);
      window.requestAnimationFrame(() => trigger?.focus());
    };
  }, [cancelWorkTarget]);

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

  const load = useCallback(async (cursor?: string | null, direction: "after" | "before" = "after", options?: { background?: boolean }) => {
    const background = options?.background === true;
    if (background && listAbortRef.current) return;
    const requestId = ++listRequestRef.current;
    if (!background) listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    if (!background) { setLoading(true); setError(""); }
    if (retiredQuery) {
      if (!background) { setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setError("此篩選網址已失效"); setLoading(false); }
      if (listRequestRef.current === requestId) listAbortRef.current = null;
      return;
    }
    const separator = listUrl.includes("?") ? "&" : "?";
    try {
      const response = await fetch(cursor ? `${listUrl}${separator}cursor=${encodeURIComponent(cursor)}&direction=${direction}` : listUrl, { cache: "no-store", signal: controller.signal });
      const body = await readJson(response);
      if (requestId !== listRequestRef.current) return;
      if (!response.ok) {
        const message = errorMessage(body, "清單載入失敗");
        setError(message);
        if (!background) { setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setLoading(false); }
        return;
      }
      const result = body as CanonicalWorkbenchListDto;
      const previewContractError = validatePreviewMapContract(result.data.groups, result.data.previewByRowKey);
      if (previewContractError) {
        setError(`預覽資料契約錯誤：${previewContractError}`);
        if (!background) setLoading(false);
        return;
      }
      listPageRef.current = { cursor: cursor ?? null, direction };
      setGroups(result.data.groups);
      const hasPreviewCapability = result.data.previewByRowKey !== undefined;
      setPreviewCapability(hasPreviewCapability);
      setPreviewByRowKey(result.data.previewByRowKey ?? {});
      if (!hasPreviewCapability) { setLayout("list"); replaceLocation({ layout: null }); }
      setNextCursor(result.data.nextCursor); setPreviousCursor(result.data.previousCursor); setContractToken(result.meta.contractToken); setLoading(false);
    } catch (requestError) {
      if (requestId !== listRequestRef.current || (requestError instanceof Error && requestError.name === "AbortError")) return;
      setError("清單載入失敗");
      if (!background) { setGroups([]); setNextCursor(null); setPreviousCursor(null); setPreviewByRowKey({}); setLoading(false); }
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

  const previewPollState = useMemo<"pending" | "delayed" | null>(() => {
    let hasPending = false;
    let hasDelayed = false;
    for (const row of groups.flatMap((group) => group.rows)) {
      const state = previewByRowKey[row.rowKey]?.state;
      if (state === "pending") hasPending = true;
      if (state === "delayed") hasDelayed = true;
    }
    return hasPending ? "pending" : hasDelayed ? "delayed" : null;
  }, [groups, previewByRowKey]);
  useEffect(() => {
    if (!previewCapability || (layout !== "list_3d" && layout !== "preview") || loading || error || !previewPollState) return;
    let active = true;
    let timer: number | null = null;
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const runPoll = async () => {
      if (!active || document.visibilityState !== "visible") return;
      await load(listPageRef.current.cursor, listPageRef.current.direction, { background: true });
      if (!active || document.visibilityState !== "visible") return;
      timer = window.setTimeout(runPoll, previewPollState === "pending" ? 2500 : 5000);
    };
    const handleVisibilityChange = () => {
      clearTimer();
      if (document.visibilityState === "visible") void runPoll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    timer = window.setTimeout(runPoll, previewPollState === "pending" ? 2500 : 5000);
    return () => {
      active = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [error, layout, load, loading, previewCapability, previewPollState]);

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
    writeStoredLayout(entityType === "drawing" ? DRAWING_LAYOUT_STORAGE_KEY : PART_LAYOUT_STORAGE_KEY, next);
    replaceLocation({ layout: next });
  }, [entityType, previewCapability]);
  const closeDetail = useCallback(() => {
    if (!confirmDiscardMatrix()) return;
    const focusKey = selectedRowKey ?? detailKey;
    detailRequestRef.current += 1;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    setDetailKey(null); setHistoryRevisionId(null); setDetail(null); setDetailLoading(false); setDetailError(""); setMatrixDirty(false); replaceLocation({ detail: null });
    window.requestAnimationFrame(() => {
      const target = focusKey ? [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? [])].find((element) => element.dataset.rowKey === focusKey) : null;
      (target ?? listRef.current)?.focus({ preventScroll: true });
    });
  }, [confirmDiscardMatrix, detailKey, selectedRowKey]);
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

  const command = useCallback(async (row: CanonicalWorkbenchRowDto, href: string, body: Record<string, unknown>, options?: { onFailure?: (message: string) => void; idempotencyKey?: string }) => {
    setBusy(true); setError("");
    const idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
    const request = async () => {
      const response = await fetch(href, {
        method: "POST", headers: { "content-type": "application/json", "if-match": `\"${row.rowVersion}\"`, "idempotency-key": idempotencyKey, "x-pdm-workbench-contract": contractToken }, body: JSON.stringify(body)
      });
      return { response, result: await readJson(response) };
    };
    try {
      let packet: Awaited<ReturnType<typeof request>>;
      try {
        packet = await request();
      } catch {
        // A lost response must be retried with the same key so a server-side
        // mutation is not duplicated. The exact row is refreshed if both
        // attempts fail, leaving the user with authoritative current state.
        try {
          packet = await request();
        } catch {
          try {
            await load();
            if (detailKey === row.rowKey) await openDetail(row.rowKey);
          } catch { /* preserve the original response-loss message */ }
          const message = "操作結果尚未確認，請重新整理清單確認目前狀態。";
          options?.onFailure?.(message); if (!options?.onFailure) setError(message); return null;
        }
      }
      const { response, result } = packet;
      if (!response.ok) { const message = errorMessage(result, "操作失敗"); options?.onFailure?.(message); if (!options?.onFailure) setError(message); return null; }
      closeDetail(); await load(); return result;
    } finally { setBusy(false); }
  }, [closeDetail, contractToken, detailKey, load, openDetail]);

  const loadObsoleteImpact = useCallback(async (row: CanonicalWorkbenchRowDto, notice = "") => {
    const entityType = row.entityType === "drawing" ? "drawing_number" : "part_number";
    setObsoleteImpact(null); setObsoleteError(notice); setObsoleteLoading(true);
    const params = new URLSearchParams({ entityType, entityCode: row.code });
    if (row.entityType === "part") params.set("entityId", row.entityId);
    try {
      const response = await fetch(`/api/lifecycle/obsolete-impact?${params.toString()}`, { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok) setObsoleteError(obsoleteRequestErrorMessage(body, row.entityType));
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
    if (action.key === "cancel_work") {
      if (!confirmDiscardMatrix()) return;
      setMatrixDirty(false);
      cancelWorkTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setCancelWorkTarget({ row, action }); setCancelWorkError("");
      return;
    }
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const safeReturnTo = row.entityType === "part" ? normalizePdmPartReturnTo(currentPath) : normalizePdmDrawingReturnTo(currentPath);
    const destinationWithReturn = (href: string, tab?: "data") => {
      const destination = new URL(href, window.location.href);
      if (safeReturnTo) destination.searchParams.set("returnTo", safeReturnTo);
      if (tab) destination.searchParams.set("tab", tab);
      return `${destination.pathname}${destination.search}${destination.hash}`;
    };
    if (action.key === "edit" || action.key === "review") { router.push(destinationWithReturn(action.href, row.entityType === "part" ? "data" : undefined)); return; }
    if (action.key === "advance" || action.key === "restart_from_current_production") {
      candidateTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setCandidateRow(row); setCandidateSourceRowKey(row.rowKey); setCandidateSourceRowVersion(row.rowVersion); setCandidates([]); setCandidateError(""); setCandidateRecovery(null); setManualRule(null); setCandidateMode("recommended"); setCandidateKind("rd"); setManualMinor(""); setBusy(true);
      const response = await fetch(action.href, { cache: "no-store" }); const body = await readJson(response); setBusy(false);
      if (!response.ok) setCandidateError(errorMessage(body, "無法取得可用版次"));
      else { const result = body as RevisionTargetResponse; setCandidateSourceRowKey(result.data.source.rowKey); setCandidateSourceRowVersion(result.data.source.rowVersion); setCandidates(result.data.candidates); setCandidateRecovery(result.data.recovery); setManualRule(result.data.manualRule); setCandidateKind(result.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled) ? "rd" : "production"); setContractToken(result.meta.contractToken); }
      return;
    }
    if (action.key === "void_rd" && !window.confirm(`核准後，${row.layerLabel} 將不再有效，這一系列研發版會從目前清單移除，且無法復原。確定送出申請？`)) return;
    const entryKey = action.key === "create_change"
      ? (entryCommandKeysRef.current.get(`${row.rowKey}:${row.rowVersion}`) ?? (() => { const key = crypto.randomUUID(); entryCommandKeysRef.current.set(`${row.rowKey}:${row.rowVersion}`, key); return key; })())
      : undefined;
    const result = await command(row, action.href, action.key === "void_rd" ? { rowKey: row.rowKey } : {}, { idempotencyKey: entryKey });
    if (action.key === "create_change" && result) {
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId && row.entityType === "part") router.push(destinationWithReturn(`/parts/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`, "data"));
      if (workId && row.entityType === "drawing") router.push(`/numbering/drawings/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
      if (!workId && row.entityType === "part") setError("修改工作已建立，料號資料尚未變更；請重新整理清單確認目前狀態。");
    }
  }, [busy, command, confirmDiscardMatrix, loadObsoleteImpact, router]);

  const cancelWork = useCallback(async () => {
    const target = cancelWorkTarget;
    if (!target?.action.href || busy) return;
    const result = await command(target.row, target.action.href, {}, { onFailure: setCancelWorkError });
    if (result) { setCancelWorkTarget(null); setCancelWorkError(""); }
  }, [busy, cancelWorkTarget, command]);

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
        setObsoleteError(obsoleteRequestErrorMessage(body, obsoleteRow.entityType));
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
    <header className="canonical-workbench-header"><h1>{config.title}</h1><div className="canonical-workbench-header-actions"><CanonicalNumberingCreateAction surface={entityType} /></div></header>
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
      {previewCapability ? <div className="canonical-result-display-bar" data-canonical-result-display-bar><span className="canonical-result-display-label">顯示方式</span><PdmWorkbenchLayoutSwitch value={layout} onChange={changeLayout} disabled={busy} /></div> : null}
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
           <td><span className={`canonical-code-cell${layout === "list_3d" ? " has-inline-preview" : ""}`}>{layout === "list_3d" && previewByRowKey[row.rowKey] ? <CanonicalPreviewThumbnail preview={previewByRowKey[row.rowKey]} density="inline" /> : null}<button type="button" className="canonical-row-open" onClick={(event) => { event.stopPropagation(); selectDetail(row.rowKey); }}>{row.code}</button>{index === 0 ? null : <span className="canonical-branch-mark" aria-label="同一編號的另一資料列">↳</span>}</span></td><td title={row.name || undefined}>{row.name || "—"}</td><td><span className={`canonical-layer is-${row.layer}`}>{row.layerLabel}</span></td><td><span className={`canonical-data-state is-${row.dataState}`}>{row.dataStateLabel}</span></td><td><span className={`canonical-handling is-${row.handling}`}>{row.handlingLabel}</span></td>
        </tr>))}
        {!loading && !groups.length && !error ? <tr><td colSpan={5} className="canonical-empty">沒有符合條件的資料</td></tr> : null}
      </tbody></table></div>}
      <PdmWorkbenchPagination pageIndex={pageIndex} hasPreviousPage={Boolean(previousCursor)} hasNextPage={Boolean(nextCursor)} loading={loading} onPrevious={() => { if (!previousCursor) return; const nextPageIndex = Math.max(0, pageIndex - 1); setPageIndex(nextPageIndex); replaceLocation({ cursor: previousCursor, direction: "before", pageIndex: nextPageIndex, historyMode: "push" }); void load(previousCursor, "before"); }} onNext={() => { if (!nextCursor) return; const nextPageIndex = pageIndex + 1; setPageIndex(nextPageIndex); replaceLocation({ cursor: nextCursor, direction: "after", pageIndex: nextPageIndex, historyMode: "push" }); void load(nextCursor, "after"); }} />
    </section>
    {detailKey ? <Drawer detail={detail} loading={detailLoading} error={detailError} width={drawerWidth} canManageAttachments={canManageAttachments} historyRevisionId={historyRevisionId} onHistoryRevisionChange={changeHistoryRevision} onStartResize={startDrawerResize} onClose={closeDetail} onAction={onAction} onManageAttachments={manageAttachments} onPartPreviewCommitted={partPreviewCommitted} onBeforeCreate={confirmDiscardMatrix} onMatrixSaved={() => { setMatrixDirty(false); if (detailKey) void openDetail(detailKey); }} onMatrixDirtyChange={setMatrixDirty} onOpenMatrixDrawing={openMatrixIdentity} onOpenMatrixPart={openMatrixIdentity} /> : null}
    {cancelWorkTarget ? <div className="canonical-modal-backdrop"><section className="canonical-modal canonical-cancel-work-modal" role="alertdialog" aria-modal="true" aria-labelledby="canonical-cancel-work-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setCancelWorkTarget(null); }}><header><div><h2 id="canonical-cancel-work-title">取消這次工作？</h2><p>{cancelWorkTarget.row.code} · {cancelWorkTarget.row.layerLabel}</p></div></header><p>未核准的變更與工作專屬檔案將永久刪除，無法復原；本次使用的編號不會回收或重新分配；既有正式資料（若有）不受影響。</p>{cancelWorkError ? <p className="canonical-error" role="alert">{cancelWorkError}</p> : null}<div className="canonical-modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setCancelWorkTarget(null)}>保留工作</button><button type="button" className="danger-button" disabled={busy} onClick={() => void cancelWork()}>{busy ? "取消中…" : "確認取消工作"}</button></div></section></div> : null}
    {candidateRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal canonical-revision-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-advance-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setCandidateRow(null); }}><header><div><h2 id="canonical-advance-title">建立進版工作</h2><p>{candidateRow.code} · {candidateRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setCandidateRow(null)} disabled={busy}>關閉</button></header>{candidateError ? <p className="canonical-error" role="alert">{candidateError}</p> : null}{busy && !manualRule ? <p className="canonical-modal-status" role="status">正在取得可用版次…</p> : null}{manualRule?.enabled ? <div className="canonical-revision-choice" role="radiogroup" aria-label="進版方式"><label className={candidateMode === "recommended" ? "is-selected" : ""}><input type="radio" name="revision-selection-mode" value="recommended" checked={candidateMode === "recommended"} onChange={() => setCandidateMode("recommended")} /><span><strong>使用系統建議</strong><small>由伺服器選擇下一個未占用版次</small></span></label><label className={candidateMode === "manual_minor" ? "is-selected" : ""}><input type="radio" name="revision-selection-mode" value="manual_minor" checked={candidateMode === "manual_minor"} onChange={() => setCandidateMode("manual_minor")} /><span><strong>自訂研發小版</strong><small>主版次固定為 {manualRule.major}，只能輸入大於 {manualRule.minExclusive} 的小版次</small></span></label></div> : null}{manualRule?.enabled && candidateMode === "recommended" ? <div className="canonical-revision-targets" role="radiogroup" aria-label="伺服器建議版次">{candidates.map((candidate) => <label key={candidate.kind} className={`${candidateKind === candidate.kind ? "is-selected" : ""}${!candidate.enabled ? " is-disabled" : ""}`}><input type="radio" name="revision-target" value={candidate.kind} checked={candidateKind === candidate.kind} disabled={!candidate.enabled || busy} onChange={() => setCandidateKind(candidate.kind)} /><span><strong>{candidate.label}</strong><small>{candidate.reason || (candidate.kind === "rd" ? "建立研發版工作" : "採用為量產版，核准後才會成為正式量產基準")}</small></span></label>)}</div> : null}{manualRule?.enabled && candidateMode === "manual_minor" ? <label className="canonical-manual-minor"><span>研發版 {manualRule.major} .</span><input inputMode="numeric" pattern="[0-9]*" value={manualMinor} onChange={(event) => setManualMinor(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder={`大於 ${manualRule.minExclusive}`} aria-label="自訂研發小版次" /></label> : null}{candidateRecovery ? <div className="canonical-revision-recovery" role="alert"><span>這個研發分支的量產基準已更新，不能沿用舊分支進版。</span><button type="button" className="secondary-button" disabled={busy} onClick={async () => { setCandidateError(""); setManualRule(null); setCandidates([]); setBusy(true); const response = await fetch(candidateRecovery.targetsHref, { cache: "no-store" }); const body = await readJson(response); setBusy(false); if (!response.ok) setCandidateError(errorMessage(body, "無法取得目前量產版")); else { const result = body as RevisionTargetResponse; setCandidateSourceRowKey(result.data.source.rowKey); setCandidateSourceRowVersion(result.data.source.rowVersion); setCandidates(result.data.candidates); setCandidateRecovery(result.data.recovery); setManualRule(result.data.manualRule); setCandidateKind(result.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled) ? "rd" : "production"); setContractToken(result.meta.contractToken); } }}>{candidateRecovery.label}</button></div> : null}{manualRule?.enabled ? <div className="canonical-modal-actions"><button type="button" className="primary-button" disabled={busy || (candidateMode === "manual_minor" ? !manualMinor || Number(manualMinor) <= Number(manualRule.minExclusive) : !candidates.some((candidate) => candidate.kind === candidateKind && candidate.enabled && candidate.candidateToken))} onClick={() => void createRevision()}>{busy ? "建立中…" : "建立進版工作"}</button></div> : null}</section></div> : null}
    {obsoleteRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal canonical-obsolete-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-obsolete-title"><header><div><h2 id="canonical-obsolete-title">申請正式資料作廢</h2><p>{obsoleteRow.code} · {obsoleteRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setObsoleteRow(null)} disabled={busy}>關閉</button></header>{obsoleteLoading ? <><p role="status">正在讀取最新影響範圍…</p>{obsoleteError ? <p className="canonical-error" role="alert">{obsoleteError}</p> : null}</> : obsoleteError && !obsoleteImpact ? <p className="canonical-error" role="alert">{obsoleteError}</p> : obsoleteImpact ? <><p>影響項目：{obsoleteImpact.dependencies.length} 筆。送出前會再次驗證範圍；若資料已變更，系統會載入新範圍並要求重新確認。</p>{obsoleteImpact.dependencies.length ? <ul className="canonical-record-list">{obsoleteImpact.dependencies.map((dependency) => <li className="canonical-record" key={`${dependency.kind}:${dependency.id}`}><span>{dependency.code}</span><small>受影響項目</small></li>)}</ul> : <p className="canonical-empty">目前沒有其他受影響項目</p>}<label className="canonical-obsolete-reason"><span>作廢原因</span><textarea value={obsoleteReason} onChange={(event) => setObsoleteReason(event.target.value)} placeholder="請說明正式資料為何需要作廢" rows={3} /></label>{obsoleteError ? <p className="canonical-error" role="alert">{obsoleteError}</p> : null}<div className="canonical-modal-actions"><button type="button" className="primary-button" disabled={!obsoleteReason.trim() || busy} onClick={() => void requestObsolete()}>{busy ? "送出中…" : "送出作廢申請"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setObsoleteRow(null)}>取消</button></div></> : null}</section></div> : null}
  </div>;
}
