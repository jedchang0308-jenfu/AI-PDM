import type {
  DrawingRecognitionAdapterCompletion,
  DrawingRecognitionCategory,
  DrawingRecognitionConfidence,
  DrawingRecognitionObservationInput
} from "@/lib/drawing-recognition-contract";

export type DrawingRecognitionWorkerSource = {
  id: string;
  fileAssetId: string;
  contentHash: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  mimeType: string;
  sourceRole: string;
  originalPath?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
};

export type DrawingRecognitionWorkerJob = {
  sessionId: string;
  companyId: string;
  sourceSetFingerprint: string;
  attemptCount: number;
  targetContext: {
    drawingId: string | null;
    drawingNumber: string | null;
    drawingRevisionId: string | null;
    revision: string | null;
    parts: Array<{ id: string; partNumber: string; partName: string; recordStatus: string }>;
  };
  sources: DrawingRecognitionWorkerSource[];
};

const A0005_3D_HASH = "e2060691a2e02c285d04c56d1d17da3ef40c9ae17fd2ee11d2ccf96e5f4328f2";
const A0005_2D_HASH = "0dc8d2b64736c67c035237d9dccf515a65c90a58c089029f801390ec7462337e";
const CATEGORIES = new Set<DrawingRecognitionCategory>([
  "identity_relation", "part_attribute", "drawing_revision", "controlled_note", "engineering_evidence", "unclassified"
]);
const CONFIDENCE = new Set<DrawingRecognitionConfidence>(["high", "medium", "low", "unknown"]);

export const BROWSER_PDF_OCR_ADAPTER_CODE = "browser-pdf-ocr.v1" as const;
export const SOLIDWORKS_NATIVE_ADAPTER_CODE = "native-metadata-bridge.v1" as const;

export function normalizedRecognitionSourceExtension(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/^\./u, "");
}

export function drawingRecognitionAdapterPlanForSource(source: { fileExt: string }) {
  const extension = normalizedRecognitionSourceExtension(source.fileExt);
  return [
    "filename.v1",
    ...(["sldprt", "sldasm", "slddrw"].includes(extension) ? [SOLIDWORKS_NATIVE_ADAPTER_CODE] : []),
    ...(extension === "pdf" ? [BROWSER_PDF_OCR_ADAPTER_CODE] : [])
  ];
}

export function isBrowserPdfRecognitionSource(source: { fileExt: string; mimeType: string }) {
  return normalizedRecognitionSourceExtension(source.fileExt) === "pdf" && String(source.mimeType ?? "").trim().toLowerCase() === "application/pdf";
}

function text(value: unknown, max = 4_000) {
  return String(value ?? "").trim().slice(0, max);
}

export function buildFilenameAdapterResult(source: DrawingRecognitionWorkerSource): DrawingRecognitionAdapterCompletion {
  if (isClearlyCorruptNativeSource(source)) {
    return {
      sourceId: source.id,
      adapterCode: "filename.v1",
      adapterVersion: "1.0.0",
      status: "failed",
      diagnostics: [`Native CAD source is too small to contain a valid document (${source.fileSize} bytes).`]
    };
  }
  const fileStem = source.fileName.replace(/\.[^.]+$/u, "");
  return {
    sourceId: source.id,
    adapterCode: "filename.v1",
    adapterVersion: "1.0.0",
    status: "succeeded",
    observations: [
      {
        rawText: source.fileName,
        rawValue: fileStem,
        normalizedValue: fileStem,
        locationKind: "filename",
        confidenceBand: "high",
        category: "identity_relation",
        fieldKey: "source_file_stem",
        fieldLabel: "來源檔名",
        applicabilityScope: source.sourceRole
      },
      {
        rawText: `${source.fileName} (${source.sourceRole})`,
        rawValue: source.sourceRole,
        normalizedValue: source.sourceRole,
        locationKind: "file_role",
        confidenceBand: "high",
        category: "identity_relation",
        fieldKey: "source_file_role",
        fieldLabel: "來源檔案角色",
        applicabilityScope: source.sourceRole
      }
    ]
  };
}

function isClearlyCorruptNativeSource(source: DrawingRecognitionWorkerSource) {
  const extension = source.fileExt.trim().toLowerCase().replace(/^\./u, "");
  return new Set(["slddrw", "sldprt", "sldasm"]).has(extension) && source.fileSize < 512;
}

function partObservation(partId: string, partNumber: string, fieldKey: string, fieldLabel: string, value: string, configurationName: string): DrawingRecognitionObservationInput {
  return {
    rawText: `${partNumber} ${fieldLabel}: ${value}`,
    rawValue: value,
    normalizedValue: value,
    locationKind: "configuration_property",
    configurationName,
    confidenceBand: "high",
    category: "part_attribute",
    fieldKey,
    fieldLabel,
    proposedOwnerType: "part_number",
    proposedOwnerId: partId,
    applicabilityScope: partNumber
  };
}

export function buildA0005FixtureResult(job: DrawingRecognitionWorkerJob, source: DrawingRecognitionWorkerSource): DrawingRecognitionAdapterCompletion | null {
  if (job.targetContext.drawingNumber !== "A0005-M01") return null;
  if (source.contentHash === A0005_3D_HASH) {
    const values: Record<string, { configuration: string; material: string; color: string }> = {
      "A0005-P01": { configuration: "P01", material: "SUS304", color: "無" },
      "A0005-P02": { configuration: "P02", material: "SUS301", color: "無" },
      "A0005-P03": { configuration: "P03", material: "SUS304", color: "黑" }
    };
    const observations = job.targetContext.parts.flatMap((part) => {
      const fixture = values[part.partNumber];
      if (!fixture) return [];
      return [
        partObservation(part.id, part.partNumber, "material", "材料", fixture.material, fixture.configuration),
        partObservation(part.id, part.partNumber, "surface_finish", "表面處理", "無", fixture.configuration),
        partObservation(part.id, part.partNumber, "color", "顏色", fixture.color, fixture.configuration),
        partObservation(part.id, part.partNumber, "variant_note", "變體備註", "無", fixture.configuration)
      ];
    });
    return {
      sourceId: source.id,
      adapterCode: "a0005-fixture-metadata.v1",
      adapterVersion: "1.0.0",
      status: observations.length > 0 ? "succeeded" : "failed",
      diagnostics: observations.length > 0 ? ["DEV-068 local fixture matched verified A0005 3D content hash."] : ["A0005 linked part targets were not available."],
      observations
    };
  }
  if (source.contentHash === A0005_2D_HASH) {
    const revisionId = job.targetContext.drawingRevisionId;
    const owner = { proposedOwnerType: "drawing_revision", proposedOwnerId: revisionId };
    return {
      sourceId: source.id,
      adapterCode: "a0005-fixture-drawing.v1",
      adapterVersion: "1.0.0",
      status: revisionId ? "succeeded" : "partial",
      diagnostics: ["DEV-068 local fixture matched verified A0005 2D content hash."],
      observations: [
        { rawText: "單位: mm", rawValue: "mm", locationKind: "title_block", pageNumber: 1, sheetName: "Sheet1", confidenceBand: "high", category: "drawing_revision", fieldKey: "unit", fieldLabel: "單位", ...owner },
        { rawText: "比例: 1:2", rawValue: "1:2", locationKind: "title_block", pageNumber: 1, sheetName: "Sheet1", confidenceBand: "high", category: "drawing_revision", fieldKey: "scale", fieldLabel: "比例", ...owner },
        { rawText: "去毛邊，銳角倒鈍", rawValue: "去毛邊，銳角倒鈍", locationKind: "general_note", pageNumber: 1, sheetName: "Sheet1", confidenceBand: "medium", category: "controlled_note", fieldKey: "general_note", fieldLabel: "受控備註", ...owner },
        { rawText: "表面符號 Ra 3.2", rawValue: "Ra 3.2", locationKind: "surface_symbol", pageNumber: 1, sheetName: "Sheet1", confidenceBand: "medium", category: "engineering_evidence", fieldKey: "surface_roughness", fieldLabel: "表面粗糙度證據", ...owner },
        { rawText: "OCR: REF-MOTOR-B", rawValue: "REF-MOTOR-B", locationKind: "ocr_text", pageNumber: 1, sheetName: "Sheet1", confidenceBand: "low", category: "unclassified", fieldKey: "ocr_unclassified", fieldLabel: "尚未歸類 OCR" }
      ]
    };
  }
  return null;
}

export function buildUnsupportedAdapterResult(sourceId: string, adapterCode: string, diagnostic: string): DrawingRecognitionAdapterCompletion {
  return { sourceId, adapterCode, adapterVersion: "1.0.0", status: "unsupported", diagnostics: [text(diagnostic, 300)] };
}

export function validateExternalAdapterResult(sourceId: string, adapterCode: string, value: unknown): DrawingRecognitionAdapterCompletion {
  if (!value || typeof value !== "object") throw new Error("EXTERNAL_RECOGNITION_OUTPUT_INVALID");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== "drawing-recognition-extractor.v1") throw new Error("EXTERNAL_RECOGNITION_SCHEMA_VERSION_INVALID");
  if (raw.adapter != null && raw.adapter !== adapterCode) throw new Error("EXTERNAL_RECOGNITION_ADAPTER_MISMATCH");
  const statuses = new Set(["succeeded", "partial", "unsupported", "failed", "timeout"]);
  const status = statuses.has(String(raw.status)) ? String(raw.status) as DrawingRecognitionAdapterCompletion["status"] : "failed";
  const observations = Array.isArray(raw.observations) ? raw.observations.slice(0, 1_000).map((item) => {
    const observation = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const category = CATEGORIES.has(observation.category as DrawingRecognitionCategory) ? observation.category as DrawingRecognitionCategory : "unclassified";
    const confidenceBand = CONFIDENCE.has(observation.confidenceBand as DrawingRecognitionConfidence) ? observation.confidenceBand as DrawingRecognitionConfidence : "unknown";
    return {
      rawText: text(observation.rawText, 8_000), rawValue: observation.rawValue == null ? null : text(observation.rawValue),
      normalizedValue: observation.normalizedValue == null ? null : text(observation.normalizedValue),
      locationKind: text(observation.locationKind, 80) || "external", pageNumber: Number.isInteger(observation.pageNumber) ? Number(observation.pageNumber) : null,
      sheetName: observation.sheetName == null ? null : text(observation.sheetName, 200), configurationName: observation.configurationName == null ? null : text(observation.configurationName, 200),
      geometry: observation.geometry && typeof observation.geometry === "object" && !Array.isArray(observation.geometry) ? observation.geometry as Record<string, unknown> : null,
      confidenceBand, category, fieldKey: observation.fieldKey == null ? null : text(observation.fieldKey, 120), fieldLabel: observation.fieldLabel == null ? null : text(observation.fieldLabel, 200),
      proposedOwnerType: observation.proposedOwnerType == null ? null : text(observation.proposedOwnerType, 80), proposedOwnerId: observation.proposedOwnerId == null ? null : text(observation.proposedOwnerId, 200),
      proposedOwnerResolution: observation.proposedOwnerResolution === "resolved" || observation.proposedOwnerResolution === "ambiguous" || observation.proposedOwnerResolution === "missing" ? observation.proposedOwnerResolution : undefined,
      applicabilityScope: text(observation.applicabilityScope, 120) || "overall"
    } satisfies DrawingRecognitionObservationInput;
  }).filter((item) => item.rawText) : [];
  return {
    sourceId,
    adapterCode,
    adapterVersion: text(raw.adapterVersion, 80) || "external",
    status,
    diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics.slice(0, 20).map((item) => text(item, 300)) : [],
    observations
  };
}
