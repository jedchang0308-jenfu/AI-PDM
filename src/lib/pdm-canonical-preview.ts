import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";

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
export type CanonicalWorkbenchLayout = "list" | "preview";

const THREE_D_EXTENSIONS = new Set(["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b", "sat", "stl", "jt"]);
const READY_DERIVATIVE_KINDS = new Set(["model_preview_png", "thumbnail_png"]);
const TWO_D_EXTENSIONS = new Set(["slddrw", "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"]);
const TWO_D_ROLES = ["drawing_2d", "drawing", "primary_drawing"] as const;
const READY_TWO_D_DERIVATIVE_KINDS = new Set(["drawing_pdf", "sheet_png", "thumbnail_png"]);
const PREVIEW_HEARTBEAT_STALE_AFTER_MS = 30_000;

type CanonicalTwoDDerivativeReference = Pick<CanonicalPreviewDerivativeJobRow,
  "sourceFileAssetId" | "sourceContentHash" | "derivativeKind" | "mimeType" | "generatorProfile" | "generatorVersion"
> & { status?: string };

export function normalizeCanonicalWorkbenchLayout(value: string | null | undefined): CanonicalWorkbenchLayout | null {
  return value === "list" || value === "preview" ? value : null;
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
  return rows
    .filter((row) => row.revisionId === revisionId && (TWO_D_ROLES.includes(row.role as (typeof TWO_D_ROLES)[number]) || TWO_D_EXTENSIONS.has(row.fileExt)))
    .sort((left, right) => twoDSourcePriority(left, derivatives) - twoDSourcePriority(right, derivatives)
      || Number(right.isPrimary) - Number(left.isPrimary)
      || Number(left.sortOrder) - Number(right.sortOrder)
      || left.bindingId.localeCompare(right.bindingId))[0] ?? null;
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
    sourceType: drawingNumber ? "primary_manufacturing_drawing" : "none",
    sourceLabel: drawingNumber ? sourceLabel : "無預覽來源",
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
    const heartbeat = Date.parse(latestJob.lastHeartbeatAt ?? "");
    const stale = !Number.isFinite(heartbeat) || Date.now() - heartbeat > PREVIEW_HEARTBEAT_STALE_AFTER_MS;
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
  if (source.fileExt === "pdf" && source.mimeType === "application/pdf") return 1;
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
