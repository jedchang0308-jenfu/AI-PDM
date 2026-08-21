import {
  DRAWING_OCR_POLICY,
  type DrawingOcrTextBlock
} from "@/lib/drawing-ocr-priority-policy";

export type DrawingPdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ExactLabel = PositionedText & {
  fieldKey: string;
  alias: string;
};

function normalizedText(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function normalizedMatchText(value: unknown) {
  return normalizedText(value).toLocaleLowerCase("en-US");
}

function exactLabel(item: PositionedText): ExactLabel | null {
  const value = normalizedMatchText(item.text);
  for (const field of DRAWING_OCR_POLICY.fields) {
    const alias = field.aliases.find((candidate) => candidate === value);
    if (alias) return { ...item, fieldKey: field.key, alias };
  }
  return null;
}

function geometry(items: PositionedText[], pageWidth: number, pageHeight: number, pageRotation: number) {
  const left = Math.min(...items.map((item) => item.x));
  const bottom = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const top = Math.max(...items.map((item) => item.y + item.height));
  return {
    coordinateSpace: "normalized_page" as const,
    origin: "top_left" as const,
    x: Math.max(0, Math.min(1, left / pageWidth)),
    y: Math.max(0, Math.min(1, 1 - top / pageHeight)),
    width: Math.max(0, Math.min(1, (right - left) / pageWidth)),
    height: Math.max(0, Math.min(1, (top - bottom) / pageHeight)),
    pageWidth,
    pageHeight,
    pageRotation,
    producerSpace: "pdf_points"
  };
}

function titleBlockPairs(items: PositionedText[], pageNumber: number, pageWidth: number, pageHeight: number, pageRotation: number, readingOrderStart: number) {
  const titleItems = items.filter((item) => item.y <= pageHeight * 0.42);
  const labels = titleItems.map(exactLabel).filter((item): item is ExactLabel => Boolean(item));
  const labelItems = new Set(labels.map((item) => `${item.x}\u0000${item.y}\u0000${item.text}`));
  const blocks: DrawingOcrTextBlock[] = [];
  for (const [index, label] of labels.entries()) {
    const rightBoundary = labels
      .filter((other) => other.x > label.x && Math.abs(other.y - label.y) <= 3)
      .reduce((nearest, other) => Math.min(nearest, other.x), Number.POSITIVE_INFINITY);
    const candidates = titleItems
      .filter((item) => {
        const verticalDrop = label.y - item.y;
        return verticalDrop >= -2
          && verticalDrop <= 24
          && item.x >= label.x + Math.min(4, Math.max(0, label.width * 0.25))
          && item.x < rightBoundary - 1
          && !labelItems.has(`${item.x}\u0000${item.y}\u0000${item.text}`);
      })
      .sort((left, right) => {
        const leftDrop = Math.max(0, label.y - left.y);
        const rightDrop = Math.max(0, label.y - right.y);
        return leftDrop * 3 + Math.max(0, left.x - label.x)
          - (rightDrop * 3 + Math.max(0, right.x - label.x));
      });
    const value = candidates[0];
    if (!value) continue;
    blocks.push({
      text: `${label.text}: ${value.text}`,
      pageNumber,
      readingOrder: readingOrderStart + index,
      source: "text_layer",
      confidence: 100,
      titleBlockOrTable: true,
      geometry: geometry([label, value], pageWidth, pageHeight, pageRotation)
    });
  }
  return blocks;
}

/**
 * Converts PDF.js text items into reading-order blocks. The title block is
 * treated as a two-dimensional form: labels and their values commonly live on
 * different baselines, so flattening the whole row would cross cell borders.
 */
export function buildDrawingPdfTextLayerBlocks(input: {
  items: DrawingPdfTextItem[];
  pageNumber: number;
  pageHeight: number;
  pageWidth?: number;
  pageRotation?: number;
}): DrawingOcrTextBlock[] {
  const positioned = input.items.flatMap((item) => {
    const text = normalizedText(item.str);
    const transform = Array.isArray(item.transform) ? item.transform : [];
    if (!text || transform.length < 6) return [];
    return [{
      text,
      x: Number(transform[4] ?? 0),
      y: Number(transform[5] ?? 0),
      width: Number(item.width ?? 0),
      height: Number(item.height ?? 0)
    } satisfies PositionedText];
  });
  const pageWidth = input.pageWidth ?? Math.max(1, ...positioned.map((item) => item.x + item.width));
  const pageRotation = Number(input.pageRotation ?? 0);
  const rows = new Map<number, PositionedText[]>();
  for (const item of positioned.filter((entry) => entry.y > input.pageHeight * 0.42)) {
    const rowKey = Math.round(item.y / 3) * 3;
    const row = rows.get(rowKey) ?? [];
    row.push(item);
    rows.set(rowKey, row);
  }
  const bodyBlocks = [...rows.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, row], readingOrder) => {
      const ordered = [...row].sort((left, right) => left.x - right.x);
      return {
        text: ordered.map((item) => item.text).join(" "),
        pageNumber: input.pageNumber,
        readingOrder,
        source: "text_layer" as const,
        confidence: 100,
        titleBlockOrTable: false,
        geometry: geometry(ordered, pageWidth, input.pageHeight, pageRotation)
      };
    });
  return [...bodyBlocks, ...titleBlockPairs(positioned, input.pageNumber, pageWidth, input.pageHeight, pageRotation, bodyBlocks.length)];
}
