const retiredDrawingRevisionWorkFields = new Set(["title", "description"]);

/** JSON-safe payload stored in a Drawing revision work or review snapshot. */
export type DrawingRevisionWorkPayload = Record<string, unknown>;

export function sanitizeDrawingRevisionWorkPayload(value: unknown): DrawingRevisionWorkPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !retiredDrawingRevisionWorkFields.has(key))
  );
}
