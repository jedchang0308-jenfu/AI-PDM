import crypto from "node:crypto";

/** Deterministic, lossless serialization for owner security readback evidence. */
export function canonicalPrincipalSource(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("PRINCIPAL_SOURCE_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPrincipalSource).join(",")}]`;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("PRINCIPAL_SOURCE_INVALID");
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalPrincipalSource(object[key])}`).join(",")}}`;
  }
  throw new Error("PRINCIPAL_SOURCE_INVALID");
}

export function orderedPrincipalSourceRows(rows: ReadonlyArray<Record<string, unknown>>) {
  if (!Array.isArray(rows)) throw new Error("PRINCIPAL_SOURCE_INVALID");
  return rows.map((row) => ({ row, encoded: canonicalPrincipalSource(row) }))
    .sort((a, b) => a.encoded < b.encoded ? -1 : a.encoded > b.encoded ? 1 : 0)
    .map(({ row }) => row);
}

export function hashPrincipalSource(value: unknown) {
  return crypto.createHash("sha256").update(canonicalPrincipalSource(value)).digest("hex");
}
