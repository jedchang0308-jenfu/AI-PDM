import {
  DRAWING_OCR_POLICY,
  type DrawingOcrTextBlock
} from "@/lib/drawing-ocr-priority-policy";

export type DrawingOcrLayoutBbox = { x0: number; y0: number; x1: number; y1: number };
export type DrawingOcrLayoutLine = {
  text: string;
  confidence: number;
  bbox: DrawingOcrLayoutBbox;
  words?: Array<{ text: string; confidence: number; bbox: DrawingOcrLayoutBbox }>;
};
export type DrawingOcrLayoutBlock = { paragraphs?: Array<{ lines?: DrawingOcrLayoutLine[] }> };

function normalizedOcrLayoutText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function knownOcrLabels(value: string) {
  const normalized = normalizedOcrLayoutText(value);
  return DRAWING_OCR_POLICY.fields.flatMap((field) => field.aliases
    .filter((alias) => normalized.includes(alias))
    .map((alias) => ({ fieldKey: field.key, alias, normalized })));
}

export function buildDrawingOcrSpatialLayoutBlocks(input: {
  blocks: DrawingOcrLayoutBlock[] | null | undefined;
  pageNumber: number;
  canvasWidth: number;
  canvasHeight: number;
  fallbackConfidence: number;
  pageWidth?: number;
  pageHeight?: number;
  pageRotation?: number;
  producerSpace?: string;
}) {
  const pageWidth = Number(input.pageWidth ?? input.canvasWidth);
  const pageHeight = Number(input.pageHeight ?? input.canvasHeight);
  const pageRotation = Number(input.pageRotation ?? 0);
  const normalizeBox = (bbox: DrawingOcrLayoutBbox) => ({
    coordinateSpace: "normalized_page" as const,
    origin: "top_left" as const,
    x: Math.max(0, Math.min(1, bbox.x0 / input.canvasWidth)),
    y: Math.max(0, Math.min(1, bbox.y0 / input.canvasHeight)),
    width: Math.max(0, Math.min(1, (bbox.x1 - bbox.x0) / input.canvasWidth)),
    height: Math.max(0, Math.min(1, (bbox.y1 - bbox.y0) / input.canvasHeight)),
    pageWidth,
    pageHeight,
    pageRotation,
    producerSpace: input.producerSpace ?? "ocr_canvas"
  });
  const lines = (input.blocks ?? []).flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? [])
    .filter((line) => line.text?.trim() && line.bbox && Number.isFinite(line.bbox.x0) && Number.isFinite(line.bbox.y0));
  const lineBlocks: DrawingOcrTextBlock[] = lines.map((line, readingOrder) => ({
    text: line.text.trim(),
    pageNumber: input.pageNumber,
    readingOrder,
    source: "ocr",
    confidence: Number(line.confidence ?? input.fallbackConfidence),
    titleBlockOrTable: line.bbox.y0 >= input.canvasHeight * 0.55,
    geometry: {
      ...normalizeBox(line.bbox)
    }
  }));
  const labels = lines.flatMap((line) => {
    const lineText = normalizedOcrLayoutText(line.text);
    return knownOcrLabels(line.text)
      .filter((match) => lineText === match.alias || lineText.endsWith(match.alias))
      .map((match) => {
        const ratio = Math.max(0, lineText.lastIndexOf(match.alias)) / Math.max(1, lineText.length);
        return {
          ...match,
          line,
          x: line.bbox.x0 + Math.max(0, line.bbox.x1 - line.bbox.x0) * ratio,
          y: line.bbox.y0
        };
      });
  });
  const spatialBlocks: DrawingOcrTextBlock[] = [];
  for (const [index, label] of labels.entries()) {
    const rightBoundary = labels
      .filter((other) => other.x > label.x && Math.abs(other.y - label.y) <= 18)
      .reduce((nearest, other) => Math.min(nearest, other.x), Number.POSITIVE_INFINITY);
    const candidates = lines
      .filter((line) => {
        const verticalDrop = line.bbox.y0 - label.line.bbox.y0;
        return verticalDrop >= 2
          && verticalDrop <= 85
          && line.bbox.x0 >= label.x - 20
          && line.bbox.x0 < rightBoundary - 2
          && knownOcrLabels(line.text).length === 0;
      })
      .sort((left, right) => {
        const leftDistance = (left.bbox.y0 - label.line.bbox.y0) * 10 + Math.abs(left.bbox.x0 - label.x);
        const rightDistance = (right.bbox.y0 - label.line.bbox.y0) * 10 + Math.abs(right.bbox.x0 - label.x);
        return leftDistance - rightDistance;
      });
    const value = candidates[0];
    if (!value) continue;
    spatialBlocks.push({
      text: `${label.alias}: ${value.text.trim()}`,
      pageNumber: input.pageNumber,
      readingOrder: lineBlocks.length + index,
      source: "ocr",
      confidence: Math.min(Number(label.line.confidence ?? input.fallbackConfidence), Number(value.confidence ?? input.fallbackConfidence)),
      titleBlockOrTable: label.line.bbox.y0 >= input.canvasHeight * 0.55,
      geometry: normalizeBox({
        x0: Math.min(label.line.bbox.x0, value.bbox.x0),
        y0: Math.min(label.line.bbox.y0, value.bbox.y0),
        x1: Math.max(label.line.bbox.x1, value.bbox.x1),
        y1: Math.max(label.line.bbox.y1, value.bbox.y1)
      })
    });
  }
  return [...lineBlocks, ...spatialBlocks];
}
