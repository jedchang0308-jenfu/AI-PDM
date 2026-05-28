import type { PdmMetadata, PdmMetadataCandidate } from "@/lib/pdm-metadata";

const ocrSupportedExtensions = new Set(["pdf", "dwg", "png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"]);
const maxOcrProbeBytes = 2 * 1024 * 1024;
const ocrMarker = "AI_PDM_OCR:";

const aliases: Record<keyof PdmMetadata, string[]> = {
  product_line: ["product_line", "product line", "productline", "line", "產品線"],
  customer: ["customer", "client", "客戶"],
  project_code: ["project_code", "project code", "project", "專案"],
  process_name: ["process_name", "process name", "process", "製程"],
  machine: ["machine", "equipment", "機台"],
  drawing_number: ["drawing_number", "drawing number", "drawing no", "dwg no", "圖號"],
  part_number: ["part_number", "part number", "part no", "料號"],
  part_name: ["part_name", "part name", "description", "品名"],
  revision: ["revision", "rev", "版次"],
  material: ["material", "材質"],
  surface_finish: ["surface_finish", "surface finish", "finish", "表面處理"],
  document_type: ["document_type", "document type", "type", "文件類型"]
};

export async function detectAiOcrCandidates(files: File[]): Promise<{ candidates: PdmMetadataCandidate[]; warnings: string[] }> {
  const candidates: PdmMetadataCandidate[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const file of files.filter((item) => ocrSupportedExtensions.has(getFileExtension(item.name)))) {
    try {
      const text = await file.slice(0, maxOcrProbeBytes).text();
      const fileCandidates = [...parseMarkedOcrCandidates(text, file.name), ...parseKeyValueOcrCandidates(text, file.name)];
      for (const candidate of fileCandidates) {
        const key = `${candidate.field}:${candidate.value}:${candidate.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
      }
    } catch (error) {
      warnings.push(`AI/OCR candidate adapter failed for ${file.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return { candidates, warnings };
}

function parseMarkedOcrCandidates(text: string, filename: string): PdmMetadataCandidate[] {
  const line = text.split(/\r?\n/u).find((entry) => entry.includes(ocrMarker));
  if (!line) return [];
  const jsonText = line.slice(line.indexOf(ocrMarker) + ocrMarker.length).trim();
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object") return [];
  const value = parsed as Record<string, unknown>;
  const rawCandidates = Array.isArray(value.candidates) ? value.candidates : metadataToCandidates(value.metadata ?? value, filename);

  return rawCandidates
    .map((entry) => normalizeCandidate(entry, filename))
    .filter((entry): entry is PdmMetadataCandidate => Boolean(entry));
}

function metadataToCandidates(value: unknown, filename: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([field, rawValue]) => ({
    field,
    value: rawValue,
    confidence: "medium",
    source: filename,
    snippet: `${field}: ${String(rawValue ?? "")}`
  }));
}

function parseKeyValueOcrCandidates(text: string, filename: string): PdmMetadataCandidate[] {
  const candidates: PdmMetadataCandidate[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.includes(ocrMarker)) continue;
    const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : "";
    if (!separator) continue;
    const index = line.indexOf(separator);
    if (index <= 0) continue;
    const rawKey = line.slice(0, index).trim();
    const field = fieldFromAlias(rawKey);
    const value = line.slice(index + 1).trim();
    if (!field || !value) continue;
    candidates.push({
      field,
      value,
      confidence: "medium",
      source: `${filename}:ai-ocr`,
      snippet: line.slice(0, 160),
      method: "ai_ocr"
    });
  }
  return candidates;
}

function normalizeCandidate(entry: unknown, filename: string): PdmMetadataCandidate | null {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  const field = fieldFromAlias(String(value.field ?? value.name ?? ""));
  const candidateValue = String(value.value ?? value.text ?? "").trim();
  if (!field || !candidateValue) return null;
  const confidence = String(value.confidence ?? "medium");
  return {
    field,
    value: candidateValue,
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium",
    source: String(value.source ?? `${filename}:ai-ocr`).trim() || `${filename}:ai-ocr`,
    snippet: String(value.snippet ?? candidateValue).trim().slice(0, 180),
    method: "ai_ocr"
  };
}

function fieldFromAlias(rawKey: string): keyof PdmMetadata | null {
  const normalized = normalizeKey(rawKey);
  return (
    (Object.keys(aliases) as Array<keyof PdmMetadata>).find((candidate) =>
      aliases[candidate].some((alias) => normalizeKey(alias) === normalized || normalized.endsWith(`.${normalizeKey(alias)}`))
    ) ?? null
  );
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/gu, "")
    .replace(/[\s_-]+/gu, "");
}
