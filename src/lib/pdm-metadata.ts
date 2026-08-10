import type { ExtractorRuntimeProfile } from "@/lib/metadata-adapter-profile";
import { extractNativeCadMetadata } from "@/lib/pdm-metadata-adapter";
import { flattenMetadataObject, pickAliasedMetadataFields } from "@/lib/pdm-metadata-field-mapping";

export type PdmMetadata = {
  drawing_number: string;
  part_number: string;
  part_name: string;
  revision: string;
  product_line: string;
  customer: string;
  project_code: string;
  process_name: string;
  machine: string;
  material: string;
  surface_finish: string;
  document_type: string;
};

export type PdmMetadataSource = {
  field: keyof PdmMetadata;
  source: string;
  confidence: "high" | "medium" | "low";
};

export type PdmMetadataCandidate = PdmMetadataSource & {
  value: string;
  snippet: string;
  method: "ai_ocr";
};

export type PdmMetadataDetection = {
  metadata: PdmMetadata;
  sources: PdmMetadataSource[];
  candidates?: PdmMetadataCandidate[];
  propertyFiles: string[];
  uploadFiles: string[];
  nativeMetadataFiles: string[];
  warnings: string[];
  cadReferences?: Array<{
    sourceFilename: string;
    referencedFilename: string;
    referenceType: string;
    quantity: number;
    confidence: string;
  }>;
};

const EMPTY_METADATA: PdmMetadata = {
  drawing_number: "",
  part_number: "",
  part_name: "",
  revision: "",
  product_line: "",
  customer: "",
  project_code: "",
  process_name: "",
  machine: "",
  material: "",
  surface_finish: "",
  document_type: ""
};

const nativeSolidWorksExtensions = new Set(["sldprt", "sldasm", "slddrw"]);
const propertyFileExtensions = new Set(["json", "txt", "properties", "csv"]);
const submissionFileExtensions = new Set(["sldprt", "sldasm", "slddrw", "pdf", "dwg"]);
const maxPropertyFileBytes = 1024 * 1024;
const primaryFilePriority: Record<string, number> = {
  slddrw: 0,
  sldasm: 1,
  sldprt: 2,
  pdf: 3,
  dwg: 4
};

const aliases: Record<keyof PdmMetadata, string[]> = {
  product_line: ["product_line", "productline", "line", "product_family"],
  customer: ["customer", "client"],
  project_code: ["project_code", "project", "projectcode"],
  process_name: ["process_name", "process", "manufacturing_process"],
  machine: ["machine", "machine_type", "equipment"],
  drawing_number: ["drawing_number", "drawingnumber", "drawing_no", "drawingno", "drawing", "dwg_no", "dwgno", "??"],
  part_number: ["part_number", "partnumber", "part_no", "partno", "part", "??"],
  part_name: ["part_name", "partname", "name", "description", "??"],
  revision: ["revision", "rev", "?活"],
  material: ["material", "?釭"],
  surface_finish: ["surface_finish", "surfacefinish", "finish", "surface", "銵券??"],
  document_type: ["document_type", "documenttype", "type", "doctype", "doc_type", "?辣憿?"]
};

export function isMetadataSidecarFilename(filename: string) {
  const ext = getFileExtension(filename);
  if (!propertyFileExtensions.has(ext)) return false;
  const base = filename.toLowerCase();
  return base.includes("pdm") || base.includes("property") || base.includes("properties");
}

export async function detectPdmMetadata(
  files: File[],
  options: { metadataExtractor?: ExtractorRuntimeProfile } = {}
): Promise<PdmMetadataDetection> {
  const metadata: PdmMetadata = { ...EMPTY_METADATA };
  const sources: PdmMetadataSource[] = [];
  const warnings: string[] = [];
  const propertyFiles: string[] = [];
  const nativeMetadataFiles: string[] = [];
  const submissionFiles = files.filter((file) => submissionFileExtensions.has(getFileExtension(file.name)));
  const uploadFiles = submissionFiles.map((file) => file.name);

  const nativeExtractions = await extractNativeCadMetadata(files, { extractor: options.metadataExtractor });
  for (const extraction of nativeExtractions) {
    nativeMetadataFiles.push(extraction.source);
    warnings.push(...extraction.warnings);
    mergeMetadata(metadata, extraction.metadata, sources, extraction.source, "high");
  }

  for (const file of files) {
    if (!isMetadataSidecarFilename(file.name)) continue;
    propertyFiles.push(file.name);

    if (file.size > maxPropertyFileBytes) {
      warnings.push(`${file.name} is larger than 1 MB and was skipped as a metadata sidecar.`);
      continue;
    }

    const text = await file.text();
    const parsed = parsePropertyText(text, file.name);
    mergeMetadata(metadata, parsed, sources, file.name, "high");
  }

  const filenameHints = submissionFiles.map((file) => ({
    filename: file.name,
    metadata: inferMetadataFromFilename(file.name)
  }));
  warnings.push(...detectFilenameHintConflicts(filenameHints));

  const primaryFile = selectPrimaryMetadataFile(submissionFiles);
  if (primaryFile) {
    mergeMetadata(metadata, inferMetadataFromFilename(primaryFile.name), sources, primaryFile.name, "low");
  }

  if (files.some((file) => nativeSolidWorksExtensions.has(getFileExtension(file.name))) && nativeMetadataFiles.length === 0 && propertyFiles.length === 0) {
    warnings.push(
      "Native SolidWorks custom-property extraction requires SolidWorks Document Manager or an equivalent metadata adapter. This upload currently uses filename hints."
    );
  }

  return {
    metadata,
    sources,
    propertyFiles,
    uploadFiles,
    nativeMetadataFiles,
    warnings
  };
}

function mergeMetadata(
  target: PdmMetadata,
  next: Partial<PdmMetadata>,
  sources: PdmMetadataSource[],
  source: string,
  confidence: PdmMetadataSource["confidence"]
) {
  for (const key of Object.keys(EMPTY_METADATA) as Array<keyof PdmMetadata>) {
    const value = next[key]?.trim();
    if (!value || target[key]) continue;
    target[key] = value;
    sources.push({ field: key, source, confidence });
  }
}

function parsePropertyText(text: string, filename: string): Partial<PdmMetadata> {
  if (filename.toLowerCase().endsWith(".json")) {
    return parseJsonProperties(text);
  }
  return parseKeyValueProperties(text);
}

function parseJsonProperties(text: string): Partial<PdmMetadata> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") return {};

  const flat = flattenMetadataObject(parsed as Record<string, unknown>);
  return pickKnownFields(flat);
}

function parseKeyValueProperties(text: string): Partial<PdmMetadata> {
  const values: Record<string, unknown> = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : ",";
    const index = line.indexOf(separator);
    if (index <= 0) continue;

    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return pickKnownFields(values);
}

function pickKnownFields(values: Record<string, unknown>): Partial<PdmMetadata> {
  return pickAliasedMetadataFields(values, aliases);
}

function inferMetadataFromFilename(filename: string): Partial<PdmMetadata> {
  const ext = getFileExtension(filename);
  const stem = filename.replace(/\.[^.]+$/u, "");
  const inferred: Partial<PdmMetadata> = {
    document_type: documentTypeFromExtension(ext)
  };

  const revMatch = stem.match(/(?:^|[\s_-])(?:rev(?:ision)?|r)[\s_-]?([A-Za-z0-9.]+)(?:$|[\s_-])/iu);
  if (revMatch?.[1]) {
    inferred.revision = revMatch[1].toUpperCase();
    const beforeRev = stem.slice(0, revMatch.index).replace(/[\s_-]+$/u, "");
    if (beforeRev) {
      inferred.drawing_number = beforeRev;
      inferred.part_number = beforeRev;
    }
  } else {
    const trailingRevision = stem.match(/^(.+)[\s_-]([A-Z]\d{0,2}|\d{2})$/iu);
    if (trailingRevision?.[1] && trailingRevision[2]) {
      inferred.drawing_number = trailingRevision[1];
      inferred.part_number = trailingRevision[1];
      inferred.revision = trailingRevision[2].toUpperCase();
    }
  }

  if (!inferred.drawing_number && stem) {
    inferred.drawing_number = stem;
    inferred.part_number = stem;
  }

  return inferred;
}

function selectPrimaryMetadataFile(files: File[]) {
  return files
    .map((file, index) => ({
      file,
      index,
      priority: primaryFilePriority[getFileExtension(file.name)] ?? 99
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)[0]?.file;
}

function detectFilenameHintConflicts(hints: Array<{ filename: string; metadata: Partial<PdmMetadata> }>) {
  const warnings: string[] = [];
  const fields: Array<keyof PdmMetadata> = ["drawing_number", "part_number", "revision"];

  for (const field of fields) {
    const values = new Map<string, string[]>();
    for (const hint of hints) {
      const value = hint.metadata[field]?.trim();
      if (!value) continue;
      const key = value.toUpperCase();
      values.set(key, [...(values.get(key) ?? []), hint.filename]);
    }
    if (values.size > 1) {
      warnings.push(
        `conflicting_filename_hint:${field}:${Array.from(values.entries())
          .map(([value, filenames]) => `${value}=${filenames.join("|")}`)
          .join(";")}`
      );
    }
  }

  return warnings;
}

function documentTypeFromExtension(ext: string) {
  if (ext === "sldprt") return "Part";
  if (ext === "sldasm") return "Assembly";
  if (ext === "slddrw") return "Drawing";
  if (ext === "pdf") return "PDF";
  if (ext === "dwg") return "DWG";
  return "";
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}
