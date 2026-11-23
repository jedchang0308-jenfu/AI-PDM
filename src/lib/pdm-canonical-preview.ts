import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";
import { isPdfMediaCandidate, normalizeMediaType } from "@/lib/media-type";

export type CanonicalPreviewState = "ready" | "pending" | "delayed" | "missing" | "failed" | "unavailable";

export type CanonicalPreviewProjection = {
  state: CanonicalPreviewState;
  media: null | {
    mode: "image" | "document";
    href: string;
    fileName: string | null;
  };
  sourceType: "custom_image" | "primary_manufacturing_drawing" | "none";
  sourceLabel: string;
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  alt: string;
  hasPrimaryManufacturingDrawing?: boolean;
};

export type CanonicalPreviewSourceRow = {
  rowId: string;
  revisionId: string;
  dataLayer: "drawing_production" | "drawing_rd";
  reviewRequestId: string | null;
  bindingId: string;
  assetId: string;
  role: string;
  displayName: string;
  fileName: string;
  fileExt: string;
  mimeType: string;
  contentHash: string;
  isPrimary: number | boolean;
  sortOrder: number | string;
};

export type CanonicalPreviewDerivativeJobRow = {
  recordKind: "derivative" | "job";
  id: string | null;
  sourceFileAssetId: string;
  sourceContentHash: string;
  derivativeKind: string | null;
  storageKey: string | null;
  mimeType: string | null;
  generatorProfile: string | null;
  generatorVersion: string | null;
  status: string;
  createdAt: string | null;
  lastHeartbeatAt: string | null;
};

export const DRAWING_LAYOUT_STORAGE_KEY = "pdm-canonical-drawing-layout-v1" as const;
export const PART_LAYOUT_STORAGE_KEY = "pdm-canonical-part-layout-v1" as const;
export type CanonicalWorkbenchLayout = "list" | "list_3d" | "preview";

const THREE_D_EXTENSIONS = new Set(["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b", "sat", "stl", "jt"]);
const READY_DERIVATIVE_KINDS = new Set(["model_preview_png", "thumbnail_png"]);
const TWO_D_EXTENSIONS = new Set(["slddrw", "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"]);
const TWO_D_ROLES = ["drawing_2d", "drawing", "primary_drawing"] as const;
const READY_TWO_D_DERIVATIVE_KINDS = new Set(["drawing_pdf", "sheet_png", "thumbnail_png"]);
const PREVIEW_HEARTBEAT_STALE_AFTER_MS = 30_000;

export function previewJobWaitingState(status: string, lastHeartbeatAt: string | null) {
  const at = Date.parse(lastHeartbeatAt ?? "");
  const delayed = !Number.isFinite(at) || Date.now() - at > PREVIEW_HEARTBEAT_STALE_AFTER_MS;
  return {
    delayed,
    stateTitle: delayed ? status === "queued" ? "預覽工作尚未被接手" : "預覽處理已中斷" : status === "queued" ? "等待預覽服務" : "預覽產生中",
    stateText: delayed ? "請至 Windows 解析服務確認電腦連線與可處理項目，或下載原檔。" : status === "queued" ? "工作已排入佇列。" : "預覽服務正在處理。"
  };
}

type CanonicalTwoDDerivativeReference = Pick<CanonicalPreviewDerivativeJobRow,
  "sourceFileAssetId" | "sourceContentHash" | "derivativeKind" | "mimeType" | "generatorProfile" | "generatorVersion"
> & { status?: string };

export function normalizeCanonicalWorkbenchLayout(value: string | null | undefined): CanonicalWorkbenchLayout | null {
  return value === "list" || value === "list_3d" || value === "preview" ? value : null;
}

export function selectCanonicalThreeDSource(rows: readonly CanonicalPreviewSourceRow[], revisionId: string) {
  return rows
    .filter((row) => row.revisionId === revisionId && isThreeDSource(row))
    .sort((left, right) => sourcePriority(left) - sourcePriority(right)
      || Number(right.isPrimary) - Number(left.isPrimary)
      || Number(left.sortOrder) - Number(right.sortOrder)
      || left.bindingId.localeCompare(right.bindingId))[0] ?? null;
}

export function selectCanonicalTwoDSource(
  rows: readonly CanonicalPreviewSourceRow[],
  revisionId: string,
  derivatives: readonly CanonicalTwoDDerivativeReference[] = []
) {
  const candidates = rows.filter((row) => row.revisionId === revisionId
    && (TWO_D_ROLES.includes(row.role as (typeof TWO_D_ROLES)[number]) || TWO_D_EXTENSIONS.has(row.fileExt)));
  const pdfs = candidates.filter(isCanonicalPdfSource);
  const primaryPdfs = pdfs.filter((row) => Boolean(row.isPrimary));
  const preferredPdf = pdfs.length === 1 ? pdfs[0] : primaryPdfs.length === 1 ? primaryPdfs[0] : null;
  if (preferredPdf) return preferredPdf;
  // A stable sort is not evidence that one of several PDFs is the main drawing.
  return candidates
    .filter((row) => !isCanonicalPdfSource(row))
    .sort((left, right) => twoDSourcePriority(left, derivatives) - twoDSourcePriority(right, derivatives)
      || Number(right.isPrimary) - Number(left.isPrimary)
      || Number(left.sortOrder) - Number(right.sortOrder)
      || left.bindingId.localeCompare(right.bindingId))[0] ?? null;
}

function isCanonicalPdfSource(source: CanonicalPreviewSourceRow) {
  return isPdfMediaCandidate(source.fileExt, source.mimeType);
}

export type WorkspacePreviewFile = {
  id: string;
  role?: string;
  file_ext?: string;
  file_name?: string;
  display_name?: string;
  mime_type?: string;
  is_primary?: boolean | number;
  current_revision_upload?: boolean | number;
  source_file_asset_id?: string | null;
};

export function isWorkspacePdf(file: WorkspacePreviewFile) {
  const mime = normalizeMediaType(file.mime_type);
  if (isPdfMediaCandidate(file.file_ext || (/\.pdf$/iu.test(file.file_name || file.display_name || "") ? "pdf" : ""), mime)) return true;
  if (mime) return mime === "application/pdf";
  return file.file_ext?.toLowerCase().replace(/^\./u, "") === "pdf"
    || /\.pdf$/iu.test(file.file_name || file.display_name || "");
}

export function selectWorkspacePreviewSource<T extends WorkspacePreviewFile>(
  files: readonly T[], kind: "three-d" | "two-d", selectedBindingId?: string
) {
  const matchesKind = (file: T) => kind === "three-d"
    ? file.role === "cad_3d"
    : file.role !== "cad_3d" && (file.role === "drawing_2d" || file.role === "pdf" || isWorkspacePdf(file));
  const candidates = files.filter(matchesKind);
  const current = candidates.filter((file) => Boolean(file.current_revision_upload));
  const pdfs = kind === "two-d" ? current.filter(isWorkspacePdf) : [];
  const primaries = pdfs.filter((file) => Boolean(file.is_primary));
  const requiresChoice = pdfs.length > 1 && primaries.length !== 1;
  const selected = requiresChoice ? pdfs.find((file) => file.id === selectedBindingId) : null;
  const preferredPdf = selected ?? (pdfs.length === 1 ? pdfs[0] : primaries.length === 1 ? primaries[0] : null);
  // Previous-revision files remain references. A workspace must never label a
  // historical CAD or PDF as the source for the current revision.
  const fallback = current.find((file) => !isWorkspacePdf(file)) ?? null;
  return { file: requiresChoice ? selected ?? null : preferredPdf ?? fallback, pdfs, requiresChoice };
}

export function workspaceCurrentSourceAssetIds(files: readonly WorkspacePreviewFile[]) {
  return Array.from(new Set(files
    .filter((file) => Boolean(file.current_revision_upload))
    .map((file) => file.source_file_asset_id)
    .filter((id): id is string => Boolean(id))));
}

export function resolveCanonicalDrawingPreview(input: {
  source: CanonicalPreviewSourceRow | null;
  derivativeJobs: readonly CanonicalPreviewDerivativeJobRow[];
  identity?: {
    drawingNumber?: string | null;
    revision?: string | null;
    alt?: string | null;
    sourceLabel?: string | null;
  };
}): CanonicalPreviewProjection {
  const source = input.source;
  const drawingNumber = input.identity?.drawingNumber?.trim() || null;
  const revision = input.identity?.revision?.trim() || null;
  const alt = input.identity?.alt?.trim() || `${drawingNumber ?? "圖面"} 預覽圖`;
  const sourceLabel = input.identity?.sourceLabel?.trim() || "主要製造圖";
  if (!source) return {
    state: "missing",
    media: null,
    sourceType: "none",
    sourceLabel: "無預覽來源",
    sourceDrawingNumber: drawingNumber,
    sourceRevision: revision,
    alt
  };
  const fileName = source.displayName || source.fileName || null;
  const base = {
    sourceType: "primary_manufacturing_drawing" as const,
    sourceLabel,
    sourceDrawingNumber: drawingNumber,
    sourceRevision: revision,
    alt
  };
  if (!source.contentHash) return { state: "unavailable", media: null, ...base };

  const matching = input.derivativeJobs.filter((row) => row.sourceFileAssetId === source.assetId && row.sourceContentHash === source.contentHash);
  const ready = matching
    .filter((row) => row.recordKind === "derivative" && row.status === "ready" && Boolean(row.id && row.storageKey)
      && Boolean(row.mimeType?.toLowerCase() === "image/png") && READY_DERIVATIVE_KINDS.has(row.derivativeKind ?? "")
      && !isFakePreview(row))
    .sort((left, right) => Number(right.derivativeKind === "model_preview_png") - Number(left.derivativeKind === "model_preview_png")
      || String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? "")))[0];
  if (ready?.id) {
    const context = source.dataLayer === "drawing_rd" ? "candidate_revision" : "drawing_revision";
    const href = pdmFileReadHref({
      fileAssetId: source.assetId,
      context,
      contextId: source.revisionId,
      bindingId: source.bindingId,
      reviewRequestId: source.reviewRequestId
    });
    return {
      state: "ready",
      media: { mode: "image", href: appendQuery(href, "previewDerivative", ready.id), fileName },
      ...base
    };
  }

  const latestJob = matching
    .filter((row) => row.recordKind === "job")
    .sort((left, right) => String(right.lastHeartbeatAt ?? "").localeCompare(String(left.lastHeartbeatAt ?? "")))[0];
  if (latestJob?.status === "queued" || latestJob?.status === "running") {
    const stale = previewJobWaitingState(latestJob.status, latestJob.lastHeartbeatAt).delayed;
    return { state: stale ? "delayed" : "pending", media: null, ...base };
  }
  if (latestJob && ["failed", "skipped", "cancelled"].includes(latestJob.status)) {
    return { state: "failed", media: null, ...base };
  }

  const rejectedDerivative = matching.some((row) => row.recordKind === "derivative"
    && (!isFakePreview(row) || row.status !== "ready" || row.derivativeKind !== null));
  const hasAnyArtifactOrJob = matching.length > 0;
  return { state: rejectedDerivative || (hasAnyArtifactOrJob && !latestJob) ? "unavailable" : "missing", media: null, ...base };
}

export function buildCanonicalDrawingPreviewMap(input: {
  rows: readonly { id: string; revisionId: string | null; revision?: string | null; dataLayer: string; code?: string }[];
  sources: readonly CanonicalPreviewSourceRow[];
  derivativeJobs: readonly CanonicalPreviewDerivativeJobRow[];
}) {
  const result: Record<string, CanonicalPreviewProjection> = {};
  for (const row of input.rows) {
    if (row.dataLayer !== "drawing_production" && row.dataLayer !== "drawing_rd") continue;
    result[`cw_${row.id}`] = resolveCanonicalDrawingPreview({
      source: row.revisionId ? selectCanonicalThreeDSource(input.sources, row.revisionId) : null,
      derivativeJobs: input.derivativeJobs,
      identity: {
        drawingNumber: row.code,
        revision: row.revision,
        sourceLabel: "3D 模型",
        alt: `${row.code ?? "圖面"} 3D 預覽圖`
      }
    });
  }
  return result;
}

function isThreeDSource(row: CanonicalPreviewSourceRow) {
  const role = row.role.trim().toLowerCase();
  const ext = row.fileExt.replace(/^\./u, "").toLowerCase();
  return role === "cad_3d" || role === "cad3d" || role === "model" || THREE_D_EXTENSIONS.has(ext);
}

function sourcePriority(row: CanonicalPreviewSourceRow) {
  const role = row.role.trim().toLowerCase();
  if (role === "cad_3d") return 0;
  if (role === "cad3d") return 1;
  if (role === "model") return 2;
  return 3;
}

function twoDSourcePriority(
  source: CanonicalPreviewSourceRow,
  derivatives: readonly CanonicalTwoDDerivativeReference[]
) {
  const hasCurrentDerivative = derivatives.some((derivative) => derivative.sourceFileAssetId === source.assetId
    && derivative.sourceContentHash === source.contentHash
    && (derivative.status === undefined || derivative.status === "ready")
    && READY_TWO_D_DERIVATIVE_KINDS.has(derivative.derivativeKind ?? "")
    && !isFakePreview(derivative));
  if (hasCurrentDerivative) return 0;
  const rolePriority = TWO_D_ROLES.indexOf(source.role as (typeof TWO_D_ROLES)[number]);
  return rolePriority >= 0 ? rolePriority + 2 : 5;
}

function isFakePreview(row: Pick<CanonicalPreviewDerivativeJobRow, "generatorProfile" | "generatorVersion">) {
  return row.generatorProfile === "fake_preview_worker" || row.generatorVersion === "fake-local-pipeline";
}

function appendQuery(href: string, key: string, value: string) {
  const url = new URL(href, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
