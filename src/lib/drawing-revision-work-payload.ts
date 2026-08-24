const retiredDrawingRevisionWorkFields = new Set(["title", "description"]);

export function sanitizeDrawingRevisionWorkPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !retiredDrawingRevisionWorkFields.has(key))
  );
}
